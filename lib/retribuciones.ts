/**
 * Retribuciones del equipo (scripts/072 y 091): cuentas puras, sin Supabase.
 *
 * El consumo de un mes va del día 5 al 4 del mes siguiente, en hora argentina:
 * el sueldo de octubre se paga el 5 de noviembre y descuenta la deuda de las
 * entregas hasta el 4/11. liquidar_retribucion usa el mismo corte.
 */

/** Argentina está en UTC−3 todo el año (no tiene horario de verano). */
const HORA_ARGENTINA = "-03:00"

function redondear(n: number) {
  return Math.round(n * 100) / 100
}

/** Primer día del mes siguiente (yyyy-mm-01). */
export function mesSiguiente(periodo: string): string {
  const [y, m] = periodo.split("-").map(Number)
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`
}

/** Desde y hasta (sin incluir) el consumo del mes `periodo` (yyyy-mm-01). */
export function ventanaConsumo(periodo: string): { desde: Date; hasta: Date } {
  return {
    desde: new Date(`${periodo.slice(0, 7)}-05T00:00:00${HORA_ARGENTINA}`),
    hasta: new Date(`${mesSiguiente(periodo).slice(0, 7)}-05T00:00:00${HORA_ARGENTINA}`),
  }
}

/** Si una entrega cuenta para el consumo del mes `periodo`. */
export function enVentana(iso: string, periodo: string): boolean {
  const t = new Date(iso).getTime()
  const { desde, hasta } = ventanaConsumo(periodo)
  return t >= desde.getTime() && t < hasta.getTime()
}

/** Las fechas del consumo de un mes: "5/10 al 4/11". */
export function textoVentana(periodo: string): string {
  return `5/${Number(periodo.slice(5, 7))} al ${corteDeuda(periodo)}`
}

/** El último día que cuenta para el sueldo del mes: "4/11" para octubre. */
export function corteDeuda(periodo: string): string {
  return `4/${Number(mesSiguiente(periodo).slice(5, 7))}`
}

export interface EntregaConDeuda {
  socio_id: string
  saldo_pendiente: number | string | null
  created_at: string
}

/**
 * Lo que debe el socio de entregas anteriores al día 5 del mes siguiente: lo
 * que se puede descontar del sueldo de `periodo`, incluida la deuda más vieja.
 */
export function deudaParaDescontar(entregas: EntregaConDeuda[], socioId: string | null, periodo: string): number {
  if (!socioId) return 0
  const hasta = ventanaConsumo(periodo).hasta.getTime()
  return redondear(
    entregas
      .filter((e) => e.socio_id === socioId && new Date(e.created_at).getTime() < hasta)
      .reduce((s, e) => s + Math.max(Number(e.saldo_pendiente) || 0, 0), 0),
  )
}

/** Primero se descuenta la deuda, hasta lo que queda del sueldo; el resto va en plata. */
export function repartirSueldo(saldoMes: number, deuda: number): { deuda: number; dinero: number } {
  const queda = Math.max(saldoMes, 0)
  const descontada = redondear(Math.min(Math.max(deuda, 0), queda))
  return { deuda: descontada, dinero: redondear(queda - descontada) }
}
