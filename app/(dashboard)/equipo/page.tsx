import { createClient } from "@/lib/supabase/server"
import { getPerfilActual } from "@/lib/auth/perfil"
import { getArgentinaDateString } from "@/lib/timezone"
import { HoyManager } from "@/components/hoy/hoy-manager"
import { SinEquipo } from "@/components/equipo/sin-equipo"
import type { Notificacion, Perfil, Tarea } from "@/lib/equipo"

export const dynamic = "force-dynamic"

// Pantalla Hoy (rediseño de Equipo, 03/11/2026): las tareas del día, una por
// vez. La pantalla anterior sigue en /equipo/anterior para volver atrás.
export default async function EquipoPage() {
  const { perfil, tablaFaltante } = await getPerfilActual()
  if (tablaFaltante || !perfil) return <SinEquipo titulo="Hoy" tablaFaltante={tablaFaltante} />

  const supabase = await createClient()
  const hoy = getArgentinaDateString()
  await supabase.rpc("generar_tareas_del_dia", { p_fecha: hoy })

  const [perfiles, tareas, avisos] = await Promise.all([
    supabase.from("equipo_perfiles").select("*").order("nombre"),
    supabase.from("tareas").select("*").eq("fecha", hoy),
    supabase.from("notificaciones").select("*").order("created_at", { ascending: false }).limit(60),
  ])

  return (
    <main className="container mx-auto px-4 py-6">
      <HoyManager
        yo={perfil}
        hoy={hoy}
        perfiles={(perfiles.data || []) as Perfil[]}
        initialTareas={(tareas.data || []) as Tarea[]}
        initialAvisos={(avisos.data || []) as Notificacion[]}
      />
    </main>
  )
}
