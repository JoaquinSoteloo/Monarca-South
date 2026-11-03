/**
 * Hasta dónde leyó cada uno cada conversación del Chat. Por ahora se guarda en
 * el navegador (localStorage): alcanza para el globito de «sin leer» en el
 * celular de cada uno, sin tocar la base. Si alguien usa dos aparatos, en cada
 * uno cuenta por separado.
 */

const LEIDOS = "monarca:chat:leidos"
const DESDE = "monarca:chat:desde"
/** Se dispara cuando cambia lo leído, para que la barra de abajo se actualice. */
export const EVENTO_LEIDOS = "monarca:chat-leidos"

export interface Leidos {
  leidos: Record<string, string>
  /** Desde cuándo cuenta lo no leído: la primera vez que se abrió la app en este aparato. */
  desde: string
}

export function leerLeidos(): Leidos {
  const ahora = new Date().toISOString()
  try {
    let desde = localStorage.getItem(DESDE)
    if (!desde) {
      desde = ahora
      localStorage.setItem(DESDE, desde)
    }
    const guardado = JSON.parse(localStorage.getItem(LEIDOS) || "{}") as unknown
    const leidos = guardado && typeof guardado === "object" ? (guardado as Record<string, string>) : {}
    return { leidos, desde }
  } catch {
    return { leidos: {}, desde: ahora }
  }
}

export function marcarLeida(clave: string, hasta: string) {
  try {
    const { leidos } = leerLeidos()
    if (leidos[clave] && leidos[clave] >= hasta) return
    localStorage.setItem(LEIDOS, JSON.stringify({ ...leidos, [clave]: hasta }))
    window.dispatchEvent(new Event(EVENTO_LEIDOS))
  } catch {
    // Sin localStorage (modo privado): no hay globitos, el chat anda igual.
  }
}
