import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getDeviceDetails } from "@/lib/pulse-grow/client"
import { PulseApiError } from "@/lib/pulse-grow/errors"

// Trae el catálogo de dispositivos desde Pulse Grow y lo guarda en
// pulse_devices (upsert por id). Nunca toca sala_id ni activo de filas
// existentes: esos campos los gestiona solo nuestra UI.
export async function POST() {
  let details: Awaited<ReturnType<typeof getDeviceDetails>>

  try {
    details = await getDeviceDetails()
  } catch (error) {
    const code = error instanceof PulseApiError ? error.code : "unavailable"
    console.error("[pulse/sync] Error consultando Pulse Grow:", error)
    return NextResponse.json({ error: "No se pudo sincronizar con Pulse Grow", code }, { status: 502 })
  }

  const supabase = await createClient()
  const rows = details.map((device) => ({
    id: device.id,
    name: device.name,
    device_type: device.deviceType,
    last_synced_at: new Date().toISOString(),
  }))

  if (rows.length === 0) {
    return NextResponse.json({ success: true, count: 0 })
  }

  const { error } = await supabase.from("pulse_devices").upsert(rows, { onConflict: "id" })

  if (error) {
    console.error("[pulse/sync] Error guardando catálogo en Supabase:", error)
    return NextResponse.json({ error: "No se pudo guardar el catálogo de dispositivos" }, { status: 500 })
  }

  return NextResponse.json({ success: true, count: rows.length })
}
