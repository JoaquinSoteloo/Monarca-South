/**
 * Cómo se pagó una entrega (ventas.metodo_pago) y cada uno de sus pagos.
 *
 * 'retribucion' (scripts/091): se pagó con el sueldo de alguien del equipo, al
 * liquidar su retribución. No es plata que entra a la caja. Una entrega
 * pagada en parte así y en parte en plata queda 'mixto'.
 */
export type MetodoEntrega = "efectivo" | "transferencia" | "pendiente" | "mixto" | "retribucion"
export type MetodoPago = "efectivo" | "transferencia" | "retribucion"

const ETIQUETAS: Record<MetodoEntrega, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  pendiente: "Pendiente",
  mixto: "Mixto",
  retribucion: "Retribución",
}

export function etiquetaMetodo(metodo: string | null | undefined): string {
  if (!metodo) return "Pendiente"
  return ETIQUETAS[metodo as MetodoEntrega] ?? metodo
}

export interface EntregaParaCaja {
  total: number | string
  metodo_pago: string
  saldo_pendiente?: number | string | null
  pagos?: { monto: number | string; metodo_pago: string }[] | null
}

/**
 * La plata que entró por una entrega. Se cuenta entera por su método, como
 * siempre; si se pagó en parte o toda con la retribución, solo lo pagado en
 * plata, y recién cuando quedó paga (igual que las demás entregas con deuda).
 */
export function cobradoEnPlata(v: EntregaParaCaja): { efectivo: number; transferencia: number } {
  const pagos = v.pagos ?? []
  if (pagos.some((p) => p.metodo_pago === "retribucion")) {
    if ((Number(v.saldo_pendiente) || 0) > 0) return { efectivo: 0, transferencia: 0 }
    const suma = (metodo: string) =>
      pagos.filter((p) => p.metodo_pago === metodo).reduce((s, p) => s + (Number(p.monto) || 0), 0)
    return { efectivo: suma("efectivo"), transferencia: suma("transferencia") }
  }
  const total = Number(v.total) || 0
  if (v.metodo_pago === "efectivo") return { efectivo: total, transferencia: 0 }
  if (v.metodo_pago === "transferencia") return { efectivo: 0, transferencia: total }
  return { efectivo: 0, transferencia: 0 }
}
