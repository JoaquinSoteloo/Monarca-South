// Utilidades puras para presentar el payload de un comando de dispositivo
// controlable de forma amigable en la UI. Solo interpretan el payload para
// mostrarlo: no cambian ni el payload almacenado ni la lógica del motor.
import type { TipoDispositivoControlable, VariableAmbiental } from "@/lib/types"

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
