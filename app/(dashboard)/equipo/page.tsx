import { createClient } from "@/lib/supabase/server"
import { getPerfilActual } from "@/lib/auth/perfil"
import { getArgentinaDateString } from "@/lib/timezone"
import { EquipoManager } from "@/components/equipo-manager"
import type { Mensaje, Notificacion, Perfil, Tarea, TareaPlantilla } from "@/lib/equipo"

export const dynamic = "force-dynamic"

export default async function EquipoPage() {
  const { perfil, tablaFaltante } = await getPerfilActual()

  if (tablaFaltante || !perfil) {
    return (
      <main className="container mx-auto px-4 py-8">
        <div className="mx-auto max-w-xl rounded-lg border p-6 text-sm">
          <h1 className="mb-2 text-lg font-semibold">Equipo</h1>
          {tablaFaltante ? (
            <p>
              Falta crear las tablas del equipo. Correr <code>scripts/067_create_equipo_tareas.sql</code> y después{" "}
              <code>scripts/068_seed_equipo.sql</code> en el SQL Editor de Supabase.
            </p>
          ) : (
            <p>
              Entraste con una cuenta que no tiene perfil de equipo (por ejemplo, la cuenta admin compartida). Cada persona
              tiene que entrar con su propio usuario. Para crearlos, ver los pasos en{" "}
              <code>scripts/068_seed_equipo.sql</code>.
            </p>
          )}
        </div>
      </main>
    )
  }

  const supabase = await createClient()
  const hoy = getArgentinaDateString()
  await supabase.rpc("generar_tareas_del_dia", { p_fecha: hoy })

  const [perfiles, tareas, plantillas, avisos, chat] = await Promise.all([
    supabase.from("perfiles").select("*").order("nombre"),
    supabase.from("tareas").select("*").eq("fecha", hoy),
    supabase.from("tareas_plantilla").select("*").order("orden"),
    supabase.from("notificaciones").select("*").order("created_at", { ascending: false }).limit(60),
    supabase.from("mensajes").select("*").is("tarea_id", null).order("created_at", { ascending: false }).limit(100),
  ])

  return (
    <main className="container mx-auto px-4 py-8">
      <EquipoManager
        yo={perfil}
        hoy={hoy}
        perfiles={(perfiles.data || []) as Perfil[]}
        initialTareas={(tareas.data || []) as Tarea[]}
        initialPlantillas={(plantillas.data || []) as TareaPlantilla[]}
        initialAvisos={(avisos.data || []) as Notificacion[]}
        initialChat={((chat.data || []) as Mensaje[]).reverse()}
      />
    </main>
  )
}
