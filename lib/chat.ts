/**
 * Chat (rediseño del 03/11/2026): un solo lugar para hablar. Junta el canal
 * «Todos», los privados (script 088), las tareas con un problema (sus
 * comentarios) y el asistente de cultivo. Lógica pura, sin Supabase.
 *
 * Conversaciones: "asistente", "todos", "p:<id de la persona>", "t:<id de la tarea>".
 */
import type { Mensaje, Perfil, Tarea } from "@/lib/equipo"

export type Conversacion =
  | { tipo: "asistente" }
  | { tipo: "todos" }
  | { tipo: "privado"; con: string }
  | { tipo: "tarea"; id: number }

export function leerConversacion(c: string | null | undefined): Conversacion | null {
  if (!c) return null
  if (c === "asistente") return { tipo: "asistente" }
  if (c === "todos") return { tipo: "todos" }
  if (c.startsWith("p:") && c.length > 2) return { tipo: "privado", con: c.slice(2) }
  if (c.startsWith("t:")) {
    const id = Number(c.slice(2))
    return Number.isInteger(id) && id > 0 ? { tipo: "tarea", id } : null
  }
  return null
}

export function claveConversacion(c: Conversacion): string {
  if (c.tipo === "privado") return `p:${c.con}`
  if (c.tipo === "tarea") return `t:${c.id}`
  return c.tipo
}

/** A qué conversación va un mensaje, visto por `yoId`. */
export function conversacionDeMensaje(m: Pick<Mensaje, "autor_id" | "tarea_id" | "para_id">, yoId: string): string {
  if (m.tarea_id) return `t:${m.tarea_id}`
  if (m.para_id) return `p:${m.autor_id === yoId ? m.para_id : m.autor_id}`
  return "todos"
}

/** Mensajes nuevos de otros en una conversación, después de la última vez que se leyó. */
export function contarSinLeer(
  mensajes: Pick<Mensaje, "autor_id" | "tarea_id" | "para_id" | "created_at">[],
  clave: string,
  yoId: string,
  leidoHasta: string | undefined,
): number {
  if (!leidoHasta) return 0
  return mensajes.filter((m) => m.autor_id !== yoId && m.created_at > leidoHasta && conversacionDeMensaje(m, yoId) === clave).length
}

/**
 * Las tareas con un problema que le importan a `yo`: las suyas, las de quienes
 * supervisa, las que lo afectan, o todas si ve todas las tareas.
 */
export function teInvolucra(t: Tarea, yo: Perfil, perfiles: Perfil[]): boolean {
  if (yo.ve_todas_las_tareas || t.responsable_id === yo.id || t.afecta_a.includes(yo.id)) return true
  return perfiles.find((p) => p.id === t.responsable_id)?.supervisor_id === yo.id
}

export interface FilaChat {
  clave: string
  tipo: "todos" | "privado" | "tarea"
  titulo: string
  /** Lo último que se dijo, ya con «Vos:» o el nombre adelante. */
  vistaPrevia: string
  ultimoAt: string | null
  sinLeer: number
}

interface ArmarLista {
  yo: Perfil
  perfiles: Perfil[]
  /** Mensajes sin tarea: «Todos» y los privados de `yo`. */
  generales: Mensaje[]
  /** Tareas con problema que le importan a `yo`. */
  problemas: Tarea[]
  /** Comentarios de esas tareas. */
  comentarios: Mensaje[]
  leidos: Record<string, string>
  /** Desde cuándo cuenta lo no leído si una conversación nunca se abrió. */
  desde: string
}

/** Las conversaciones de la lista: la más reciente arriba; las personas sin mensajes, al final. */
export function armarLista({ yo, perfiles, generales, problemas, comentarios, leidos, desde }: ArmarLista): FilaChat[] {
  const nombre = (id: string) => (id === yo.id ? "Vos" : (perfiles.find((p) => p.id === id)?.nombre ?? "Alguien"))
  const ultimo = (ms: Mensaje[]) => ms.reduce<Mensaje | null>((u, m) => (!u || m.created_at > u.created_at ? m : u), null)
  const leido = (clave: string) => (leidos[clave] && leidos[clave] > desde ? leidos[clave] : desde)
  const todosLosMensajes = [...generales, ...comentarios]

  const filas: FilaChat[] = []

  const delCanal = generales.filter((m) => !m.para_id)
  const uTodos = ultimo(delCanal)
  filas.push({
    clave: "todos",
    tipo: "todos",
    titulo: "Todos",
    vistaPrevia: uTodos ? `${nombre(uTodos.autor_id)}: ${uTodos.cuerpo}` : "El canal de todo el equipo",
    ultimoAt: uTodos?.created_at ?? null,
    sinLeer: contarSinLeer(todosLosMensajes, "todos", yo.id, leido("todos")),
  })

  for (const t of problemas) {
    const clave = `t:${t.id}`
    const u = ultimo(comentarios.filter((m) => m.tarea_id === t.id))
    const avisado = t.completada_at ?? t.created_at
    const mas = u && u.created_at > avisado
    filas.push({
      clave,
      tipo: "tarea",
      titulo: t.titulo,
      vistaPrevia: mas && u ? `${nombre(u.autor_id)}: ${u.cuerpo}` : t.nota ? `${nombre(t.responsable_id)}: ${t.nota}` : "Problema avisado",
      ultimoAt: mas && u ? u.created_at : avisado,
      sinLeer: contarSinLeer(todosLosMensajes, clave, yo.id, leido(clave)),
    })
  }

  for (const p of perfiles) {
    if (p.id === yo.id || !p.activo) continue
    const clave = `p:${p.id}`
    const u = ultimo(generales.filter((m) => m.para_id && conversacionDeMensaje(m, yo.id) === clave))
    filas.push({
      clave,
      tipo: "privado",
      titulo: p.nombre,
      vistaPrevia: u ? (u.autor_id === yo.id ? `Vos: ${u.cuerpo}` : u.cuerpo) : "Sin mensajes todavía",
      ultimoAt: u?.created_at ?? null,
      sinLeer: contarSinLeer(todosLosMensajes, clave, yo.id, leido(clave)),
    })
  }

  return filas.sort((a, b) => {
    if (a.ultimoAt && b.ultimoAt) return b.ultimoAt.localeCompare(a.ultimoAt)
    if (a.ultimoAt) return -1
    if (b.ultimoAt) return 1
    // Sin mensajes todavía: primero el canal de todos, después las personas.
    if (a.tipo === "todos") return -1
    if (b.tipo === "todos") return 1
    return a.titulo.localeCompare(b.titulo)
  })
}

/** Mensajes de una conversación (sin el asistente), del más viejo al más nuevo. */
export function mensajesDe(conv: Conversacion, generales: Mensaje[], comentarios: Mensaje[], yoId: string): Mensaje[] {
  const clave = claveConversacion(conv)
  const fuente = conv.tipo === "tarea" ? comentarios : generales
  return fuente.filter((m) => conversacionDeMensaje(m, yoId) === clave).sort((a, b) => a.created_at.localeCompare(b.created_at))
}

/** "Hoy", "Ayer" o "lunes 2/11" para separar los mensajes por día (hora argentina). */
export function etiquetaDia(iso: string, ahora: Date = new Date()): string {
  const zona = { timeZone: "America/Argentina/Buenos_Aires" }
  const dia = (d: Date) => d.toLocaleDateString("en-CA", zona)
  const d = new Date(iso)
  if (dia(d) === dia(ahora)) return "Hoy"
  if (dia(d) === dia(new Date(ahora.getTime() - 86400000))) return "Ayer"
  const [, mes, num] = dia(d).split("-").map(Number)
  return `${d.toLocaleDateString("es-AR", { ...zona, weekday: "long" })} ${num}/${mes}`
}
