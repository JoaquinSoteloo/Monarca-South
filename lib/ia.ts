// Pedido simple a un modelo de lenguaje (sin herramientas), con la clave de
// Vercel: OpenAI si está OPENAI_API_KEY, si no Anthropic. Lo usan los textos
// que arma Nubi (resumen semanal) y sus decisiones. Devuelve null si no hay
// clave o falla: quien lo llama tiene que tener un respaldo.
// Cada llamada queda en ia_uso (lib/ia-uso.ts, script 103).
// Caché del prompt (14/11/2026): el system va primero y no cambia entre
// llamadas, así el proveedor reusa esa parte y la cobra mucho menos.
// Solo servidor: las claves nunca van al navegador.
import { registrarUso, tokensDe, type FuncionIA } from "@/lib/ia-uso"

const MODELO_OPENAI = process.env.OPENAI_MODEL || "gpt-5.4-mini"
const MODELO_ANTHROPIC = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5"

/** System de Anthropic marcado para caché. */
const systemConCache = (sistema: string) => [{ type: "text", text: sistema, cache_control: { type: "ephemeral" } }]

export async function completar(sistema: string, mensaje: string, maxTokens = 900, funcion: FuncionIA = "otra"): Promise<string | null> {
  const claveOpenAI = process.env.OPENAI_API_KEY
  const claveAnthropic = process.env.ANTHROPIC_API_KEY
  const inicio = Date.now()
  let modelo: string | null = null
  let usage: unknown = null
  let texto: string | null = null
  try {
    if (claveOpenAI) {
      modelo = MODELO_OPENAI
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${claveOpenAI}` },
        body: JSON.stringify({
          model: MODELO_OPENAI,
          messages: [
            { role: "system", content: sistema },
            { role: "user", content: mensaje },
          ],
          max_completion_tokens: maxTokens,
          prompt_cache_key: `monarca-${funcion}`,
        }),
      })
      if (!r.ok) {
        console.error("[ia] OpenAI respondió", r.status, (await r.text().catch(() => "")).slice(0, 200))
      } else {
        const data = (await r.json()) as { model?: string; usage?: unknown; choices?: { message?: { content?: string | null } }[] }
        modelo = data.model ?? modelo
        usage = data.usage
        texto = data.choices?.[0]?.message?.content?.trim() || null
      }
    } else if (claveAnthropic) {
      modelo = MODELO_ANTHROPIC
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": claveAnthropic, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: MODELO_ANTHROPIC, max_tokens: maxTokens, system: systemConCache(sistema), messages: [{ role: "user", content: mensaje }] }),
      })
      if (!r.ok) {
        console.error("[ia] Anthropic respondió", r.status, (await r.text().catch(() => "")).slice(0, 200))
      } else {
        const data = (await r.json()) as { model?: string; usage?: unknown; content?: { type: string; text?: string }[] }
        modelo = data.model ?? modelo
        usage = data.usage
        texto = (data.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim() || null
      }
    } else {
      return null
    }
  } catch (err) {
    console.error("[ia] No se pudo consultar al modelo:", err)
  }
  const t = tokensDe(usage)
  await registrarUso({ funcion, modelo, tokensEntrada: t.entrada, tokensCache: t.cache, tokensSalida: t.salida, latenciaMs: Date.now() - inicio, ok: texto !== null })
  return texto
}

export interface RespuestaJSON<T> {
  datos: T
  modelo: string
  tokensEntrada: number | null
  tokensSalida: number | null
  latenciaMs: number
}

/**
 * Pide una respuesta con formato fijo (Structured Outputs, clase 2 del curso):
 * OpenAI con json_schema estricto; Anthropic forzando una herramienta con ese
 * esquema. Devuelve null si no hay clave, falla o no respeta el formato.
 */
export async function completarJSON<T>(
  sistema: string,
  mensaje: string,
  nombre: string,
  esquema: Record<string, unknown>,
  maxTokens = 1200,
  funcion: FuncionIA = "otra",
): Promise<RespuestaJSON<T> | null> {
  const claveOpenAI = process.env.OPENAI_API_KEY
  const claveAnthropic = process.env.ANTHROPIC_API_KEY
  const inicio = Date.now()
  let modelo: string | null = null
  let usage: unknown = null
  let datos: T | null = null
  try {
    if (claveOpenAI) {
      modelo = MODELO_OPENAI
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        signal: AbortSignal.timeout(20000),
        headers: { "content-type": "application/json", authorization: `Bearer ${claveOpenAI}` },
        body: JSON.stringify({
          model: MODELO_OPENAI,
          messages: [
            { role: "system", content: sistema },
            { role: "user", content: mensaje },
          ],
          max_completion_tokens: maxTokens,
          response_format: { type: "json_schema", json_schema: { name: nombre, strict: true, schema: esquema } },
          prompt_cache_key: `monarca-${funcion}`,
        }),
      })
      if (!r.ok) {
        console.error("[ia] OpenAI respondió", r.status, (await r.text().catch(() => "")).slice(0, 300))
      } else {
        const data = (await r.json()) as { model?: string; usage?: unknown; choices?: { message?: { content?: string | null } }[] }
        modelo = data.model ?? modelo
        usage = data.usage
        const texto = data.choices?.[0]?.message?.content
        if (texto) datos = JSON.parse(texto) as T
      }
    } else if (claveAnthropic) {
      modelo = MODELO_ANTHROPIC
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        signal: AbortSignal.timeout(20000),
        headers: { "content-type": "application/json", "x-api-key": claveAnthropic, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: MODELO_ANTHROPIC,
          max_tokens: maxTokens,
          temperature: 0,
          system: systemConCache(sistema),
          tools: [{ name: nombre, description: "Devolver la decisión con este formato.", input_schema: esquema }],
          tool_choice: { type: "tool", name: nombre },
          messages: [{ role: "user", content: mensaje }],
        }),
      })
      if (!r.ok) {
        console.error("[ia] Anthropic respondió", r.status, (await r.text().catch(() => "")).slice(0, 300))
      } else {
        const data = (await r.json()) as { model?: string; usage?: unknown; content?: { type: string; input?: unknown }[] }
        modelo = data.model ?? modelo
        usage = data.usage
        const bloque = data.content?.find((b) => b.type === "tool_use")
        if (bloque?.input) datos = bloque.input as T
      }
    } else {
      return null
    }
  } catch (err) {
    console.error("[ia] No se pudo consultar al modelo:", err)
  }
  const latenciaMs = Date.now() - inicio
  const t = tokensDe(usage)
  await registrarUso({ funcion, modelo, tokensEntrada: t.entrada, tokensCache: t.cache, tokensSalida: t.salida, latenciaMs, ok: datos !== null })
  if (datos === null) return null
  return { datos, modelo: modelo ?? MODELO_OPENAI, tokensEntrada: t.entrada, tokensSalida: t.salida, latenciaMs }
}
