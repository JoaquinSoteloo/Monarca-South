// Cliente server-only de la API de Pulse Grow.
//
// REGLA DURA: este archivo lee PULSE_GROW_API_KEY y NUNCA debe importarse
// desde un componente "use client" ni desde código que pueda terminar en el
// bundle del navegador. Solo se debe usar desde route handlers bajo
// app/api/pulse/**.
//
// Base URL, header de auth (x-api-key) y los campos de PulseDeviceDetails /
// PulseRecentDataPoint fueron validados el 2026-09-09 contra la cuenta real
// del club. No se agregan endpoints ni campos no confirmados.

import { PulseApiError } from "./errors"
import type { PulseDeviceDetails, PulseRecentDataPoint } from "./types"

const PULSE_API_BASE_URL = "https://api.pulsegrow.com"
const REQUEST_TIMEOUT_MS = 8000

function getApiKey(): string {
  const apiKey = process.env.PULSE_GROW_API_KEY
  if (!apiKey) {
    throw new PulseApiError("unauthorized", "PULSE_GROW_API_KEY no está configurada en el servidor")
  }
  return apiKey
}

async function pulseFetch<T>(path: string): Promise<T> {
  const apiKey = getApiKey()
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  let response: Response
  try {
    response = await fetch(`${PULSE_API_BASE_URL}${path}`, {
      headers: { "x-api-key": apiKey },
      signal: controller.signal,
      cache: "no-store",
    })
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new PulseApiError("timeout", `Timeout llamando a Pulse Grow (${path})`)
    }
    throw new PulseApiError("unavailable", `No se pudo conectar con Pulse Grow (${path}): ${String(error)}`)
  } finally {
    clearTimeout(timeoutId)
  }

  if (response.status === 401) {
    throw new PulseApiError("unauthorized", "API key de Pulse Grow inválida, vencida o sin permisos", 401)
  }
  if (response.status === 429) {
    throw new PulseApiError("rate_limited", "Se alcanzó el límite diario de consultas a Pulse Grow", 429)
  }
  if (response.status === 404) {
    throw new PulseApiError("not_found", `Recurso no encontrado en Pulse Grow (${path})`, 404)
  }
  if (!response.ok) {
    throw new PulseApiError(
      "unavailable",
      `Pulse Grow respondió con error ${response.status} (${path})`,
      response.status,
    )
  }

  try {
    return (await response.json()) as T
  } catch (error) {
    throw new PulseApiError("unexpected_response", `Respuesta no-JSON de Pulse Grow (${path}): ${String(error)}`)
  }
}

/** GET /devices/ids */
export async function listDeviceIds(): Promise<number[]> {
  const data = await pulseFetch<unknown>("/devices/ids")
  if (!Array.isArray(data)) {
    throw new PulseApiError("unexpected_response", "Se esperaba un array de IDs en /devices/ids")
  }
  return data.filter((id): id is number => typeof id === "number")
}

/** GET /devices/details — solo se mapean los campos que usamos. */
export async function getDeviceDetails(): Promise<PulseDeviceDetails[]> {
  const data = await pulseFetch<unknown>("/devices/details")
  if (!Array.isArray(data)) {
    throw new PulseApiError("unexpected_response", "Se esperaba un array en /devices/details")
  }

  return data.map((raw): PulseDeviceDetails => {
    const d = raw as Record<string, unknown>
    if (typeof d.id !== "number") {
      throw new PulseApiError("unexpected_response", "Dispositivo sin id válido en /devices/details")
    }
    return {
      id: d.id,
      name: typeof d.name === "string" && d.name.trim().length > 0 ? d.name.trim() : `Dispositivo ${d.id}`,
      deviceType: typeof d.deviceType === "number" ? d.deviceType : null,
      macAddress: typeof d.macAddress === "string" ? d.macAddress : null,
    }
  })
}

/** GET /devices/{deviceId}/recent-data */
export async function getDeviceRecentData(deviceId: number): Promise<PulseRecentDataPoint> {
  const data = await pulseFetch<unknown>(`/devices/${deviceId}/recent-data`)
  const d = data as Record<string, unknown>

  const requiredNumberFields = [
    "temperatureF",
    "temperatureC",
    "humidityRh",
    "vpd",
    "lightLux",
    "airPressure",
    "dpF",
    "dpC",
  ] as const

  if (!data || typeof data !== "object" || typeof d.createdAt !== "string") {
    throw new PulseApiError("unexpected_response", `recent-data sin createdAt válido para el dispositivo ${deviceId}`)
  }
  for (const field of requiredNumberFields) {
    if (typeof d[field] !== "number") {
      throw new PulseApiError(
        "unexpected_response",
        `recent-data con campo "${field}" ausente o con tipo inesperado (dispositivo ${deviceId})`,
      )
    }
  }

  return {
    deviceId,
    deviceType: typeof d.deviceType === "number" ? d.deviceType : null,
    createdAt: d.createdAt as string,
    temperatureF: d.temperatureF as number,
    temperatureC: d.temperatureC as number,
    humidityRh: d.humidityRh as number,
    vpd: d.vpd as number,
    lightLux: d.lightLux as number,
    airPressure: d.airPressure as number,
    dpF: d.dpF as number,
    dpC: d.dpC as number,
    pluggedIn: Boolean(d.pluggedIn),
    // Pulse a veces omite este campo; lo dejamos en null en vez de asumir 0V,
    // que sería un valor de batería real y engañoso.
    batteryV: typeof d.batteryV === "number" ? d.batteryV : null,
    signalStrength: typeof d.signalStrength === "number" ? d.signalStrength : 0,
  }
}
