/**
 * Consumo del mes por socio, con la misma definición que usan las reglas de
 * entrega en la base (scripts/066): el límite mensual cuenta sólo los gramos
 * SUELTOS — los enrolados no consumen límite. Una entrega legacy sin
 * detalle_venta cuenta ventas.gramos completo.
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import { getArgentinaMonthStartUTC } from "@/lib/timezone"

export interface VentaParaConsumo {
  socio_id: string | null
  gramos: number | null
  detalles?: { gramos: number | null; genetica_id: string | null }[] | null
}

export function gramosSueltosDeVenta(venta: VentaParaConsumo): number {
  if (venta.detalles && venta.detalles.length > 0) {
    return venta.detalles
      .filter((d) => d.genetica_id)
      .reduce((sum, d) => sum + (Number(d.gramos) || 0), 0)
  }
  return Number(venta.gramos) || 0
}

export interface ResumenMes {
  /** Gramos sueltos entregados en el mes, por socio. */
  sueltosPorSocio: Record<string, number>
  /** Cantidad de entregas del mes, por socio (para el máximo de externos). */
  entregasPorSocio: Record<string, number>
}

export function resumirMes(ventas: VentaParaConsumo[]): ResumenMes {
  const sueltosPorSocio: Record<string, number> = {}
  const entregasPorSocio: Record<string, number> = {}
  for (const venta of ventas) {
    if (!venta.socio_id) continue
    sueltosPorSocio[venta.socio_id] = (sueltosPorSocio[venta.socio_id] || 0) + gramosSueltosDeVenta(venta)
    entregasPorSocio[venta.socio_id] = (entregasPorSocio[venta.socio_id] || 0) + 1
  }
  return { sueltosPorSocio, entregasPorSocio }
}

export async function obtenerResumenMes(supabase: SupabaseClient): Promise<ResumenMes> {
  const { data } = await supabase
    .from("ventas")
    .select("socio_id, gramos, detalles:detalle_venta(gramos, genetica_id)")
    .gte("created_at", getArgentinaMonthStartUTC())
  return resumirMes((data as VentaParaConsumo[] | null) ?? [])
}
