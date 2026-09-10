// Lógica compartida para leer el snapshot en vivo de todos los pulse_devices
// activos, cruzado con su sala asignada.
//
// La usan dos callers con responsabilidades distintas:
// - GET /api/pulse/devices: solo lectura, nunca persiste nada.
// - POST /api/automations/evaluate: además persiste cada snapshot exitoso en
//   lecturas_ambientales (ver lib/automations/engine.ts). Este archivo NO
//   sabe nada de automatizaciones, solo expone el snapshot.
import type { SupabaseClient } from "@supabase/supabase-js"
import { getDeviceRecentData } from "./client"
import { PulseApiError } from "./errors"
import { pascalsToHpa, getDeviceConnectionStatus } from "./format"
import type { PulseDeviceSnapshot } from "./types"

export async function getPulseSnapshots(supabase: SupabaseClient): Promise<PulseDeviceSnapshot[]> {
  const { data: devices, error } = await supabase
    .from("pulse_devices")
    .select("id, name, sala:salas_cultivo(id, nombre)")
    .eq("activo", true)
    .order("name")

  if (error) {
    throw error
  }

  return Promise.all(
    (devices || []).map(async (device: any): Promise<PulseDeviceSnapshot> => {
      const sala = Array.isArray(device.sala) ? (device.sala[0] ?? null) : (device.sala ?? null)

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
        console.error(`[pulse-grow/service] Error leyendo recent-data del dispositivo ${device.id}:`, err)
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
}
