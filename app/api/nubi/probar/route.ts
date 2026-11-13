import { NextResponse } from "next/server"
import { getServerSession } from "@/lib/auth/session"
import { ROL_COMISION } from "@/lib/permisos"
import { createServiceClient } from "@/lib/supabase/service"
import { sendPushToUsers } from "@/lib/push/send"
import { cicloActual, type CicloSala } from "@/lib/ciclo"
import { rangoClima, textoProblema } from "@/lib/clima-alertas"
import { estadoAire, proponer, textoEstadoAire, MINUTOS_VIGENCIA } from "@/lib/nubi"
import type { DispositivoControlable } from "@/lib/types"

// "Probar Nubi" (pedido de Joaquín, 13/11/2026): corre el mismo análisis que el
// motor (lib/nubi.ts) con una temperatura simulada, contra el rango real de la
// sala y el estado real del aire, y manda la propuesta con su push solo a
// quien prueba. No inventa lecturas ni avisa a nadie más. Solo la comisión.
export async function POST(request: Request) {
  const session = await getServerSession()
  if (!session) return NextResponse.json({ error: "Iniciá sesión en la app" }, { status: 401 })
  if (session.rol !== ROL_COMISION) return NextResponse.json({ error: "Solo la comisión puede probar a Nubi" }, { status: 403 })

  const body = await request.json().catch(() => null)
  const dispositivoId = Number(body?.dispositivoId)
  const temperatura = Math.round(Number(body?.temperatura) * 10) / 10
  if (!Number.isFinite(dispositivoId) || !Number.isFinite(temperatura) || temperatura < 0 || temperatura > 50) {
    return NextResponse.json({ error: "Elegí el aire y una temperatura entre 0 y 50 °C" }, { status: 400 })
  }

  const supabase = createServiceClient()
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" })
  const { data: aire } = await supabase.from("dispositivos_controlables").select("*").eq("id", dispositivoId).maybeSingle()
  if (!aire || aire.tipo !== "aire_acondicionado" || !aire.sala_id) {
    return NextResponse.json({ error: "Ese equipo no es un aire de una sala" }, { status: 400 })
  }
  const [{ data: sala }, { data: ciclos }] = await Promise.all([
    supabase.from("salas_cultivo").select("id, nombre").eq("id", aire.sala_id).maybeSingle(),
    supabase.from("ciclos_sala").select("*").eq("estado", "abierto"),
  ])
  if (!sala) return NextResponse.json({ error: "No encuentro la sala del aire" }, { status: 400 })

  const rango = rangoClima(sala.nombre, cicloActual((ciclos ?? []) as CicloSala[], sala.id, hoy), hoy)
  if (!rango) return NextResponse.json({ error: `${sala.nombre} no tiene un rango de clima hoy (sin ciclo)` }, { status: 400 })

  const estado = estadoAire(aire as DispositivoControlable)
  const propuesta = proponer(rango, temperatura, estado)
  const [min, max] = rango.temperatura
  if (!propuesta) {
    return NextResponse.json({
      ok: true,
      mensaje: `Con ${temperatura} °C y el aire ${textoEstadoAire(estado)}, Nubi no propone nada (rango de ${rango.etapa}: ${min}–${max} °C).`,
    })
  }

  const lado = temperatura > max ? "alto" : "bajo"
  const motivo = `${sala.nombre}: ${textoProblema({ variable: "temperatura", lado, valor: temperatura, limite: lado === "alto" ? max : min })}, aire ${textoEstadoAire(estado)} (PRUEBA con ${temperatura} °C simulados)`
  const ahora = new Date()

  // Una sola pendiente por aire: la anterior (real o de prueba) se da por vencida.
  await supabase.from("propuestas_nubi").update({ estado: "vencida", resuelta_en: ahora.toISOString() }).eq("dispositivo_id", aire.id).eq("estado", "pendiente")
  const { data: fila, error } = await supabase
    .from("propuestas_nubi")
    .insert({
      sala_id: sala.id,
      dispositivo_id: aire.id,
      estado: propuesta.tipo === "orden" ? "pendiente" : "informada",
      motivo,
      resumen: propuesta.resumen,
      payload: propuesta.tipo === "orden" ? propuesta.payload : null,
      vence_en: propuesta.tipo === "orden" ? new Date(ahora.getTime() + MINUTOS_VIGENCIA * 60000).toISOString() : null,
    })
    .select("id")
    .single()
  if (error || !fila) return NextResponse.json({ error: "No se pudo guardar la propuesta" }, { status: 500 })

  const push = await sendPushToUsers(
    [session.id],
    propuesta.tipo === "orden"
      ? {
          title: `🛰 ¿${propuesta.resumen.charAt(0).toUpperCase()}${propuesta.resumen.slice(1)}?`,
          body: `Nubi · ${motivo}. Vence en ${MINUTOS_VIGENCIA} minutos.`,
          url: "/control-manual",
          tag: `nubi-${fila.id}`,
          acciones: [
            { action: "mandar", title: "Mandar" },
            { action: "no", title: "No" },
          ],
          datos: { propuestaId: fila.id },
        }
      : { title: `🛰 Nubi: ${sala.nombre}`, body: propuesta.resumen, url: "/control-manual", tag: `nubi-${fila.id}` },
  ).catch(() => ({ sent: 0, removed: 0, failed: 1 }))

  return NextResponse.json({
    ok: true,
    mensaje:
      `Nubi propone: ${propuesta.resumen}. ` +
      (push.sent > 0 ? `Te mandé el aviso a ${push.sent} aparato${push.sent === 1 ? "" : "s"}.` : "No te llegó el aviso: activá las notificaciones (campanita) en este aparato."),
  })
}
