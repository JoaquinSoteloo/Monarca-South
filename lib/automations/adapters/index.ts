import type { ProveedorDispositivo } from "@/lib/types"
import type { AdapterServidorDirecto } from "./types"
import { manualNoopAdapter } from "./manual-noop"
import { shellyCloudAdapter } from "./shelly-cloud"

// Solo providers con modo_ejecucion = 'servidor_directo' tienen entrada acá:
// el motor los invoca directo, en el mismo request que encola el comando.
//
// Los providers 'bridge_polling' (ej. broadlink_ir) NO tienen adapter acá —
// se resuelven afuera de Vercel: la notebook de la sede (bridge/puente.py)
// hace polling sobre /api/bridge/commands.
// Registrar un provider servidor-directo nuevo es agregar una entrada a este
// objeto; el motor de reglas no cambia.
const registry: Partial<Record<ProveedorDispositivo, AdapterServidorDirecto>> = {
  manual_noop: manualNoopAdapter,
  shelly_cloud: shellyCloudAdapter,
}

export function getServerAdapter(proveedor: ProveedorDispositivo): AdapterServidorDirecto | null {
  return registry[proveedor] ?? null
}
