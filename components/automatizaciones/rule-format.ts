// Helpers de presentación puros para las tarjetas y el resumen de reglas de
// automatización — solo dan formato a datos que ya existen en Automatizacion,
// nunca reevalúan condiciones (eso es responsabilidad de lib/automations/engine.ts).
import type { Automatizacion, OperadorComparacion, VariableAmbiental } from "@/lib/types"
import { VARIABLE_CONFIG as variableConfig } from "@/lib/automations/format"

export function resumirCondicion(variable: VariableAmbiental, operador: OperadorComparacion, valor: number, minutos: number) {
  const cfg = variableConfig[variable]
  const sostenido = minutos > 0 ? ` por ${minutos} min` : ""
  return `${cfg.label} ${operador} ${valor}${cfg.unidad}${sostenido}`
}

export function condicionApagadoTexto(r: Automatizacion): string {
  if (r.operador_apagado) {
    return resumirCondicion(
      r.variable,
      r.operador_apagado,
      r.valor_apagado ?? r.valor_objetivo,
      Math.round((r.duracion_apagado_segundos ?? r.duracion_minima_segundos) / 60),
    )
  }
  return "Se apaga apenas deja de cumplirse la condición de encendido (sin histéresis configurada)."
}

export function failSafeLabel(accion: "mantener" | "apagar"): string {
  return accion === "apagar" ? "Apagar automáticamente" : "Mantener el último comando"
}
