/**
 * Pantalla Hoy (rediseño de Equipo, 03/11/2026): lo que hace cada persona en
 * el día, una tarea por vez. Lógica pura, sin Supabase, para poder testearla.
 */
import type { Perfil, Tarea } from "@/lib/equipo"

export interface DiaPersona {
  /** La primera pendiente por orden: la que se muestra grande. */
  actual: Tarea | null
  /** El resto de las pendientes, en orden. */
  despues: Tarea[]
  /** Con un problema avisado. */
  problemas: Tarea[]
  /** Hechas, la última primero. */
  hechas: Tarea[]
  total: number
}

const porOrden = (a: Tarea, b: Tarea) => a.orden - b.orden || a.id - b.id

export function separarDia(tareas: Tarea[]): DiaPersona {
  const pendientes = tareas.filter((t) => t.estado === "pendiente").sort(porOrden)
  return {
    actual: pendientes[0] ?? null,
    despues: pendientes.slice(1),
    problemas: tareas.filter((t) => t.estado === "problema").sort(porOrden),
    hechas: tareas
      .filter((t) => t.estado === "hecha")
      .sort((a, b) => (b.completada_at ?? "").localeCompare(a.completada_at ?? "") || porOrden(a, b)),
    total: tareas.length,
  }
}

/** "Martes 3 de noviembre" para una fecha YYYY-MM-DD. */
export function fechaLarga(fecha: string): string {
  const [y, m, d] = fecha.split("-").map(Number)
  const texto = new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  })
  const limpio = texto.replace(",", "")
  return limpio.charAt(0).toUpperCase() + limpio.slice(1)
}

/** Quién puede marcar una tarea: quien la hace, quien ve todas y su supervisor. */
export function puedeEditarTarea(tarea: Tarea, yo: Perfil, perfiles: Perfil[]): boolean {
  if (tarea.responsable_id === yo.id || yo.ve_todas_las_tareas) return true
  return perfiles.find((p) => p.id === tarea.responsable_id)?.supervisor_id === yo.id
}

/**
 * A quién le llega un problema, con la misma regla que el aviso de la base
 * (scripts/077): el supervisor de quien hace la tarea, los que afecta y
 * quienes ven todas las tareas. Sin uno mismo.
 */
export function destinatariosProblema(tarea: Tarea, perfiles: Perfil[], yoId: string): Perfil[] {
  const responsable = perfiles.find((p) => p.id === tarea.responsable_id)
  const ids = new Set<string>(tarea.afecta_a)
  if (responsable?.supervisor_id) ids.add(responsable.supervisor_id)
  for (const p of perfiles) if (p.activo && p.ve_todas_las_tareas) ids.add(p.id)
  ids.delete(yoId)
  // Primero el supervisor (el que tiene que actuar), después el resto por nombre.
  return perfiles
    .filter((p) => ids.has(p.id))
    .sort((a, b) =>
      a.id === responsable?.supervisor_id ? -1 : b.id === responsable?.supervisor_id ? 1 : a.nombre.localeCompare(b.nombre),
    )
}

/** "Facundo" para "Facundo Velazquez"; si el nombre todavía es un mail, lo de antes de la arroba. */
export function primerNombre(nombre: string): string {
  return nombre.split("@")[0].trim().split(/\s+/)[0] || nombre
}

/** "Lucho", "Lucho y Facundo", "Lucho, Facundo y Joaquín". */
export function listaNombres(nombres: string[]): string {
  if (nombres.length <= 1) return nombres[0] ?? ""
  return `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`
}

export interface ResumenPersona {
  persona: Perfil
  hechas: number
  problemas: number
  total: number
  porcentaje: number
}

/**
 * Vista equipo: cuánto lleva cada uno (sin uno mismo, que está en «Mis
 * tareas»). Primero quien tiene un problema, después quien más le falta.
 */
export function resumenEquipo(personas: Perfil[], tareas: Tarea[], yoId: string): ResumenPersona[] {
  return personas
    .filter((p) => p.id !== yoId)
    .map((persona) => {
      const suyas = tareas.filter((t) => t.responsable_id === persona.id)
      const hechas = suyas.filter((t) => t.estado === "hecha").length
      return {
        persona,
        hechas,
        problemas: suyas.filter((t) => t.estado === "problema").length,
        total: suyas.length,
        porcentaje: suyas.length === 0 ? 0 : Math.round((hechas / suyas.length) * 100),
      }
    })
    .filter((r) => r.total > 0)
    .sort((a, b) => b.problemas - a.problemas || a.porcentaje - b.porcentaje || a.persona.nombre.localeCompare(b.persona.nombre))
}

/** Personas del equipo sin tareas en el día (para nombrarlas abajo, sin una fila vacía cada una). */
export function sinTareas(personas: Perfil[], tareas: Tarea[], yoId: string): Perfil[] {
  const conTareas = new Set(tareas.map((t) => t.responsable_id))
  return personas.filter((p) => p.id !== yoId && !conTareas.has(p.id))
}
