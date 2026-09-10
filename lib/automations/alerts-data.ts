// Lectura server-side de los insumos que necesita computeAlertasOperativas
// (lib/automations/alerts.ts): última lectura por sensor Pulse usado en
// alguna regla, y el tipo del último log por regla. Un solo lugar para que
// app/automatizaciones/page.tsx (carga inicial) y
// GET /api/automations/alerts-context (refresco desde el cliente después de
// "Evaluar ahora" o cualquier acción) queden en sync.
import type { SupabaseClient } from "@supabase/supabase-js"
import type { UltimaLecturaResumen } from "./alerts"

export interface AlertasContext {
  ultimaLecturaPorPulseDevice: Record<number, UltimaLecturaResumen | undefined>
  ultimoTipoLogPorAutomatizacion: Record<number, string | undefined>
}

export async function getAlertasContext(
  supabase: SupabaseClient,
  pulseDeviceIds: number[],
  automatizacionIds: number[],
): Promise<AlertasContext> {
  const [lecturasEntries, logsEntries] = await Promise.all([
    Promise.all(
      pulseDeviceIds.map(async (id) => {
        const { data } = await supabase
          .from("lecturas_ambientales")
          .select("leido_en, temperatura_c, humedad_rh, vpd, luz_lux, presion_hpa, dew_point_c")
          .eq("pulse_device_id", id)
          .order("leido_en", { ascending: false })
          .limit(1)
          .maybeSingle()
        return [id, data ?? undefined] as const
      }),
    ),
    Promise.all(
      automatizacionIds.map(async (id) => {
        const { data } = await supabase
          .from("ejecuciones_automatizacion")
          .select("tipo")
          .eq("automatizacion_id", id)
          .order("creado_en", { ascending: false })
          .limit(1)
          .maybeSingle()
        return [id, data?.tipo as string | undefined] as const
      }),
    ),
  ])

  return {
    ultimaLecturaPorPulseDevice: Object.fromEntries(lecturasEntries),
    ultimoTipoLogPorAutomatizacion: Object.fromEntries(logsEntries),
  }
}
