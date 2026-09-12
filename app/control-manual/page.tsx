import { createClient } from "@/lib/supabase/server"
import { Header } from "@/components/header"
import { ControlManual } from "@/components/control-manual"
import type { DispositivoControlable } from "@/lib/types"

export default async function ControlManualPage() {
  const supabase = await createClient()

  const { data } = await supabase
    .from("dispositivos_controlables")
    .select("*, sala:salas_cultivo(id, nombre)")
    .eq("activo", true)
    .order("nombre")

  // PostgREST puede devolver el embed to-one como array; lo normalizamos
  // igual que en app/automatizaciones/page.tsx.
  const dispositivos: DispositivoControlable[] = (data || []).map((d: any) => ({
    ...d,
    sala: (Array.isArray(d.sala) ? d.sala[0] : d.sala) ?? null,
  }))

  return (
    <div className="min-h-screen bg-background">
      <Header title="Control manual" showBack />
      <main className="container mx-auto px-4 py-8">
        <ControlManual initialDispositivos={dispositivos} />
      </main>
    </div>
  )
}
