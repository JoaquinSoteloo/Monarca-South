import { NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"
import { sendPushToUsers } from "@/lib/push/send"
import { avisoDeMensaje } from "@/lib/chat-push"
import type { Mensaje, Perfil } from "@/lib/equipo"

// Push del Chat. Lo llama la base con pg_net cada vez que se guarda un
// mensaje, venga de la pantalla que venga (trigger mensajes_avisar_push,
// script 090). No hay sesión de usuario: se autoriza con el mismo secreto que
// el motor (AUTOMATIONS_CRON_SECRET, ver /api/automations/evaluate) y lee con
// el cliente service_role. Recibe solo el id y lee el mensaje de la base, así
// nadie puede mandar un push con otro texto.
//
// Responde cuántos push salieron: queda en net._http_response y en el log.
export async function POST(request: Request) {
  const secret = process.env.AUTOMATIONS_CRON_SECRET
  if (!secret) {
    console.error("[chat/notificar] AUTOMATIONS_CRON_SECRET no está configurada en el servidor")
    return NextResponse.json({ error: "No configurado" }, { status: 500 })
  }

  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const id = Number(body?.mensaje_id)
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Falta mensaje_id" }, { status: 400 })
  }

  try {
    const supabase = createServiceClient()
    const { data: mensaje, error } = await supabase.from("mensajes").select("*").eq("id", id).maybeSingle()
    if (error) throw new Error(error.message)
    if (!mensaje) {
      return NextResponse.json({ error: "No existe el mensaje" }, { status: 404 })
    }

    const [perfiles, tarea] = await Promise.all([
      supabase.from("equipo_perfiles").select("*"),
      mensaje.tarea_id
        ? supabase.from("tareas").select("titulo, responsable_id, afecta_a").eq("id", mensaje.tarea_id).maybeSingle()
        : { data: null, error: null },
    ])
    if (perfiles.error) throw new Error(perfiles.error.message)
    if (tarea.error) throw new Error(tarea.error.message)

    const aviso = avisoDeMensaje(mensaje as Mensaje, (perfiles.data ?? []) as Perfil[], tarea.data)
    const resultado = await sendPushToUsers(aviso.destinatarios, aviso.payload)
    console.log(`[chat/notificar] mensaje ${id}: ${aviso.destinatarios.length} destinatario(s)`, resultado)

    return NextResponse.json({ mensaje: id, destinatarios: aviso.destinatarios.length, ...resultado })
  } catch (err) {
    console.error(`[chat/notificar] Error con el mensaje ${id}:`, err)
    return NextResponse.json({ error: "No se pudo mandar el push" }, { status: 500 })
  }
}
