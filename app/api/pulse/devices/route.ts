import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getPulseSnapshots } from "@/lib/pulse-grow/service"

// Único endpoint que el frontend usa para leer datos ambientales.
// Cruza el catálogo local (pulse_devices + sala asignada) con la lectura en
// vivo de cada dispositivo en Pulse Grow. Si un dispositivo falla, no rompe
// la respuesta completa: se marca individualmente con status "sin_datos".
export async function GET() {
  const supabase = await createClient()

  try {
    const snapshots = await getPulseSnapshots(supabase)
    return NextResponse.json({ devices: snapshots })
  } catch (error) {
    console.error("[pulse/devices] Error leyendo pulse_devices:", error)
    return NextResponse.json({ error: "No se pudo leer el catálogo de dispositivos" }, { status: 500 })
  }
}
