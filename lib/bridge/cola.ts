import type { SupabaseClient } from "@supabase/supabase-js"

// Cola del puente local (bridge_polling): la notebook de la sede le pide al
// sistema los comandos pendientes de sus BroadLink, los manda por infrarrojo
// y devuelve el resultado. Ver bridge/LEEME.md.
//
// Reglas:
// - Un comando que no se tomó (o no se resolvió) en VENCE_MS queda en
//   "timeout": no tiene sentido prender el aire 10 minutos tarde, y el motor
//   lo trata como falla.
// - Si hay varios pendientes para el mismo equipo, solo vale el último; los
//   anteriores quedan "cancelado".

export const VENCE_MS = 2 * 60 * 1000

export interface ComandoParaPuente {
  id: number
  payload: Record<string, unknown>
  dispositivo: { id: number; nombre: string; tipo: string; proveedor: string; proveedor_config: Record<string, unknown> }
}

type Fila = Record<string, any>

async function marcarDispositivo(supabase: SupabaseClient, dispositivoId: number, estado: string) {
  await supabase
    .from("dispositivos_controlables")
    .update({ ultimo_comando_estado: estado, updated_at: new Date().toISOString() })
    .eq("id", dispositivoId)
}

export function autorizado(request: Request): boolean {
  const token = process.env.BRIDGE_TOKEN
  if (!token || token.length < 16) return false
  return request.headers.get("authorization") === `Bearer ${token}`
}

export async function tomarComandos(supabase: SupabaseClient, bridgeId: string, ahora = new Date()): Promise<ComandoParaPuente[]> {
  const { data: dispositivos, error: errD } = await supabase
    .from("dispositivos_controlables")
    .select("id, nombre, tipo, proveedor, proveedor_config, activo, modo_ejecucion")
    .eq("modo_ejecucion", "bridge_polling")
  if (errD) throw new Error(errD.message)
  const porId = new Map<number, Fila>((dispositivos ?? []).filter((d: Fila) => d.activo !== false).map((d: Fila) => [d.id, d]))
  if (porId.size === 0) return []

  const { data: abiertos, error: errC } = await supabase
    .from("comandos_dispositivo")
    .select("*")
    .in("dispositivo_id", [...porId.keys()])
    .in("estado", ["pendiente", "en_proceso"])
    .order("creado_en", { ascending: true })
  if (errC) throw new Error(errC.message)

  const limite = ahora.getTime() - VENCE_MS
  const vigentes: Fila[] = []
  for (const c of abiertos ?? []) {
    const desde = new Date(c.estado === "en_proceso" ? c.enviado_en ?? c.creado_en : c.creado_en).getTime()
    if (desde < limite) {
      await supabase
        .from("comandos_dispositivo")
        .update({ estado: "timeout", resuelto_en: ahora.toISOString(), error: "El puente de la sede no lo resolvió a tiempo" })
        .eq("id", c.id)
        .eq("estado", c.estado)
      await marcarDispositivo(supabase, c.dispositivo_id, "timeout")
    } else if (c.estado === "pendiente") {
      vigentes.push(c)
    }
  }

  // Solo el último pendiente de cada equipo.
  const ultimo = new Map<number, Fila>()
  for (const c of vigentes) ultimo.set(c.dispositivo_id, c)
  for (const c of vigentes) {
    if (ultimo.get(c.dispositivo_id) !== c) {
      await supabase
        .from("comandos_dispositivo")
        .update({ estado: "cancelado", resuelto_en: ahora.toISOString(), error: "Reemplazado por un comando más nuevo" })
        .eq("id", c.id)
        .eq("estado", "pendiente")
    }
  }

  const tomados: ComandoParaPuente[] = []
  for (const c of ultimo.values()) {
    const { data: actualizado } = await supabase
      .from("comandos_dispositivo")
      .update({ estado: "en_proceso", enviado_en: ahora.toISOString(), bridge_id: bridgeId, intentos: (c.intentos ?? 0) + 1 })
      .eq("id", c.id)
      .eq("estado", "pendiente")
      .select()
    if (!actualizado || (Array.isArray(actualizado) && actualizado.length === 0)) continue
    const d = porId.get(c.dispositivo_id)!
    await marcarDispositivo(supabase, d.id, "en_proceso")
    tomados.push({
      id: c.id,
      payload: c.payload ?? {},
      dispositivo: { id: d.id, nombre: d.nombre, tipo: d.tipo, proveedor: d.proveedor, proveedor_config: d.proveedor_config ?? {} },
    })
  }
  return tomados
}

export async function resolverComando(
  supabase: SupabaseClient,
  id: number,
  resultado: { estado: "ejecutado" | "fallido"; error?: string | null },
  ahora = new Date(),
): Promise<boolean> {
  const { data: comando } = await supabase.from("comandos_dispositivo").select("*").eq("id", id).maybeSingle()
  if (!comando || comando.estado !== "en_proceso") return false
  await supabase
    .from("comandos_dispositivo")
    .update({
      estado: resultado.estado,
      ejecutado_por: "bridge",
      resuelto_en: ahora.toISOString(),
      error: resultado.estado === "fallido" ? String(resultado.error || "Falló en el puente").slice(0, 300) : null,
    })
    .eq("id", id)
    .eq("estado", "en_proceso")
  await marcarDispositivo(supabase, comando.dispositivo_id, resultado.estado)
  return true
}
