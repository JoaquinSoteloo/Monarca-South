/**
 * Cambio de la propia contraseña (pantalla Mi cuenta, 03/11/2026: al equipo se
 * le dio a todos la misma para empezar). Reglas puras, sin Supabase.
 */

export const LARGO_MINIMO = 8

/** El problema a mostrar, o null si se puede cambiar. */
export function validarNuevaContrasena(actual: string, nueva: string, repetida?: string): string | null {
  if (!actual) return "Escribí tu contraseña actual."
  if (nueva.length < LARGO_MINIMO) return `La nueva tiene que tener al menos ${LARGO_MINIMO} caracteres.`
  if (repetida !== undefined && nueva !== repetida) return "Las dos contraseñas nuevas no coinciden."
  if (nueva === actual) return "La nueva tiene que ser distinta de la actual."
  return null
}

/** Mensajes de Supabase Auth en castellano (los que puede devolver al cambiarla). */
export function errorDeContrasena(mensaje: string): string {
  const m = mensaje.toLowerCase()
  if (m.includes("different from the old")) return "La nueva tiene que ser distinta de la actual."
  if (m.includes("weak") || m.includes("at least")) return "La nueva es muy fácil de adivinar: usá una más larga, con letras y números."
  if (m.includes("rate limit") || m.includes("too many")) return "Hubo muchos intentos seguidos. Probá en unos minutos."
  if (m.includes("reauthentication")) return "Por seguridad, cerrá sesión, volvé a entrar y probá de nuevo."
  return "No se pudo cambiar la contraseña. Probá de nuevo."
}
