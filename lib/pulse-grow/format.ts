// Utilidades puras de formateo/derivación para lecturas de Pulse Grow.
// Sin secretos ni llamadas de red: se puede importar tanto desde código de
// servidor como desde componentes "use client".
import type { PulseDeviceConnectionStatus } from "./types"

/** La API real entrega airPressure en Pascales; lo mostramos en hPa. */
export function pascalsToHpa(pascals: number): number {
  return Math.round((pascals / 100) * 10) / 10
}

// Umbrales propios (no vienen de Pulse) para derivar el estado del dispositivo
// a partir de la antigüedad de `createdAt`. STALE_AFTER_MINUTES se exporta
// porque lib/automations/engine.ts lo reutiliza como umbral de fail-safe
// ("Pulse dejó de reportar") — un solo lugar define qué es "dato viejo".
export const STALE_AFTER_MINUTES = 15
const DISCONNECTED_AFTER_MINUTES = 60

/**
 * Pulse Grow no incluye sufijo de zona horaria en `createdAt`
 * (ej. "2026-09-09T22:03:17"), pero el valor representa un instante UTC.
 * Si en el futuro Pulse empezara a mandar el sufijo, este parseo sigue
 * funcionando igual.
 */
export function minutesSincePulseTimestamp(createdAtUtc: string): number {
  const isoUtc = createdAtUtc.endsWith("Z") ? createdAtUtc : `${createdAtUtc}Z`
  const createdAtMs = Date.parse(isoUtc)
  if (Number.isNaN(createdAtMs)) return Number.POSITIVE_INFINITY
  return (Date.now() - createdAtMs) / 60000
}

/**
 * Estado derivado por nosotros, NO un campo de la API de Pulse.
 * "conectado": dato reciente. "atencion": dato con cierta antigüedad.
 * "sin_datos": sin timestamp válido o demasiado viejo.
 */
export function getDeviceConnectionStatus(createdAtUtc: string | null): PulseDeviceConnectionStatus {
  if (!createdAtUtc) return "sin_datos"
  const minutesAgo = minutesSincePulseTimestamp(createdAtUtc)
  if (minutesAgo <= STALE_AFTER_MINUTES) return "conectado"
  if (minutesAgo <= DISCONNECTED_AFTER_MINUTES) return "atencion"
  return "sin_datos"
}

export function formatMinutesAgo(createdAtUtc: string | null): string {
  if (!createdAtUtc) return "sin datos"
  const minutes = minutesSincePulseTimestamp(createdAtUtc)
  if (!Number.isFinite(minutes)) return "sin datos"
  if (minutes < 1) return "hace instantes"
  if (minutes < 60) return `hace ${Math.round(minutes)} min`
  const hours = Math.round(minutes / 60)
  return `hace ${hours} h`
}
