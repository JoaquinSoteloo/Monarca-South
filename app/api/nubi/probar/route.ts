import { NextResponse } from "next/server"
import { getServerSession } from "@/lib/auth/session"
import { ROL_COMISION } from "@/lib/permisos"
import { createServiceClient } from "@/lib/supabase/service"
import { motivoDe } from "@/lib/nubi-ia"
import { cargarSalas, pensar, registrar } from "@/lib/nubi-pensar"
import { publicarPropuesta, reglasDeSala } from "@/lib/nubi-aviso"

// "Probar Nubi" (13/11/2026; con IA desde el 14/11): toma la sala real del
// equipo (rango, equipos, lo que se propuso antes) pero con la temperatura
// (aire) o la humedad (deshumidificador) que se elige, y le pregunta a la IA,
// igual que el motor. Si propone algo, el push llega solo a quien prueba.
// No inventa lecturas en la base. Solo la comisión.
export const maxDuration = 60

export async function POST(request: Request) {
  const session = await getServerSession()
  if (!session) return NextResponse.json({ error: "Iniciá sesión en la app" }, { status: 401 })
  if (session.rol !== ROL_COMISION) return NextResponse.json({ error: "Solo la comisión puede probar a Nubi" }, { status: 403 })

  const body = await request.json().catch(() => null)
  const dispositivoId = Number(body?.dispositivoId)
  // `valor`: temperatura simulada (°C) para el aire, humedad (%) para el deshumidificador.
  const valor = Math.round(Number(body?.valor ?? body?.temperatura) * 10) / 10
  if (!Number.isFinite(dispositivoId) || !Number.isFinite(valor) || valor < 0 || valor > 100) {
    return NextResponse.json({ error: "Elegí el equipo y un valor válido" }, { status: 400 })
  }

  const supabase = createServiceClient()
  const ahora = new Date()
  const { data: equipo } = await supabase.from("dispositivos_controlables").select("id, tipo, sala_id").eq("id", dispositivoId).maybeSingle()
  if (!equipo || !["aire_acondicionado", "deshumidificador"].includes(equipo.tipo) || !equipo.sala_id) {
    return NextResponse.json({ error: "Ese equipo no es un aire ni un deshumidificador de una sala" }, { status: 400 })
  }

  // Una sola pendiente por sala: las anteriores (reales o de prueba) se dan por vencidas.
  await supabase.from("propuestas_nubi").update({ estado: "vencida", resuelta_en: ahora.toISOString() }).eq("sala_id", equipo.sala_id).eq("estado", "pendiente")

  const [s] = await cargarSalas(supabase, ahora, [equipo.sala_id])
  if (!s) return NextResponse.json({ error: "La sala del equipo no tiene un rango de clima hoy (sin ciclo)" }, { status: 400 })

  // El valor simulado reemplaza al real, también en la última hora (queda estable).
  const variable = equipo.tipo === "deshumidificador" ? "humedad" : "temperatura"
  s.entrada.ahora = { ...s.entrada.ahora, [variable]: valor, haceMin: 0 }
  s.entrada.ultimaHora = s.entrada.ultimaHora.length
    ? s.entrada.ultimaHora.map((l) => ({ ...l, [variable]: valor }))
    : [{ temperatura: null, humedad: null, [variable]: valor }]
  if (variable === "temperatura") {
    s.lecturas = s.lecturas.map((l) => ({ ...l, temperatura_c: valor }))
  } else {
    s.lecturas = s.lecturas.map((l) => ({ ...l, humedad_rh: valor }))
  }
  const simulado = variable === "temperatura" ? `${String(valor).replace(".", ",")} °C simulados` : `${Math.round(valor)} % simulado`

  const p = await pensar(s.entrada).catch(() => null)
  if (!p) {
    // La IA no respondió: se prueba con las reglas de respaldo.
    const [r] = reglasDeSala(s, ahora)
    if (!r) return NextResponse.json({ ok: true, mensaje: `La IA no respondió y, con ${simulado}, las reglas de respaldo no proponen nada.` })
    const pub = await publicarPropuesta(supabase, { ...r, motivo: `${r.motivo}. PRUEBA con ${simulado}` }, [session.id], ahora)
    await registrar(supabase, { salaId: s.sala.id, fuente: "prueba", entrada: { simulado }, salida: r.propuesta, decision: "proponer", valida: true, propuestaId: pub?.id ?? null })
    return NextResponse.json({ ok: true, mensaje: `La IA no respondió; con las reglas de respaldo Nubi propone: ${r.propuesta.resumen}.` })
  }

  const v = p.validacion
  let pub: { id: number; enviados: number } | null = null
  if (v.ok && v.tipo !== "nada" && v.dispositivoId !== null) {
    pub = await publicarPropuesta(
      supabase,
      {
        salaId: s.sala.id,
        dispositivoId: v.dispositivoId,
        alertaId: null,
        motivo: `${s.sala.nombre}: ${motivoDe(p.decision)}. PRUEBA con ${simulado}`,
        propuesta: v.propuesta,
        titulo: `🛰 Nubi: ${s.sala.nombre}`,
      },
      [session.id],
      ahora,
    )
  }
  await registrar(supabase, { salaId: s.sala.id, fuente: "prueba", pensamiento: p, propuestaId: pub?.id ?? null })

  const piensa = `Lo que pensó: ${p.decision.analisis}`
  let mensaje: string
  if (!v.ok) mensaje = `Nubi quería "${p.decision.titulo}", pero no pasó los controles: ${v.motivo}. ${piensa}`
  else if (v.tipo === "nada") mensaje = `Con ${simulado}, Nubi no propone nada. ${piensa}`
  else if (!pub) mensaje = `Nubi propone ${p.decision.titulo}, pero no se pudo guardar.`
  else
    mensaje =
      `Nubi ${v.tipo === "orden" ? "propone" : "avisa"}: ${p.decision.titulo}. ${piensa} ` +
      (pub.enviados > 0 ? `Te mandé el aviso a ${pub.enviados} aparato${pub.enviados === 1 ? "" : "s"}.` : "No te llegó el aviso: activá las notificaciones (campanita) en este aparato.")
  return NextResponse.json({ ok: true, mensaje, analisis: p.decision.analisis })
}
