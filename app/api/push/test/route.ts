import { NextResponse } from "next/server"
import { getServerSession } from "@/lib/auth/session"
import { sendPushNotification } from "@/lib/push/send"

// Botón "Enviar notificación de prueba" — no está conectado a ninguna alerta
// ni automatización real, solo verifica el circuito completo de punta a
// punta (suscripción -> backend -> push service -> service worker -> SO).
export async function POST() {
  const session = await getServerSession()
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const result = await sendPushNotification({
    title: "Monarca South",
    body: "Notificación de prueba — si la ves, Web Push está funcionando.",
    url: "/automatizaciones",
    tag: "push-test",
  })

  return NextResponse.json(result)
}
