import { NextResponse } from "next/server"
import { getServerSession } from "@/lib/auth/session"
import { removeSubscription } from "@/lib/push/subscriptions"

export async function POST(request: Request) {
  const session = await getServerSession()
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const body = await request.json()
  const endpoint = body?.endpoint

  if (!endpoint || typeof endpoint !== "string") {
    return NextResponse.json({ error: "Falta el endpoint" }, { status: 400 })
  }

  await removeSubscription(session.usuario, endpoint)

  return NextResponse.json({ ok: true })
}
