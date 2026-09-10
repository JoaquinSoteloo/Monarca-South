// Lectura del histórico ambiental persistido en lecturas_ambientales, para
// graficar en Monitoreo. A diferencia de lib/pulse-grow/service.ts (snapshot
// en vivo contra la API de Pulse), esto SOLO lee de Supabase — nunca golpea
// Pulse Grow. Usa la función historial_ambiental_bucketed (ver
// scripts/046_create_historial_ambiental_function.sql) para no transportar
// miles de filas crudas al armar el gráfico de 7 días.
import type { SupabaseClient } from "@supabase/supabase-js"

export type RangoHistorial = "24h" | "7d"

export interface PuntoHistorialAmbiental {
  bucket: string
  temperatura_c: number | null
  humedad_rh: number | null
  vpd: number | null
  muestras: number
}

const RANGO_CONFIG: Record<RangoHistorial, { horas: number; bucketMinutos: number }> = {
  // 10 min/bucket -> ~144 puntos
  "24h": { horas: 24, bucketMinutos: 10 },
  // 60 min/bucket -> ~168 puntos
  "7d": { horas: 24 * 7, bucketMinutos: 60 },
}

export function esRangoHistorialValido(v: string | null): v is RangoHistorial {
  return v === "24h" || v === "7d"
}

export async function getHistorialAmbiental(
  supabase: SupabaseClient,
  pulseDeviceId: number,
  rango: RangoHistorial,
): Promise<PuntoHistorialAmbiental[]> {
  const { horas, bucketMinutos } = RANGO_CONFIG[rango]
  const hasta = new Date()
  const desde = new Date(hasta.getTime() - horas * 60 * 60 * 1000)

  const { data, error } = await supabase.rpc("historial_ambiental_bucketed", {
    p_pulse_device_id: pulseDeviceId,
    p_desde: desde.toISOString(),
    p_hasta: hasta.toISOString(),
    p_bucket_minutos: bucketMinutos,
  })

  if (error) {
    throw error
  }

  return (data || []).map((fila: any) => ({
    bucket: fila.bucket,
    temperatura_c: fila.temperatura_c !== null ? Number(fila.temperatura_c) : null,
    humedad_rh: fila.humedad_rh !== null ? Number(fila.humedad_rh) : null,
    vpd: fila.vpd !== null ? Number(fila.vpd) : null,
    muestras: Number(fila.muestras),
  }))
}
