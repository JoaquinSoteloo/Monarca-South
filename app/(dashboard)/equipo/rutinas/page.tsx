import { createClient } from "@/lib/supabase/server"
import { getPerfilActual } from "@/lib/auth/perfil"
import { RutinasPagina } from "@/components/hoy/rutinas-pagina"
import { SinEquipo } from "@/components/equipo/sin-equipo"
import type { Perfil, TareaPlantilla } from "@/lib/equipo"

export const dynamic = "force-dynamic"

export default async function RutinasPage() {
  const { perfil, tablaFaltante } = await getPerfilActual()
  if (tablaFaltante || !perfil) return <SinEquipo titulo="Rutinas" tablaFaltante={tablaFaltante} />

  const supabase = await createClient()
  const [perfiles, plantillas] = await Promise.all([
    supabase.from("equipo_perfiles").select("*").order("nombre"),
    supabase.from("tareas_plantilla").select("*").order("orden"),
  ])

  return (
    <main className="container mx-auto px-4 py-6">
      <RutinasPagina
        yo={perfil}
        perfiles={(perfiles.data || []) as Perfil[]}
        initialPlantillas={(plantillas.data || []) as TareaPlantilla[]}
      />
    </main>
  )
}
