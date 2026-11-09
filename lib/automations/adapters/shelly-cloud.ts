import type { AdapterServidorDirecto, ResultadoAdapter } from "./types"

// Relés y enchufes Shelly por la nube de Shelly (Cloud Control API v2).
// No necesita ningún equipo en la sede: el servidor de Monarca le pide a la
// nube de Shelly que prenda o apague la salida del relé.
//
// Credenciales (variables de entorno en Vercel, nunca en la base ni en el
// chat): las da la app Shelly Smart Control en Configuración → Configuración
// de usuario → Clave de autorización en la nube ("Authorization cloud key").
//   SHELLY_CLOUD_SERVER    ej. https://shelly-123-eu.shelly.cloud
//   SHELLY_CLOUD_AUTH_KEY  la clave
//
// dispositivos_controlables.proveedor_config:
//   { device_id: string, canal?: number }   // device_id: app → dispositivo → Información del dispositivo
//
// Payload abstracto: { accion: "encender" | "apagar" }.

const TIMEOUT_MS = 8000

export function urlSetSwitch(server: string): string {
  const base = server.trim().replace(/\/+$/, "")
  return `${base.startsWith("http") ? base : `https://${base}`}/v2/devices/api/set/switch`
}

export const shellyCloudAdapter: AdapterServidorDirecto = {
  async ejecutarComando(payload, proveedorConfig): Promise<ResultadoAdapter> {
    const server = process.env.SHELLY_CLOUD_SERVER
    const authKey = process.env.SHELLY_CLOUD_AUTH_KEY
    if (!server || !authKey) {
      return { estado: "fallido", error: "Faltan SHELLY_CLOUD_SERVER o SHELLY_CLOUD_AUTH_KEY en el servidor" }
    }

    const deviceId = typeof proveedorConfig.device_id === "string" ? proveedorConfig.device_id.trim() : ""
    if (!deviceId) {
      return { estado: "fallido", error: "El dispositivo no tiene cargado el ID de Shelly" }
    }
    const canal = typeof proveedorConfig.canal === "number" ? proveedorConfig.canal : 0

    const accion = payload.accion
    if (accion !== "encender" && accion !== "apagar") {
      return { estado: "fallido", error: `Acción no soportada por Shelly: ${String(accion)}` }
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
    try {
      const res = await fetch(`${urlSetSwitch(server)}?auth_key=${encodeURIComponent(authKey)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: deviceId, channel: canal, on: accion === "encender" }),
        signal: controller.signal,
        cache: "no-store",
      })
      if (!res.ok) {
        // El cuerpo de error de Shelly no incluye la clave; igual se recorta.
        const texto = (await res.text().catch(() => "")).slice(0, 200)
        return { estado: "fallido", error: `Shelly respondió ${res.status}${texto ? `: ${texto}` : ""}` }
      }
      return { estado: "ejecutado" }
    } catch (err) {
      const abortado = err instanceof Error && err.name === "AbortError"
      return { estado: "fallido", error: abortado ? "Shelly no respondió a tiempo" : "No se pudo conectar con Shelly Cloud" }
    } finally {
      clearTimeout(timer)
    }
  },
}
