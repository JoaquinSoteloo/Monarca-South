import { NextResponse } from "next/server"
import { getServerSession } from "@/lib/auth/session"
import { saveSubscription } from "@/lib/push/subscriptions"

export async function POST(request: Request) {
  const session = await getServerSession()
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const body = await request.json()
  const subscription = body?.subscription
  const deviceLabel = typeof body?.deviceLabel === "string" ? body.deviceLabel : null

  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    return NextResponse.json({ error: "Suscripción inválida" }, { status: 400 })
  }

  await saveSubscription(session.usuario, {
    endpoint: subscription.endpoint,
    keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth },
    userAgent: request.headers.get("user-agent"),
    deviceLabel,
  })

  return NextResponse.json({ ok: true })
}
