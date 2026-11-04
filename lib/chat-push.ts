/**
 * Push del Chat (script 090): a quién le llega cada mensaje nuevo y qué dice
 * la notificación. Lógica pura, sin Supabase; la usa /api/chat/notificar.
 */
import type { Mensaje, Perfil, Tarea } from "@/lib/equipo"
import type { PushPayload } from "@/lib/push/send"
import { conversacionDeMensaje, teInvolucra } from "@/lib/chat"

type MensajeNuevo = Pick<Mensaje, "autor_id" | "tarea_id" | "para_id" | "cuerpo">
type TareaDelMensaje = Pick<Tarea, "titulo" | "responsable_id" | "afecta_a">

export interface AvisoPush {
  /** Ids de equipo_perfiles (los usuarios de Supabase Auth). */
  destinatarios: string[]
  payload: PushPayload
}

/**
 * A quién avisar, nunca a quien escribió ni a alguien dado de baja:
 *   - «Todos»: todo el equipo.
 *   - Privado: a quien va.
 *   - Comentario de tarea: a quienes la ven en el Chat (teInvolucra): quien la
 *     hace, su supervisor, los afectados y quienes ven todas las tareas.
 */
export function destinatariosDeMensaje(m: MensajeNuevo, perfiles: Perfil[], tarea: TareaDelMensaje | null): string[] {
  const otros = perfiles.filter((p) => p.activo && p.id !== m.autor_id)
  if (m.tarea_id) return tarea ? otros.filter((p) => teInvolucra(tarea, p, perfiles)).map((p) => p.id) : []
  if (m.para_id) return otros.filter((p) => p.id === m.para_id).map((p) => p.id)
  return otros.map((p) => p.id)
}

/** El texto en una sola línea, cortado en `max` letras con «…». */
export function recortar(texto: string, max = 120): string {
  const linea = texto.replace(/\s+/g, " ").trim()
  const letras = Array.from(linea)
  return letras.length <= max ? linea : `${letras.slice(0, max - 1).join("").trimEnd()}…`
}

/** Lo que dice la notificación: «Lucho en Todos», «Lucho te escribió» o «Comentario en …». */
export function avisoDeMensaje(m: MensajeNuevo, perfiles: Perfil[], tarea: TareaDelMensaje | null): AvisoPush {
  const autor = perfiles.find((p) => p.id === m.autor_id)?.nombre ?? "Alguien"
  // La conversación vista por quien lo recibe: en un privado, la del autor.
  const clave = conversacionDeMensaje(m, m.para_id ?? "")
  const enTarea = Boolean(m.tarea_id)
  const title = enTarea ? `Comentario en ${tarea?.titulo ?? "una tarea"}` : m.para_id ? `${autor} te escribió` : `${autor} en Todos`
  return {
    destinatarios: destinatariosDeMensaje(m, perfiles, tarea),
    payload: {
      title,
      // En una tarea el título no dice quién escribió.
      body: recortar(enTarea ? `${autor}: ${m.cuerpo}` : m.cuerpo),
      url: `/chat?c=${clave}`,
      tag: `chat-${clave}`,
    },
  }
}
