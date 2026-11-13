import { NextResponse } from "next/server"
import { getServerSession } from "@/lib/auth/session"
import { tienePermiso } from "@/lib/permisos"
import { createServiceClient } from "@/lib/supabase/service"
import { encolarComando } from "@/lib/automations/engine"
import type { DispositivoControlable } from "@/lib/types"

// Contestar una propuesta de Nubi (script 096): "mandar" la orden al equipo o
// "no". Lo usan el botón de la notificación (public/sw.js) y Control manual.
// Solo quien puede usar Control manual. La propuesta se toma de forma
// atómica (estado pendiente y no vencida): si dos personas contestan a la vez,
// la segunda recibe "ya la contestó …".
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession()
  if (!session) return NextResponse.json({ error: "Iniciá sesión en la app" }, { status: 401 })
  if (!tienePermiso(session.permisos, "control-manual.ver")) {
    return NextResponse.json({ error: "Tu usuario no puede mandar órdenes a los equipos" }, { status: 403 })
  }

  const { id } = await params
  const body = await request.json().catch(() => null)
  const decision = body?.decision
  if (decision !== "mandar" && decision !== "no") {
    return NextResponse.json({ error: "Falta la decisión (mandar o no)" }, { status: 400 })
  }

  const supabase = createServiceClient()
  const ahora = new Date().toISOString()
  const { data: tomadas, error } = await supabase
    .from("propuestas_nubi")
    .update({
      estado: decision === "mandar" ? "aprobada" : "rechazada",
      resuelta_en: ahora,
      resuelta_por: session.id,
      resuelta_por_nombre: session.nombre,
    })
    .eq("id", Number(id))
    .eq("estado", "pendiente")
    .gt("vence_en", ahora)
    .select("*")
  if (error) return NextResponse.json({ error: "No se pudo guardar la respuesta" }, { status: 500 })

  const propuesta = tomadas?.[0]
  if (!propuesta) {
    const { data: actual } = await supabase
      .from("propuestas_nubi")
      .select("estado, resuelta_por_nombre, vence_en, resuelta_en")
      .eq("id", Number(id))
      .maybeSingle()
    // Cerrada antes de su vencimiento = la reemplazó una más nueva para el mismo aire.
    const reemplazada = actual?.estado === "vencida" && actual.resuelta_en && actual.vence_en && actual.resuelta_en < actual.vence_en
    const motivo = !actual
      ? "La propuesta no existe"
      : reemplazada
        ? "Nubi ya hizo una propuesta más nueva para este aire: contestá esa (está en Control manual)"
        : actual.estado === "vencida" || actual.estado === "pendiente"
          ? "La propuesta venció (pasaron más de 30 minutos)"
          : `Ya la contestó ${actual.resuelta_por_nombre ?? "otra persona"}`
    return NextResponse.json({ error: motivo }, { status: 409 })
  }

  if (decision === "no") return NextResponse.json({ ok: true, mensaje: `Nubi no manda: ${propuesta.resumen}` })

  const { data: dispositivo } = await supabase.from("dispositivos_controlables").select("*").eq("id", propuesta.dispositivo_id).maybeSingle()
  if (!dispositivo || !propuesta.payload) {
    return NextResponse.json({ error: "El equipo ya no existe" }, { status: 404 })
  }
  // Igual que una orden de Control manual: el equipo pasa a manual para que el
  // motor de reglas no la contradiga.
  await supabase.from("dispositivos_controlables").update({ modo: "manual", updated_at: ahora }).eq("id", dispositivo.id)
  const comando = await encolarComando(supabase, dispositivo as DispositivoControlable, null, "manual", propuesta.payload)
  if (!comando) return NextResponse.json({ error: "No se pudo mandar la orden" }, { status: 500 })
  await supabase.from("propuestas_nubi").update({ comando_id: comando.id }).eq("id", propuesta.id)

  return NextResponse.json({ ok: true, mensaje: `${propuesta.resumen} (aprobó ${session.nombre})`, comando })
}
