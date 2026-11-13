import type { CicloCama, MapaMacetas } from "@/lib/types"

export const MAPA_VACIO: MapaMacetas = { filas: 2, columnas: 4, macetas: [] }

export function fechaLocal(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

function diaUTC(value: string): number {
  const [y, m, d] = value.split("-").map(Number)
  return Date.UTC(y, m - 1, d)
}

// Fechas civiles: no cambia el conteo con la zona horaria ni el horario de verano.
export function diasEntre(inicio: string | null, fin: string | null, hoy = fechaLocal()): number | null {
  if (!inicio) return null
  const diff = diaUTC(fin || hoy) - diaUTC(inicio)
  return Number.isFinite(diff) && diff >= 0 ? Math.floor(diff / 86_400_000) : null
}

export function validarCicloCama(cama: CicloCama, hoy = fechaLocal()): string | null {
  const fechas = [cama.fecha_vegetativo, cama.fecha_floracion, cama.fecha_cosecha].filter((v): v is string => !!v)
  if (fechas.some(f => !/^\d{4}-\d{2}-\d{2}$/.test(f) || f > hoy)) return "Usá fechas registradas válidas, hasta hoy."
  if (fechas.some((f, i) => i > 0 && f < fechas[i - 1])) return "Las fechas deben seguir el orden vegetativo, floración y cosecha."
  if (cama.estado === "vegetativo" && (cama.fecha_floracion || cama.fecha_cosecha)) return "La etapa vegetativa no puede tener fechas posteriores de floración o cosecha."
  if (cama.estado === "floracion" && cama.fecha_cosecha) return "Revisá la etapa: hay una fecha de cosecha registrada."
  return null
}

export function redimensionarMapa(mapa: MapaMacetas, filas: number, columnas: number): MapaMacetas {
  if (![filas, columnas].every(n => Number.isInteger(n) && n >= 1 && n <= 12)) throw new Error("Elegí entre 1 y 12 filas y columnas.")
  if (mapa.macetas.some(m => m.fila >= filas || m.columna >= columnas)) throw new Error("Hay macetas fuera del nuevo tamaño. Quitalas de esas posiciones antes de reducir la cama.")
  return { ...mapa, filas, columnas }
}

export interface CargaCama {
  /** Genética del Stock, o null si se carga solo con un nombre (genéticas que no están en Stock). */
  genetica_id: string | null
  /** Nombre que se muestra cuando la genética no está en Stock; vacío si viene del Stock. */
  etiqueta: string
  /** Cuántas macetas cargar, o "todas" para completar la cama. */
  cantidad: number | "todas"
  /** true: vacía la cama antes de cargar (pisa lo que había). */
  reemplazar: boolean
}

/**
 * Carga varias macetas de una vez con la misma genética (pedido de Facundo, 06/11/2026).
 * Llena las posiciones vacías en orden de lectura (A1, A2… B1…) y deja como están las
 * que ya tenían maceta, salvo con `reemplazar`. Se puede repetir con otra genética para
 * completar el resto de la cama.
 */
export function cargarCama(mapa: MapaMacetas, carga: CargaCama): { mapa: MapaMacetas; cargadas: number } {
  const etiqueta = carga.etiqueta.trim()
  if (!carga.genetica_id && !etiqueta) throw new Error("Elegí una genética o escribí su nombre.")
  const base = carga.reemplazar ? [] : mapa.macetas
  const ocupada = new Set(base.map(m => `${m.fila}-${m.columna}`))
  const libres: Array<[number, number]> = []
  for (let fila = 0; fila < mapa.filas; fila++)
    for (let columna = 0; columna < mapa.columnas; columna++)
      if (!ocupada.has(`${fila}-${columna}`)) libres.push([fila, columna])
  if (libres.length === 0) throw new Error("La cama ya está completa. Usá «Reemplazar lo cargado» para pisarla.")
  const pedidas = carga.cantidad === "todas" ? libres.length : carga.cantidad
  if (!Number.isInteger(pedidas) || pedidas < 1) throw new Error("Indicá cuántas macetas cargar (1 o más).")
  if (pedidas > libres.length) throw new Error(`Solo quedan ${libres.length} posiciones libres en la cama.`)
  const nuevas = libres.slice(0, pedidas).map(([fila, columna]) => ({
    fila, columna, etiqueta, genetica_id: carga.genetica_id, salud: "sin_evaluar" as const, notas: "",
  }))
  return { mapa: { ...mapa, macetas: [...base, ...nuevas] }, cargadas: nuevas.length }
}
