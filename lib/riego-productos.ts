/**
 * Productos de la mezcla del riego (pedido de Facundo, 18/11/2026; script 105).
 *
 * Lista fija para que cada producto tenga un solo nombre. Las dosis sugeridas
 * salen de lo ya decidido con Lucho (registro de decisiones):
 * - Tabla Ryanodine AB+C para coco (versión 20/01/26): flora semanas 1–3
 *   Maikro AB 4 ml/L + Calcis 4 ml/L; desde la semana 4 el Calcis baja a
 *   2,8 ml/L; las 2 últimas semanas antes del lavado, Mikro B 4 ml/L + Finis
 *   0,91 g/L (sin Maikro AB ni Calcis).
 * - Rhino Skin (silicio) 2 ml/L, semanas 1 a 6 de flora, primero en el agua.
 * - King Crab 0,13 ml/L, los miércoles, en todas las salas de flora, hasta el
 *   lavado.
 * - Lavado: solo agua.
 * En vege no hay tabla cargada: no se sugiere nada y Lucho pone sus dosis.
 */

export type UnidadDosis = "ml/L" | "g/L"

export interface ProductoRiegoDef {
  clave: string
  nombre: string
  corto: string
  unidad: UnidadDosis
}

export const PRODUCTOS_RIEGO: ProductoRiegoDef[] = [
  { clave: "rhino_skin", nombre: "Rhino Skin (silicio)", corto: "Si", unidad: "ml/L" },
  { clave: "maikro_ab", nombre: "Maikro AB (Ryanodine)", corto: "AB", unidad: "ml/L" },
  { clave: "calcis", nombre: "Calcis C (Ryanodine)", corto: "C", unidad: "ml/L" },
  { clave: "mikro_b", nombre: "Mikro B (Ryanodine)", corto: "MB", unidad: "ml/L" },
  { clave: "finis", nombre: "Finis (Ryanodine)", corto: "Fin", unidad: "g/L" },
  { clave: "king_crab", nombre: "King Crab", corto: "KC", unidad: "ml/L" },
  { clave: "melaza", nombre: "Melaza", corto: "Mel", unidad: "ml/L" },
]

/** Lo que se guarda en registros_riego.productos (JSONB). */
export interface ProductoRiego {
  clave: string
  nombre: string
  dosis: number
  unidad: UnidadDosis
}

export const KING_CRAB_DOSIS = 0.13

/** 0 = domingo … 3 = miércoles. Fecha yyyy-MM-dd. */
export function diaSemana(fecha: string): number | null {
  const t = Date.parse(`${fecha}T12:00:00Z`)
  return Number.isNaN(t) ? null : new Date(t).getUTCDay()
}

type Etapa = "esqueje" | "vegetativo" | "floracion" | "lavado"

/**
 * Dosis sugeridas (clave → dosis) para la etapa, la semana y el día.
 * `tramoFinal` = las 2 semanas antes del lavado (Mikro B + Finis).
 */
export function dosisSugeridas(etapa: Etapa, semana: number | null, fecha: string, tramoFinal = false): Record<string, number> {
  if (etapa !== "floracion" || semana === 8) return {}
  const d: Record<string, number> = {}
  if (semana === null || semana <= 6) d.rhino_skin = 2
  if (tramoFinal) {
    d.mikro_b = 4
    d.finis = 0.91
  } else {
    d.maikro_ab = 4
    d.calcis = semana !== null && semana >= 4 ? 2.8 : 4
  }
  if (diaSemana(fecha) === 3) d.king_crab = KING_CRAB_DOSIS
  return d
}

const fmt = (n: number) => String(Math.round(n * 1000) / 1000).replace(".", ",")

/** "Si 2 · AB 4 · C 2,8 · KC 0,13" para la tabla. */
export function resumenProductos(ps: ProductoRiego[] | null | undefined): string {
  if (!ps?.length) return "—"
  return ps
    .map((p) => `${PRODUCTOS_RIEGO.find((d) => d.clave === p.clave)?.corto ?? p.nombre} ${fmt(p.dosis)}`)
    .join(" · ")
}

/** Cantidad total para el tanque: dosis × litros (ml o g), redondeada a 0,1. */
export function totalTanque(dosis: number, litros: number | null): number | null {
  if (litros === null || !(litros > 0) || !(dosis > 0)) return null
  return Math.round(dosis * litros * 10) / 10
}

/** Normaliza lo guardado (puede venir de versiones viejas o con basura). */
export function productosDe(v: unknown): ProductoRiego[] {
  if (!Array.isArray(v)) return []
  return v
    .map((p) => {
      const o = (p ?? {}) as Record<string, unknown>
      const dosis = Number(o.dosis)
      const clave = typeof o.clave === "string" ? o.clave : "otro"
      const nombre = typeof o.nombre === "string" && o.nombre.trim() ? o.nombre.trim() : clave
      const unidad: UnidadDosis = o.unidad === "g/L" ? "g/L" : "ml/L"
      return Number.isFinite(dosis) && dosis > 0 ? { clave, nombre, dosis, unidad } : null
    })
    .filter((p): p is ProductoRiego => p !== null)
}

export interface AlertaProductos {
  nivel: "atencion" | "info"
  mensaje: string
}

/**
 * Avisos de la mezcla. Solo mira productos si el riego los tiene cargados
 * (o si es miércoles de flora, para recordar el King Crab).
 */
export function evaluarProductos(
  etapa: Etapa,
  semana: number | null,
  fecha: string | undefined,
  productos: ProductoRiego[] | null | undefined,
): AlertaProductos[] {
  const a: AlertaProductos[] = []
  const ps = productos ?? []
  const tiene = (c: string) => ps.find((p) => p.clave === c)
  const esLavado = etapa === "lavado" || (etapa === "floracion" && semana === 8)

  if (esLavado) {
    if (ps.length) a.push({ nivel: "atencion", mensaje: "En el lavado va solo agua: este riego tiene productos cargados." })
    return a
  }
  if (etapa === "floracion") {
    if (fecha && diaSemana(fecha) === 3 && ps.length && !tiene("king_crab")) {
      a.push({ nivel: "info", mensaje: `Hoy es miércoles: falta el King Crab (${fmt(KING_CRAB_DOSIS)} ml/L, al final, con el pH ya ajustado).` })
    }
    const kc = tiene("king_crab")
    if (kc && kc.dosis > 0.2) {
      a.push({ nivel: "atencion", mensaje: `King Crab a ${fmt(kc.dosis)} ml/L: la dosis es ${fmt(KING_CRAB_DOSIS)} ml/L (125 L → 16 ml).` })
    }
    if (tiene("rhino_skin") && semana !== null && semana >= 7) {
      a.push({ nivel: "info", mensaje: "Desde la semana 7 de flora la mezcla va sin Rhino Skin (silicio)." })
    }
    const c = tiene("calcis")
    if (c && semana !== null && semana >= 4 && c.dosis > 3) {
      a.push({ nivel: "info", mensaje: `Calcis a ${fmt(c.dosis)} ml/L: desde la semana 4 la tabla lo baja a 2,8 ml/L.` })
    }
  }
  if (tiene("finis") && (tiene("maikro_ab") || tiene("calcis"))) {
    a.push({ nivel: "info", mensaje: "Con Finis va Mikro B, sin Maikro AB ni Calcis." })
  }
  return a
}
