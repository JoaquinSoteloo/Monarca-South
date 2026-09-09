import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getDeviceRecentData } from "@/lib/pulse-grow/client"
import { PulseApiError } from "@/lib/pulse-grow/errors"
import { pascalsToHpa, getDeviceConnectionStatus } from "@/lib/pulse-grow/format"
import type { PulseDeviceSnapshot } from "@/lib/pulse-grow/types"

// Único endpoint que el frontend usa para leer datos ambientales.
// Cruza el catálogo local (pulse_devices + sala asignada) con la lectura en
// vivo de cada dispositivo en Pulse Grow. Si un dispositivo falla, no rompe
// la respuesta completa: se marca individualmente con status "sin_datos".
export async function GET() {
  const supabase = await createClient()
  const { data: devices, error } = await supabase
    .from("pulse_devices")
    .select("id, name, sala:salas_cultivo(id, nombre)")
    .eq("activo", true)
    .order("name")

  if (error) {
    console.error("[pulse/devices] Error leyendo pulse_devices:", error)
    return NextResponse.json({ error: "No se pudo leer el catálogo de dispositivos" }, { status: 500 })
  }

  const snapshots: PulseDeviceSnapshot[] = await Promise.all(
    (devices || []).map(async (device): Promise<PulseDeviceSnapshot> => {
      const sala = Array.isArray(device.sala) ? device.sala[0] ?? null : device.sala ?? null

      try {
        const recentData = await getDeviceRecentData(device.id)
        return {
          id: device.id,
          name: device.name,
          sala,
          reading: {
            temperatureC: recentData.temperatureC,
            temperatureF: recentData.temperatureF,
            humidityRh: recentData.humidityRh,
            vpd: recentData.vpd,
            lightLux: recentData.lightLux,
            airPressureHpa: pascalsToHpa(recentData.airPressure),
            dewPointC: recentData.dpC,
            dewPointF: recentData.dpF,
            batteryV: recentData.batteryV,
            signalStrength: recentData.signalStrength,
            pluggedIn: recentData.pluggedIn,
            createdAt: recentData.createdAt,
          },
          status: getDeviceConnectionStatus(recentData.createdAt),
          error: null,
        }
      } catch (err) {
        const code = err instanceof PulseApiError ? err.code : "unavailable"
        console.error(`[pulse/devices] Error leyendo recent-data del dispositivo ${device.id}:`, err)
        return {
          id: device.id,
          name: device.name,
          sala,
          reading: null,
          status: "sin_datos",
          error: { code },
        }
      }
    }),
  )

  return NextResponse.json({ devices: snapshots })
}
