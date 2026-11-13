import type { SupabaseClient } from "@supabase/supabase-js"

// Estado real de los Shelly por WiFi (proveedor shelly_local): la notebook de
// la sede (bridge/puente.py) los lee cada minuto por la red local y lo informa
// acá. Queda en dispositivos_controlables.ultimo_estado_confirmado_*, que es lo
// que la app muestra como "Estado real" (con soporta_feedback = true).
// La respuesta le dice al puente qué Shelly tiene que leer la próxima vez.

export interface LecturaShelly {
  dispositivo_id: number
  encendido: boolean
  potencia_w?: number | null
}

export interface ShellyDelPuente {
  id: number
  nombre: string
  device_id: string
  canal: number
}

export async function registrarEstados(
  supabase: SupabaseClient,
  lecturas: LecturaShelly[],
  ahora: Date = new Date(),
): Promise<ShellyDelPuente[]> {
  const { data, error } = await supabase
    .from("dispositivos_controlables")
    .select("id, nombre, proveedor, proveedor_config, activo")
    .eq("proveedor", "shelly_local")
    .eq("activo", true)
  if (error) throw new Error(error.message)

  const shellys: ShellyDelPuente[] = ((data ?? []) as Record<string, any>[]).flatMap((d) => {
    const id = typeof d.proveedor_config?.device_id === "string" ? d.proveedor_config.device_id.trim() : ""
    return id ? [{ id: d.id, nombre: d.nombre, device_id: id, canal: Number(d.proveedor_config?.canal) || 0 }] : []
  })

  for (const l of lecturas) {
    // Solo equipos de este puente: no se puede escribir el estado de cualquier dispositivo.
    if (!shellys.some((s) => s.id === l.dispositivo_id) || typeof l.encendido !== "boolean") continue
    const potencia = typeof l.potencia_w === "number" && Number.isFinite(l.potencia_w) ? Math.round(l.potencia_w * 10) / 10 : null
    await supabase
      .from("dispositivos_controlables")
      .update({
        soporta_feedback: true,
        ultimo_estado_confirmado_payload: l.encendido
          ? { accion: "encender", ...(potencia !== null ? { potencia_w: potencia } : {}) }
          : { accion: "apagar" },
        ultimo_estado_confirmado_en: ahora.toISOString(),
      })
      .eq("id", l.dispositivo_id)
  }
  return shellys
}
