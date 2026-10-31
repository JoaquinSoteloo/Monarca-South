/**
 * Equipo: perfiles, tareas, avisos y conversación (scripts 067 y 068).
 * Lógica pura, sin Supabase, para poder testearla.
 */

export type RolEquipo = "direccion" | "cultivo" | "mantenimiento" | "atencion" | "ayudante"
export type EstadoTarea = "pendiente" | "hecha" | "problema"
export type FrecuenciaPlantilla = "semanal" | "mensual_dia" | "mensual_primer"

export interface Perfil {
  id: string
  nombre: string
  rol: RolEquipo
  ve_todas_las_tareas: boolean
  supervisor_id: string | null
  activo: boolean
}

export interface Tarea {
  id: number
  fecha: string
  titulo: string
  detalle: string | null
  responsable_id: string
  creada_por: string | null
  plantilla_id: number | null
  afecta_a: string[]
  estado: EstadoTarea
  nota: string | null
  completada_at: string | null
  completada_por: string | null
  orden: number
  created_at: string
}

export interface TareaPlantilla {
  id: number
  titulo: string
  detalle: string | null
  responsable_id: string
  afecta_a: string[]
  frecuencia: FrecuenciaPlantilla
  dias_semana: number[]
  dia_mes: number | null
  orden: number
  activo: boolean
}

export interface Notificacion {
  id: number
  destinatario_id: string
  autor_id: string | null
  tipo: "tarea_hecha" | "tarea_problema" | "tarea_nueva" | "comentario" | "riego" | "otro"
  titulo: string
  cuerpo: string | null
  tarea_id: number | null
  enlace: string | null
  leida: boolean
  created_at: string
}

export interface Mensaje {
  id: number
  autor_id: string
  tarea_id: number | null
  cuerpo: string
  created_at: string
}

export const ROL_LABEL: Record<RolEquipo, string> = {
  direccion: "Dirección",
  cultivo: "Cultivo",
  mantenimiento: "Mantenimiento",
  atencion: "Atención",
  ayudante: "Ayudante",
}

export const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"] as const

/** Personas cuyas tareas ve `yo`: todas si ve_todas_las_tareas; si no, las propias y las de quienes supervisa. */
export function personasVisibles(yo: Perfil, perfiles: Perfil[]): Perfil[] {
  const activos = perfiles.filter((p) => p.activo)
  if (yo.ve_todas_las_tareas) return activos
  return activos.filter((p) => p.id === yo.id || p.supervisor_id === yo.id)
}

/** Tareas ordenadas: primero las de `yo`, luego por persona, pendientes primero y por orden. */
export function ordenarTareas(tareas: Tarea[], perfiles: Perfil[], yoId: string): Tarea[] {
  const nombre = new Map(perfiles.map((p) => [p.id, p.nombre]))
  const pesoEstado: Record<EstadoTarea, number> = { problema: 0, pendiente: 1, hecha: 2 }
  return [...tareas].sort((a, b) => {
    if (a.responsable_id !== b.responsable_id) {
      if (a.responsable_id === yoId) return -1
      if (b.responsable_id === yoId) return 1
      return (nombre.get(a.responsable_id) ?? "").localeCompare(nombre.get(b.responsable_id) ?? "")
    }
    if (pesoEstado[a.estado] !== pesoEstado[b.estado]) return pesoEstado[a.estado] - pesoEstado[b.estado]
    return a.orden - b.orden || a.id - b.id
  })
}

export interface Progreso {
  total: number
  hechas: number
  problemas: number
  pendientes: number
  porcentaje: number
}

export function progreso(tareas: Tarea[]): Progreso {
  const hechas = tareas.filter((t) => t.estado === "hecha").length
  const problemas = tareas.filter((t) => t.estado === "problema").length
  const total = tareas.length
  return {
    total,
    hechas,
    problemas,
    pendientes: total - hechas - problemas,
    porcentaje: total === 0 ? 0 : Math.round(((hechas + problemas) / total) * 100),
  }
}

/** "Lun a Sáb", "Lun, Mié y Vie", "Todos los días", "El 5 de cada mes", "Primer lunes del mes". */
export function describirFrecuencia(p: Pick<TareaPlantilla, "frecuencia" | "dias_semana" | "dia_mes">): string {
  if (p.frecuencia === "mensual_dia") return `El ${p.dia_mes} de cada mes`
  const largos = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]
  if (p.frecuencia === "mensual_primer") return `Primer ${largos[(p.dias_semana[0] ?? 1) - 1]} del mes`
  const dias = [...new Set(p.dias_semana)].filter((d) => d >= 1 && d <= 7).sort((a, b) => a - b)
  if (dias.length === 7) return "Todos los días"
  if (dias.length === 0) return "Nunca"
  const consecutivos = dias.every((d, i) => i === 0 || d === dias[i - 1] + 1)
  if (consecutivos && dias.length >= 3) return `${DIAS[dias[0] - 1]} a ${DIAS[dias[dias.length - 1] - 1]}`
  const nombres = dias.map((d) => DIAS[d - 1])
  return nombres.length === 1 ? `Cada ${largos[dias[0] - 1]}` : `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`
}

/**
 * A quién avisar cuando una carga de riego tiene alertas: a quienes ven todas
 * las tareas (Facundo y Lucho) y al supervisor de quien cargó, menos a uno mismo.
 */
export function destinatariosAlertaRiego(yo: Perfil | null, perfiles: Perfil[]): string[] {
  const ids = new Set<string>()
  for (const p of perfiles) if (p.activo && p.ve_todas_las_tareas) ids.add(p.id)
  if (yo?.supervisor_id) ids.add(yo.supervisor_id)
  if (yo) ids.delete(yo.id)
  return [...ids]
}

/** Hora corta para mensajes: "14:05" si es hoy, "30/10 14:05" si no. */
export function horaCorta(iso: string, ahora: Date = new Date()): string {
  const d = new Date(iso)
  const opts: Intl.DateTimeFormatOptions = { timeZone: "America/Argentina/Buenos_Aires" }
  const dia = (x: Date) => x.toLocaleDateString("es-AR", { ...opts, day: "2-digit", month: "2-digit" })
  const hora = d.toLocaleTimeString("es-AR", { ...opts, hour: "2-digit", minute: "2-digit", hour12: false })
  return dia(d) === dia(ahora) ? hora : `${dia(d)} ${hora}`
}
