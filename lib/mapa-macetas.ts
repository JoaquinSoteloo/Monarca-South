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
