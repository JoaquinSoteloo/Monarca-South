/**
 * Ranking de genéticas por gramos entregados (pedido de Facundo, 02/11/2026):
 * sirve para decidir qué genéticas quedan cuando se reduzca el catálogo.
 *
 * Cuenta por cada línea de detalle_venta con genética:
 *   - sueltos   = gramos de la línea (lo que consume límite, como lib/consumo.ts)
 *   - enrolados = peso_enrolados, o cantidad_enrolados × peso_por_enrolado
 * Una entrega legacy sin detalle cuenta ventas.gramos para ventas.genetica_id.
 * Las líneas de productos (sin genética) no cuentan.
 */

export interface DetalleParaRanking {
  genetica_id: string | null
  gramos: number | string | null
  cantidad_enrolados?: number | string | null
  peso_enrolados?: number | string | null
  peso_por_enrolado?: number | string | null
}

export interface VentaParaRanking {
  id?: string
  genetica_id?: string | null
  gramos?: number | string | null
  detalles?: DetalleParaRanking[] | null
}

export interface FilaRanking {
  genetica_id: string
  nombre: string
  sueltos: number
  enrolados: number
  total: number
  /** Entregas distintas en las que apareció la genética. */
  entregas: number
  /** Parte del total entregado en el período (0 a 1). */
  participacion: number
}

const num = (v: number | string | null | undefined): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

const redondear = (n: number) => Math.round(n * 10) / 10

export function pesoEnrolados(d: DetalleParaRanking): number {
  if (d.peso_enrolados != null && num(d.peso_enrolados) > 0) return num(d.peso_enrolados)
  return redondear(num(d.cantidad_enrolados) * num(d.peso_por_enrolado))
}

export function rankingGeneticas(
  ventas: VentaParaRanking[],
  nombres: Record<string, string>,
): FilaRanking[] {
  const acc = new Map<string, { sueltos: number; enrolados: number; entregas: number }>()
  const sumar = (id: string, sueltos: number, enrolados: number, nuevaEntrega: boolean) => {
    const fila = acc.get(id) ?? { sueltos: 0, enrolados: 0, entregas: 0 }
    fila.sueltos += sueltos
    fila.enrolados += enrolados
    if (nuevaEntrega) fila.entregas += 1
    acc.set(id, fila)
  }

  for (const venta of ventas) {
    const detalles = (venta.detalles ?? []).filter((d) => d.genetica_id)
    if (detalles.length > 0) {
      const vistas = new Set<string>()
      for (const d of detalles) {
        const id = d.genetica_id as string
        sumar(id, num(d.gramos), pesoEnrolados(d), !vistas.has(id))
        vistas.add(id)
      }
    } else if ((venta.detalles ?? []).length === 0 && venta.genetica_id) {
      sumar(venta.genetica_id, num(venta.gramos), 0, true)
    }
  }

  const filas = [...acc.entries()].map(([genetica_id, f]) => ({
    genetica_id,
    nombre: nombres[genetica_id] ?? "Genética sin nombre",
    sueltos: redondear(f.sueltos),
    enrolados: redondear(f.enrolados),
    total: redondear(f.sueltos + f.enrolados),
    entregas: f.entregas,
    participacion: 0,
  }))
  const totalGeneral = filas.reduce((s, f) => s + f.total, 0)
  for (const f of filas) f.participacion = totalGeneral > 0 ? f.total / totalGeneral : 0
  return filas
    .filter((f) => f.total > 0)
    .sort((a, b) => b.total - a.total || b.entregas - a.entregas || a.nombre.localeCompare(b.nombre, "es"))
}

export type PeriodoRanking = "30d" | "90d" | "anio" | "todo"

export const PERIODOS_RANKING: { valor: PeriodoRanking; etiqueta: string }[] = [
  { valor: "30d", etiqueta: "Últimos 30 días" },
  { valor: "90d", etiqueta: "Últimos 90 días" },
  { valor: "anio", etiqueta: "Este año" },
  { valor: "todo", etiqueta: "Todo" },
]

/** Fecha ISO desde la que se cuentan las entregas; null = sin límite. */
export function desdePeriodo(periodo: PeriodoRanking, hoy: Date = new Date()): string | null {
  if (periodo === "todo") return null
  if (periodo === "anio") return new Date(Date.UTC(hoy.getUTCFullYear(), 0, 1, 3)).toISOString()
  const dias = periodo === "30d" ? 30 : 90
  return new Date(hoy.getTime() - dias * 864e5).toISOString()
}
