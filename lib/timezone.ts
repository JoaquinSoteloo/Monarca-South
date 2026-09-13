/**
 * "Hoy" para el club es el día calendario en Argentina, no en UTC (donde
 * corren los servidores). Buenos Aires no observa horario de verano desde
 * 2009: su offset respecto de UTC es fijo, -03:00, todo el año — por eso
 * alcanza con este offset fijo para construir límites de día exactos, sin
 * depender de una base de datos de zonas horarias con reglas de DST.
 */
const ARGENTINA_TIME_ZONE = "America/Argentina/Buenos_Aires"
const ARGENTINA_UTC_OFFSET = "-03:00"

/** Fecha calendario (YYYY-MM-DD) en Argentina para el instante `date`. */
export function getArgentinaDateString(date: Date = new Date()): string {
  // El locale en-CA formatea como YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ARGENTINA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date)
}

/**
 * Límites del día calendario argentino que contiene `date`, como instantes
 * UTC listos para comparar contra una columna timestamptz: inicio
 * inclusive, inicio del día siguiente exclusivo.
 */
export function getArgentinaDayRangeUTC(date: Date = new Date()): { startUTC: string; endUTC: string } {
  const hoy = getArgentinaDateString(date)
  const inicio = new Date(`${hoy}T00:00:00${ARGENTINA_UTC_OFFSET}`)
  const fin = new Date(inicio.getTime() + 24 * 60 * 60 * 1000)
  return { startUTC: inicio.toISOString(), endUTC: fin.toISOString() }
}

/** Hora en formato 24h (HH:mm) en horario argentino, p. ej. "16:37". */
export function formatHoraArgentina(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: ARGENTINA_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date)
}

/** Fecha larga ("martes, 10 de junio") en el calendario argentino. */
export function formatFechaLargaArgentina(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: ARGENTINA_TIME_ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date)
}
