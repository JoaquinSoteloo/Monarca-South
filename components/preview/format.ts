/**
 * Formato numérico consistente para la propuesta visual: convención
 * argentina ($47.500,00 — punto de miles, coma decimal) y gramos con
 * separador de miles local y espacio antes de la unidad (3.240 g).
 */
export function formatCurrency(value: number): string {
  const formatted = Math.abs(value).toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return `${value < 0 ? "-" : ""}$${formatted}`
}

export function formatGramos(value: number): string {
  const formatted = value.toLocaleString("es-AR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })
  return `${formatted} g`
}
