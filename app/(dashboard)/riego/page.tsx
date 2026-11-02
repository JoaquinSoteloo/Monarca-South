import { createClient } from "@/lib/supabase/server"
import { RegistroRiegoManager } from "@/components/registro-riego-manager"
import type { RegistroRiego, SalaCultivo } from "@/lib/types"

export default async function RiegoPage() {
  const supabase = await createClient()

  const desde = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const [salasResult, registrosResult] = await Promise.all([
    supabase.from("salas_cultivo").select("*").eq("activo", true).order("id"),
    supabase
      .from("registros_riego")
      .select("*")
      .gte("fecha", desde)
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false }),
  ])

  return (
    <main className="container mx-auto px-4 py-8">
      <RegistroRiegoManager
        salas={(salasResult.data || []) as SalaCultivo[]}
        initialRegistros={(registrosResult.data || []) as RegistroRiego[]}
        tablaFaltante={Boolean(registrosResult.error)}
      />
    </main>
  )
}
