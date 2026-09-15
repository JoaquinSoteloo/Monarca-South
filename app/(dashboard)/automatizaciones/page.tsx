import { createClient } from "@/lib/supabase/server"
import { AutomatizacionesManager } from "@/components/automatizaciones-manager"
import { getAlertasContext } from "@/lib/automations/alerts-data"
import type { Automatizacion, DispositivoControlable } from "@/lib/types"

export default async function AutomatizacionesPage() {
  const supabase = await createClient()

  const [salasResult, pulseDevicesResult, dispositivosResult, automatizacionesResult] = await Promise.all([
    supabase.from("salas_cultivo").select("id, nombre").eq("activo", true).order("id"),
    supabase.from("pulse_devices").select("id, name, sala_id").eq("activo", true).order("name"),
    supabase.from("dispositivos_controlables").select("*, sala:salas_cultivo(id, nombre)").order("nombre"),
    supabase
      .from("automatizaciones")
      .select("*, pulse_device:pulse_devices(id, name), dispositivo:dispositivos_controlables(*)")
      .order("nombre"),
  ])

  // PostgREST puede devolver los embeds to-one como array; los normalizamos
  // para que el componente cliente reciba siempre un objeto o null.
  const dispositivos: DispositivoControlable[] = (dispositivosResult.data || []).map((d: any) => ({
    ...d,
    sala: (Array.isArray(d.sala) ? d.sala[0] : d.sala) ?? null,
  }))

  const automatizaciones: Automatizacion[] = (automatizacionesResult.data || []).map((a: any) => ({
    ...a,
    pulse_device: (Array.isArray(a.pulse_device) ? a.pulse_device[0] : a.pulse_device) ?? undefined,
    dispositivo: (Array.isArray(a.dispositivo) ? a.dispositivo[0] : a.dispositivo) ?? undefined,
  }))

  // Datos para las alertas operativas (lib/automations/alerts.ts): última
  // lectura por sensor Pulse usado en alguna regla, y último tipo de log por
  // regla (para detectar fail-safe activo). Volumen chico (una regla por
  // sala típicamente), así que una consulta por id es aceptable — mismo
  // criterio que ya usa lib/automations/engine.ts.
  const pulseDeviceIds = [...new Set(automatizaciones.map((a) => a.pulse_device_id))]
  const automatizacionIds = automatizaciones.map((a) => a.id)
  const { ultimaLecturaPorPulseDevice, ultimoTipoLogPorAutomatizacion } = await getAlertasContext(
    supabase,
    pulseDeviceIds,
    automatizacionIds,
  )

  return (
          <main className="container mx-auto px-4 py-8 space-y-6">
        <AutomatizacionesManager
          salas={salasResult.data || []}
          pulseDevices={pulseDevicesResult.data || []}
          initialDispositivos={dispositivos}
          initialAutomatizaciones={automatizaciones}
          ultimaLecturaPorPulseDevice={ultimaLecturaPorPulseDevice}
          ultimoTipoLogPorAutomatizacion={ultimoTipoLogPorAutomatizacion}
        />
      </main>
  )
}
