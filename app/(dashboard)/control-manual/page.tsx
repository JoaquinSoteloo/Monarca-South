import { createClient } from "@/lib/supabase/server"
import { ControlManual } from "@/components/control-manual"
import { NubiPropuestas, type PropuestaNubi } from "@/components/nubi-propuestas"
import type { DispositivoControlable } from "@/lib/types"

export default async function ControlManualPage() {
  const supabase = await createClient()

  const [{ data }, { data: propuestas }] = await Promise.all([
    supabase
      .from("dispositivos_controlables")
      .select("*, sala:salas_cultivo(id, nombre)")
      .eq("activo", true)
      .order("nombre"),
    // Nubi (script 096): las pendientes y las últimas de las 24 h.
    supabase
      .from("propuestas_nubi")
      .select("id, estado, motivo, resumen, creada_en, vence_en, resuelta_por_nombre")
      .gte("creada_en", new Date(Date.now() - 24 * 3600_000).toISOString())
      .order("creada_en", { ascending: false })
      .limit(20),
  ])
  const ahora = new Date().toISOString()
  const todas = (propuestas ?? []) as PropuestaNubi[]
  const pendientes = todas.filter((p) => p.estado === "pendiente" && (!p.vence_en || p.vence_en > ahora))
  const recientes = todas.filter((p) => !pendientes.includes(p)).slice(0, 5)

  // PostgREST puede devolver el embed to-one como array; lo normalizamos
  // igual que en app/automatizaciones/page.tsx.
  const dispositivos: DispositivoControlable[] = (data || []).map((d: any) => ({
    ...d,
    sala: (Array.isArray(d.sala) ? d.sala[0] : d.sala) ?? null,
  }))

  return (
          <main className="container mx-auto px-4 py-8">
        <NubiPropuestas pendientes={pendientes} recientes={recientes} />
        <ControlManual initialDispositivos={dispositivos} />
      </main>
  )
}
