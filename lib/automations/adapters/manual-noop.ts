import type { AdapterServidorDirecto, ResultadoAdapter } from "./types"

// Provider de simulación. No toca ningún hardware: existe para poder probar
// toda la plataforma de punta a punta (Pulse real -> motor -> regla ->
// comando -> ejecución -> historial) sin haber comprado nada todavía.
//
// dispositivos_controlables.proveedor_config admite, opcionalmente:
//   { fallarSiempre?: boolean, latenciaMs?: number }
// para poder ejercitar también el camino de comandos "fallido" desde la UI,
// sin tener que esperar a un provider real para probar ese caso.
export const manualNoopAdapter: AdapterServidorDirecto = {
  async ejecutarComando(_payload, proveedorConfig): Promise<ResultadoAdapter> {
    const latenciaMs = typeof proveedorConfig.latenciaMs === "number" ? proveedorConfig.latenciaMs : 0
    if (latenciaMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, latenciaMs))
    }
    if (proveedorConfig.fallarSiempre === true) {
      return { estado: "fallido", error: "Fallo simulado (manual_noop.proveedor_config.fallarSiempre = true)" }
    }
    return { estado: "ejecutado" }
  },
}
