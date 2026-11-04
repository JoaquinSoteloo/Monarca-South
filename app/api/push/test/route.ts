import { NextResponse } from "next/server"
import { getServerSession } from "@/lib/auth/session"
import { sendPushToUsers } from "@/lib/push/send"

// Botón "Enviar notificación de prueba" — no está conectado a ninguna alerta
// ni automatización real, solo verifica el circuito completo de punta a
// punta (suscripción -> backend -> push service -> service worker -> SO).
// Va solo a los aparatos de quien la pide (script 090), no a todo el equipo.
export async function POST() {
  const session = await getServerSession()
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const result = await sendPushToUsers([session.id], {
    title: "Monarca South",
    body: "Notificación de prueba — si la ves, Web Push está funcionando.",
    url: "/automatizaciones",
    tag: "push-test",
  })

  return NextResponse.json(result)
}
