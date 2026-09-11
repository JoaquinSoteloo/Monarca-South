// Utilidades puras para presentar el payload de un comando de dispositivo
// controlable de forma amigable en la UI. Solo interpretan el payload para
// mostrarlo: no cambian ni el payload almacenado ni la lógica del motor.
import type { OperadorComparacion, TipoDispositivoControlable, VariableAmbiental } from "@/lib/types"

// Fuente única de etiqueta/unidad por variable ambiental — la usan tanto la
// UI de reglas (automatizaciones-manager) como lib/automations/alerts.ts y
// lib/automations/history-format.ts, para no repetir el mapeo en cada lugar.
export const VARIABLE_CONFIG: Record<VariableAmbiental, { label: string; unidad: string }> = {
  temperatura_c: { label: "Temperatura", unidad: "°C" },
  humedad_rh: { label: "Humedad", unidad: "%" },
  vpd: { label: "VPD", unidad: "kPa" },
  luz_lux: { label: "Luz", unidad: "lux" },
  dew_point_c: { label: "Dew Point", unidad: "°C" },
  presion_hpa: { label: "Presión", unidad: "hPa" },
}

// Forma articulada del label de arriba, para insertar en una oración
// ("la temperatura es...", "el VPD subió a..." ) — solo la usa
// formatMensajeAccionAutomatizacion, de acá abajo.
const VARIABLE_LABEL_ARTICULADO: Record<VariableAmbiental, string> = {
  temperatura_c: "la temperatura",
  humedad_rh: "la humedad",
  vpd: "el VPD",
  luz_lux: "la luz",
  dew_point_c: "el dew point",
  presion_hpa: "la presión",
}

const MODO_AC_LABELS: Record<string, string> = {
  frio: "Frío",
  calor: "Calor",
  ventilador: "Ventilador",
}

const MODO_AC_ICONS: Record<string, string> = {
  frio: "❄️",
  calor: "🔥",
  ventilador: "🌀",
}

const FAN_LABELS: Record<string, string> = {
  auto: "Auto",
  baja: "Baja",
  media: "Media",
  alta: "Alta",
}

// Mismas opciones que arriba, en forma de lista — para poblar selects (regla
// de automatización y control manual) sin repetir los value/label a mano en
// cada lugar que necesite un <Select> de modo/fan de aire acondicionado.
export const AC_MODO_OPTIONS: { value: string; label: string }[] = Object.entries(MODO_AC_LABELS).map(([value, label]) => ({
  value,
  label,
}))
export const AC_FAN_OPTIONS: { value: string; label: string }[] = Object.entries(FAN_LABELS).map(([value, label]) => ({
  value,
  label,
}))

// Ícono por defecto al encender, cuando el tipo de dispositivo no tiene un
// formateador más detallado (ver caso "aire_acondicionado" abajo).
const ICONO_ENCENDIDO_POR_TIPO: Record<TipoDispositivoControlable, string> = {
  aire_acondicionado: "❄️",
  extractor: "🌀",
  humidificador: "💧",
  deshumidificador: "💧",
  otro: "⚡",
}

const ICONO_APAGADO = "⏻"

/**
 * Traduce el payload crudo de un comando (el mismo que persistimos y le
 * pasamos tal cual a los adapters) a un texto amigable para mostrar en la
 * UI. Pensada para extenderse: hoy solo "aire_acondicionado" tiene detalle
 * (modo/setpoint/fan); a futuro extractores/humidificadores con payload
 * propio (velocidad, % humedad objetivo, etc.) pueden sumar su propio caso.
 * Nunca lanza: ante un payload con forma inesperada cae a un resumen genérico.
 */
export function formatComandoDispositivo(tipo: TipoDispositivoControlable, payload: Record<string, unknown> | null): string {
  if (!payload) return "Sin comandos todavía"

  const accion = typeof payload.accion === "string" ? payload.accion : null

  if (accion === "apagar") {
    return `${ICONO_APAGADO} Apagado`
  }

  if (accion === "encender") {
    const iconoPorDefecto = ICONO_ENCENDIDO_POR_TIPO[tipo] ?? "⚡"

    if (tipo === "aire_acondicionado") {
      const modo = typeof payload.modo === "string" ? payload.modo : null
      const setpoint = typeof payload.setpoint === "number" ? payload.setpoint : null
      const fan = typeof payload.fan === "string" ? payload.fan : null

      const icono = (modo && MODO_AC_ICONS[modo]) ?? iconoPorDefecto
      const partes = ["Encendido"]
      if (modo) partes.push(MODO_AC_LABELS[modo] ?? modo)
      if (setpoint !== null) partes.push(`${setpoint} °C`)
      if (fan) partes.push(`Fan ${FAN_LABELS[fan] ?? fan}`)

      return `${icono} ${partes.join(" · ")}`
    }

    return `${iconoPorDefecto} Encendido`
  }

  // Acción desconocida (proveedor futuro con payload propio): mostramos algo
  // legible en vez del JSON crudo.
  if (accion) {
    return `⚡ ${accion.charAt(0).toUpperCase() + accion.slice(1)}`
  }

  return JSON.stringify(payload)
}

/**
 * Igual que formatComandoDispositivo pero sin el ícono ni la palabra
 * "Encendido"/"Apagado" — pensado para insertarse dentro de una oración
 * (ver lib/automations/history-format.ts), no como texto autónomo.
 * Devuelve "" cuando no hay detalle adicional que agregar (ej. apagar, o un
 * tipo de dispositivo sin parámetros propios).
 */
export function formatDetalleAccion(tipo: TipoDispositivoControlable, payload: Record<string, unknown> | null): string {
  if (!payload) return ""
  const accion = typeof payload.accion === "string" ? payload.accion : null
  if (accion !== "encender" || tipo !== "aire_acondicionado") return ""

  const modo = typeof payload.modo === "string" ? payload.modo : null
  const setpoint = typeof payload.setpoint === "number" ? payload.setpoint : null
  const fan = typeof payload.fan === "string" ? payload.fan : null

  const partes: string[] = []
  if (modo) partes.push(MODO_AC_LABELS[modo] ?? modo)
  if (setpoint !== null) partes.push(`${setpoint} °C`)
  if (fan) partes.push(`Fan ${FAN_LABELS[fan] ?? fan}`)
  return partes.join(" · ")
}

const COMPARADOR_ENCENDIDO: Record<OperadorComparacion, string> = {
  ">": "mayor",
  ">=": "mayor o igual",
  "<": "menor",
  "<=": "menor o igual",
}

const APAGADO_VERBO: Record<OperadorComparacion, string> = {
  ">": "subió a",
  ">=": "subió a",
  "<": "bajó a",
  "<=": "bajó a",
}

const APAGADO_PREPOSICION: Record<OperadorComparacion, string> = {
  ">": "por encima del umbral de",
  ">=": "por encima o igual al umbral de",
  "<": "por debajo del umbral de",
  "<=": "por debajo o igual al umbral de",
}

function formatNumeroEs(valor: number): string {
  return valor.toLocaleString("es-AR", { maximumFractionDigits: 1 })
}

/**
 * Mensaje orientado a la acción para el panel "Estado operativo": en vez de
 * describir la lectura como "fuera de rango", explica qué hizo (o debería
 * estar haciendo) el dispositivo y por qué, con el nombre real del
 * dispositivo, la variable, el valor actual y el umbral configurado en la
 * regla. Puramente de presentación — no evalúa ni decide nada, solo formatea
 * un resultado que ya calculó lib/automations/alerts.ts.
 */
export function formatMensajeAccionAutomatizacion(
  nombreDispositivo: string,
  tipo: "encendido" | "apagado",
  variable: VariableAmbiental,
  valorActual: number,
  operador: OperadorComparacion,
  umbral: number,
): string {
  const cfg = VARIABLE_CONFIG[variable]
  const variableArticulada = VARIABLE_LABEL_ARTICULADO[variable]
  const valorFmt = `${formatNumeroEs(valorActual)} ${cfg.unidad}`
  const umbralFmt = `${formatNumeroEs(umbral)} ${cfg.unidad}`

  if (tipo === "encendido") {
    return `${nombreDispositivo} encendido porque ${variableArticulada} es ${valorFmt}, ${COMPARADOR_ENCENDIDO[operador]} al umbral de ${umbralFmt}.`
  }

  return `${nombreDispositivo} apagado porque ${variableArticulada} ${APAGADO_VERBO[operador]} ${valorFmt}, ${APAGADO_PREPOSICION[operador]} ${umbralFmt}.`
}
