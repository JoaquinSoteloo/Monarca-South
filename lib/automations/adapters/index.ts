import type { ProveedorDispositivo } from "@/lib/types"
import type { AdapterServidorDirecto } from "./types"
import { manualNoopAdapter } from "./manual-noop"

// Solo providers con modo_ejecucion = 'servidor_directo' tienen entrada acá:
// el motor los invoca directo, en el mismo request que encola el comando.
//
// Los providers 'bridge_polling' (ej. broadlink_ir, cuando se implemente) NO
// tienen adapter acá — se resuelven afuera de Vercel, vía un proceso externo
// que hace polling sobre /api/bridge/commands (todavía no implementado).
// Registrar un provider servidor-directo nuevo es agregar una entrada a este
// objeto; el motor de reglas no cambia.
const registry: Partial<Record<ProveedorDispositivo, AdapterServidorDirecto>> = {
  manual_noop: manualNoopAdapter,
}

export function getServerAdapter(proveedor: ProveedorDispositivo): AdapterServidorDirecto | null {
  return registry[proveedor] ?? null
}
