import { NextResponse } from "next/server"
import { getServerSession } from "@/lib/auth/session"
import { listDevices } from "@/lib/push/subscriptions"

export async function GET() {
  const session = await getServerSession()
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const devices = await listDevices(session.usuario)

  return NextResponse.json({
    devices: devices.map((d) => ({
      id: d.id,
      endpoint: d.endpoint,
      deviceLabel: d.device_label,
      userAgent: d.user_agent,
      createdAt: d.created_at,
      lastSeenAt: d.last_seen_at,
    })),
  })
}
