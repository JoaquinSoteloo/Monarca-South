import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getServerSession } from "@/lib/auth/session"
import { tienePermiso } from "@/lib/permisos"
import { historialParaApi, promptSistema, textoDeRespuesta, type MensajeGuardado } from "@/lib/asistente"
import { HERRAMIENTAS, ejecutarHerramienta } from "@/lib/asistente-herramientas"
import { registrarUso, tokensDe } from "@/lib/ia-uso"

// Asistente de cultivo (pantalla Sede). Responde desde el servidor con la clave
// de Vercel (nunca va al navegador):
//   - OPENAI_API_KEY (lo que cargó Joaquín, 03/11/2026) → OpenAI, modelo OPENAI_MODEL.
//   - Si no está, ANTHROPIC_API_KEY → Anthropic, modelo ANTHROPIC_MODEL.
// Cada persona tiene su conversación en public.asistente_mensajes (script 088).
// Cada vuelta al modelo queda en ia_uso (script 103). El system y las
// herramientas van primero y no cambian: el proveedor los cobra del caché.

const MODELO_OPENAI = process.env.OPENAI_MODEL || "gpt-5.4-mini"
const MODELO_ANTHROPIC = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5"
const MAX_VUELTAS_HERRAMIENTAS = 5

type Bloque = { type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }

const hoyAR = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" })

export async function GET() {
  const session = await getServerSession()
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  // El asistente es de la pantalla Sede (permiso sede.ver, lib/permisos.ts):
  // cada pregunta tiene costo en la cuenta de OpenAI.
  if (!tienePermiso(session.permisos, "sede.ver")) {
    return NextResponse.json({ error: "Tu rol no tiene acceso a la Sede" }, { status: 403 })
  }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("asistente_mensajes")
    .select("rol, cuerpo, created_at")
    .order("created_at", { ascending: false })
    .limit(60)
  if (error) return NextResponse.json({ mensajes: [], aviso: "Falta correr el script 088." })
  return NextResponse.json({ mensajes: (data ?? []).reverse() })
}

export async function POST(request: Request) {
  const session = await getServerSession()
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  // El asistente es de la pantalla Sede (permiso sede.ver, lib/permisos.ts):
  // cada pregunta tiene costo en la cuenta de OpenAI.
  if (!tienePermiso(session.permisos, "sede.ver")) {
    return NextResponse.json({ error: "Tu rol no tiene acceso a la Sede" }, { status: 403 })
  }

  const body = (await request.json().catch(() => null)) as { mensaje?: string } | null
  const pregunta = body?.mensaje?.trim().slice(0, 4000)
  if (!pregunta) return NextResponse.json({ error: "Escribí una pregunta" }, { status: 400 })

  const claveOpenAI = process.env.OPENAI_API_KEY
  const claveAnthropic = process.env.ANTHROPIC_API_KEY
  if (!claveOpenAI && !claveAnthropic) {
    return NextResponse.json(
      { error: "El asistente todavía no está activado: falta cargar OPENAI_API_KEY en Vercel." },
      { status: 503 },
    )
  }

  const supabase = await createClient()
  const { error: errGuardar } = await supabase.from("asistente_mensajes").insert({ rol: "user", cuerpo: pregunta })
  const { data: previos } = await supabase
    .from("asistente_mensajes")
    .select("rol, cuerpo")
    .order("created_at", { ascending: false })
    .limit(16)
  const historial = errGuardar
    ? [{ role: "user" as const, content: pregunta }]
    : historialParaApi(((previos ?? []) as MensajeGuardado[]).reverse())

  const sistema = promptSistema(session.nombre, hoyAR())
  const ejecutar = (nombre: string, input: Record<string, unknown>) => ejecutarHerramienta(supabase, nombre, input)
  let respuesta = ""
  try {
    const r = claveOpenAI
      ? await responderOpenAI(claveOpenAI, sistema, historial, ejecutar)
      : await responderAnthropic(claveAnthropic as string, sistema, historial, ejecutar)
    if ("error" in r) return NextResponse.json({ error: r.error }, { status: 502 })
    respuesta = r.texto
  } catch (e) {
    console.error("asistente: fallo de red", e)
    return NextResponse.json({ error: "El asistente no pudo responder ahora." }, { status: 502 })
  }

  respuesta = respuesta || "No pude armar una respuesta. Probá preguntarlo de otra forma o consultale a Lucho."
  if (!errGuardar) await supabase.from("asistente_mensajes").insert({ rol: "assistant", cuerpo: respuesta.slice(0, 12000) })
  return NextResponse.json({ respuesta })
}

type Ejecutor = (nombre: string, input: Record<string, unknown>) => Promise<unknown>
type Historial = { role: "user" | "assistant"; content: string }[]
type Resultado = { texto: string } | { error: string }

const errorApi = async (proveedor: string, r: Response): Promise<Resultado> => {
  const detalle = await r.text().catch(() => "")
  console.error(`asistente: error de ${proveedor}`, r.status, detalle.slice(0, 300))
  return { error: r.status === 429 ? "Hay muchas consultas seguidas. Probá en un minuto." : "El asistente no pudo responder ahora." }
}

/** OpenAI Chat Completions con herramientas (function calling). */
async function responderOpenAI(clave: string, sistema: string, historial: Historial, ejecutar: Ejecutor): Promise<Resultado> {
  type MensajeOpenAI = Record<string, unknown>
  const mensajes: MensajeOpenAI[] = [{ role: "system", content: sistema }, ...historial]
  const tools = HERRAMIENTAS.map((h) => ({
    type: "function",
    function: { name: h.name, description: h.description, parameters: h.input_schema },
  }))
  for (let vuelta = 0; vuelta <= MAX_VUELTAS_HERRAMIENTAS; vuelta++) {
    const inicio = Date.now()
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${clave}` },
      body: JSON.stringify({
        model: MODELO_OPENAI,
        messages: mensajes,
        max_completion_tokens: 1500,
        prompt_cache_key: "monarca-asistente",
        ...(vuelta < MAX_VUELTAS_HERRAMIENTAS ? { tools } : {}),
      }),
    })
    if (!r.ok) {
      await registrarUso({ funcion: "asistente", modelo: MODELO_OPENAI, tokensEntrada: null, tokensCache: null, tokensSalida: null, latenciaMs: Date.now() - inicio, ok: false })
      return errorApi("OpenAI", r)
    }
    const data = (await r.json()) as {
      model?: string
      usage?: unknown
      choices: { message: { content: string | null; tool_calls?: { id: string; function: { name: string; arguments: string } }[] } }[]
    }
    const t = tokensDe(data.usage)
    await registrarUso({ funcion: "asistente", modelo: data.model ?? MODELO_OPENAI, tokensEntrada: t.entrada, tokensCache: t.cache, tokensSalida: t.salida, latenciaMs: Date.now() - inicio, ok: true })
    const msg = data.choices?.[0]?.message
    if (!msg) return { texto: "" }
    if (!msg.tool_calls?.length) return { texto: (msg.content ?? "").trim() }
    mensajes.push({ role: "assistant", content: msg.content ?? "", tool_calls: msg.tool_calls })
    for (const t of msg.tool_calls) {
      let input: Record<string, unknown> = {}
      try {
        input = JSON.parse(t.function.arguments || "{}")
      } catch {
        input = {}
      }
      mensajes.push({ role: "tool", tool_call_id: t.id, content: JSON.stringify(await ejecutar(t.function.name, input)) })
    }
  }
  return { texto: "" }
}

/** Anthropic Messages con herramientas. */
async function responderAnthropic(clave: string, sistema: string, historial: Historial, ejecutar: Ejecutor): Promise<Resultado> {
  const mensajes: { role: "user" | "assistant"; content: string | Bloque[] | Record<string, unknown>[] }[] = [...historial]
  for (let vuelta = 0; vuelta <= MAX_VUELTAS_HERRAMIENTAS; vuelta++) {
    const inicio = Date.now()
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": clave, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: MODELO_ANTHROPIC,
        max_tokens: 1500,
        system: [{ type: "text", text: sistema, cache_control: { type: "ephemeral" } }],
        tools: HERRAMIENTAS,
        messages: mensajes,
      }),
    })
    if (!r.ok) {
      await registrarUso({ funcion: "asistente", modelo: MODELO_ANTHROPIC, tokensEntrada: null, tokensCache: null, tokensSalida: null, latenciaMs: Date.now() - inicio, ok: false })
      return errorApi("Anthropic", r)
    }
    const data = (await r.json()) as { model?: string; usage?: unknown; content: Bloque[]; stop_reason: string }
    const t = tokensDe(data.usage)
    await registrarUso({ funcion: "asistente", modelo: data.model ?? MODELO_ANTHROPIC, tokensEntrada: t.entrada, tokensCache: t.cache, tokensSalida: t.salida, latenciaMs: Date.now() - inicio, ok: true })
    if (data.stop_reason !== "tool_use" || vuelta === MAX_VUELTAS_HERRAMIENTAS) return { texto: textoDeRespuesta(data.content) }
    mensajes.push({ role: "assistant", content: data.content })
    const resultados = await Promise.all(
      data.content
        .filter((b) => b.type === "tool_use")
        .map(async (b) => ({ type: "tool_result", tool_use_id: b.id, content: JSON.stringify(await ejecutar(b.name ?? "", b.input ?? {})) })),
    )
    mensajes.push({ role: "user", content: resultados })
  }
  return { texto: "" }
}
