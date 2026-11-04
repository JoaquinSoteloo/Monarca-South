import { Suspense } from "react"
import { createClient } from "@/lib/supabase/server"
import { getPerfilActual } from "@/lib/auth/perfil"
import { getServerSession } from "@/lib/auth/session"
import { getArgentinaDateString } from "@/lib/timezone"
import { tienePermiso } from "@/lib/permisos"
import { sumarDias } from "@/lib/ciclo"
import { teInvolucra } from "@/lib/chat"
import { ChatManager } from "@/components/chat/chat-manager"
import { SinEquipo } from "@/components/equipo/sin-equipo"
import type { Mensaje, Perfil, Tarea } from "@/lib/equipo"

export const dynamic = "force-dynamic"

// Chat (rediseño del 03/11/2026): el canal «Todos», los privados, las tareas
// con un problema y el asistente de cultivo en un solo lugar. Usa las mismas
// tablas que Equipo y Sede (mensajes, tareas, asistente_mensajes).
export default async function ChatPage() {
  const [{ perfil, tablaFaltante }, session] = await Promise.all([getPerfilActual(), getServerSession()])
  if (tablaFaltante || !perfil) return <SinEquipo titulo="Chat" tablaFaltante={tablaFaltante} />

  const supabase = await createClient()
  // Las tareas con un problema de las últimas dos semanas que siguen abiertas.
  const problemasDesde = sumarDias(getArgentinaDateString(), -14)
  const [perfiles, generales, tareas] = await Promise.all([
    supabase.from("equipo_perfiles").select("*").order("nombre"),
    supabase.from("mensajes").select("*").is("tarea_id", null).order("created_at", { ascending: false }).limit(300),
    supabase.from("tareas").select("*").eq("estado", "problema").gte("fecha", problemasDesde),
  ])

  const equipo = (perfiles.data || []) as Perfil[]
  const problemas = ((tareas.data || []) as Tarea[]).filter((t) => teInvolucra(t, perfil, equipo))
  const comentarios = problemas.length
    ? await supabase
        .from("mensajes")
        .select("*")
        .in(
          "tarea_id",
          problemas.map((t) => t.id),
        )
        .order("created_at", { ascending: false })
        .limit(300)
    : { data: [] }

  return (
    <main className="container mx-auto px-4 py-6">
      <Suspense>
        <ChatManager
          yo={perfil}
          perfiles={equipo}
          problemasDesde={problemasDesde}
          initialGenerales={((generales.data || []) as Mensaje[]).reverse()}
          initialProblemas={problemas}
          initialComentarios={((comentarios.data || []) as Mensaje[]).reverse()}
          puedeAsistente={tienePermiso(session?.permisos, "sede.ver")}
        />
      </Suspense>
    </main>
  )
}
