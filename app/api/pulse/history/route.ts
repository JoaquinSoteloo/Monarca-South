import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getHistorialAmbiental, esRangoHistorialValido } from "@/lib/pulse-grow/history"

// Histórico ambiental para los gráficos de Monitoreo. Lee EXCLUSIVAMENTE de
// lecturas_ambientales (lo que ya persiste el motor en cada corrida) — nunca
// dispara un polling histórico contra Pulse Grow.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const pulseDeviceId = searchParams.get("pulse_device_id")
  const rango = searchParams.get("rango")

  if (!pulseDeviceId || Number.isNaN(Number(pulseDeviceId))) {
    return NextResponse.json({ error: "Falta pulse_device_id" }, { status: 400 })
  }
  if (!esRangoHistorialValido(rango)) {
    return NextResponse.json({ error: "rango debe ser '24h' o '7d'" }, { status: 400 })
  }

  const supabase = await createClient()
  try {
    const puntos = await getHistorialAmbiental(supabase, Number(pulseDeviceId), rango)
    return NextResponse.json({ puntos })
  } catch (error) {
    console.error("[pulse/history] Error leyendo historial ambiental:", error)
    return NextResponse.json({ error: "No se pudo leer el histórico ambiental" }, { status: 500 })
  }
}
