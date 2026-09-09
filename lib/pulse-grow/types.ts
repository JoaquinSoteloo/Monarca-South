// Tipos de la integración con Pulse Grow.
// Los nombres de campo de PulseDeviceDetails y PulseRecentDataPoint fueron
// validados el 2026-09-09 contra respuestas reales de la cuenta del club
// (https://api.pulsegrow.com/devices/details y /devices/{id}/recent-data).
// No agregar campos que no hayan sido confirmados contra la API real.

export interface PulseDeviceDetails {
  id: number
  name: string
  deviceType: number | null
  macAddress: string | null
}

export interface PulseRecentDataPoint {
  deviceId: number
  deviceType: number | null
  /**
   * Timestamp tal cual lo entrega Pulse, ej. "2026-09-09T22:03:17".
   * IMPORTANTE: no trae sufijo de zona horaria pero representa un instante
   * UTC — ver lib/pulse-grow/format.ts para el parseo correcto.
   */
  createdAt: string
  temperatureF: number
  temperatureC: number
  humidityRh: number
  vpd: number
  lightLux: number
  /** Presión atmosférica en Pascales (confirmado contra la API real, no hPa). */
  airPressure: number
  dpF: number
  dpC: number
  pluggedIn: boolean
  batteryV: number
  signalStrength: number
}

/** Lectura ya formateada para consumo del frontend (unidades listas para mostrar). */
export interface PulseDeviceReading {
  temperatureC: number
  temperatureF: number
  humidityRh: number
  vpd: number
  lightLux: number
  airPressureHpa: number
  dewPointC: number
  dewPointF: number
  batteryV: number
  signalStrength: number
  pluggedIn: boolean
  createdAt: string
}

/**
 * Estado de conectividad calculado por nosotros a partir de la antigüedad de
 * `createdAt`. Pulse Grow no expone un campo de conectividad en /recent-data.
 */
export type PulseDeviceConnectionStatus = "conectado" | "atencion" | "sin_datos"

export interface PulseDeviceSala {
  id: number
  nombre: string
}

/** Forma que devuelve GET /api/pulse/devices — lo único que ve el frontend. */
export interface PulseDeviceSnapshot {
  id: number
  name: string
  sala: PulseDeviceSala | null
  reading: PulseDeviceReading | null
  status: PulseDeviceConnectionStatus
  error: { code: string } | null
}
