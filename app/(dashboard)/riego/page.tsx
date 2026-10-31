import { createClient } from "@/lib/supabase/server"
import { RegistroRiegoManager } from "@/components/registro-riego-manager"
import type { RegistroRiego, SalaCultivo } from "@/lib/types"
import { getPerfilActual } from "@/lib/auth/perfil"
import type { Perfil } from "@/lib/equipo"

export default async function RiegoPage() {
  const supabase = await createClient()

  const desde = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const { perfil } = await getPerfilActual()

  const [salasResult, registrosResult, perfilesResult] = await Promise.all([
    supabase.from("salas_cultivo").select("*").eq("activo", true).order("id"),
    supabase
      .from("registros_riego")
      .select("*")
      .gte("fecha", desde)
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false }),
    perfil ? supabase.from("perfiles").select("*") : Promise.resolve({ data: [] as Perfil[] }),
  ])

  return (
    <main className="container mx-auto px-4 py-8">
      <RegistroRiegoManager
        salas={(salasResult.data || []) as SalaCultivo[]}
        initialRegistros={(registrosResult.data || []) as RegistroRiego[]}
        tablaFaltante={Boolean(registrosResult.error)}
        perfil={perfil}
        perfiles={(perfilesResult.data || []) as Perfil[]}
      />
    </main>
  )
}
