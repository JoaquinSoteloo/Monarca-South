import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { getPerfilActual } from "@/lib/auth/perfil"
import { getArgentinaDateString } from "@/lib/timezone"
import { EquipoManager } from "@/components/equipo-manager"
import { SinEquipo } from "@/components/equipo/sin-equipo"
import type { Mensaje, Notificacion, Perfil, Tarea, TareaPlantilla } from "@/lib/equipo"

export const dynamic = "force-dynamic"

// Pantalla Equipo como estaba antes del rediseño del 03/11/2026, para volver
// atrás si la nueva (/equipo) no convence. Sin cambios en EquipoManager.
export default async function EquipoAnteriorPage() {
  const { perfil, tablaFaltante } = await getPerfilActual()
  if (tablaFaltante || !perfil) return <SinEquipo titulo="Equipo" tablaFaltante={tablaFaltante} />

  const supabase = await createClient()
  const hoy = getArgentinaDateString()
  await supabase.rpc("generar_tareas_del_dia", { p_fecha: hoy })

  const [perfiles, tareas, plantillas, avisos, chat] = await Promise.all([
    supabase.from("equipo_perfiles").select("*").order("nombre"),
    supabase.from("tareas").select("*").eq("fecha", hoy),
    supabase.from("tareas_plantilla").select("*").order("orden"),
    supabase.from("notificaciones").select("*").order("created_at", { ascending: false }).limit(60),
    supabase.from("mensajes").select("*").is("tarea_id", null).order("created_at", { ascending: false }).limit(100),
  ])

  return (
    <main className="container mx-auto px-4 py-8">
      <p className="mb-4 rounded-lg bg-muted px-4 py-3 text-sm">
        Estás viendo la pantalla anterior de Equipo.{" "}
        <Link href="/equipo" className="font-semibold text-primary underline-offset-2 hover:underline">
          Volver a Hoy
        </Link>
      </p>
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
