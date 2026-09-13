import { createClient } from "@/lib/supabase/server"
import { MonitoreoManager } from "@/components/monitoreo-manager"
import type { PulseDevice, SalaCultivo } from "@/lib/types"

export default async function MonitoreoPage() {
  const supabase = await createClient()

  const [devicesResult, salasResult] = await Promise.all([
    supabase
      .from("pulse_devices")
      .select("*, sala:salas_cultivo(id, nombre)")
      .eq("activo", true)
      .order("name"),
    supabase.from("salas_cultivo").select("id, nombre").eq("activo", true).order("nombre"),
  ])

  // PostgREST puede devolver el embed to-one como array; lo normalizamos acá
  // para que el componente cliente reciba siempre un objeto o null.
  const devices: PulseDevice[] = (devicesResult.data || []).map((d: any) => ({
    ...d,
    sala: (Array.isArray(d.sala) ? d.sala[0] : d.sala) ?? null,
  }))

  return (
          <main className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-emerald-900 mb-8">Monitoreo Ambiental</h1>
        <MonitoreoManager initialDevices={devices} salas={(salasResult.data as Pick<SalaCultivo, "id" | "nombre">[]) || []} />
      </main>
  )
}
