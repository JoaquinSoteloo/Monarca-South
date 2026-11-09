// Push al celular cuando un equipo no pudo cumplir una orden: el mismo caso
// que la alerta roja de Automatizaciones (lib/automations/alerts.ts).
//
// Un solo aviso por falla: con la notebook apagada la regla reintenta y cada
// intento vence de nuevo. dispositivos_controlables.falla_notificada_en
// (script 092) guarda que ya se avisó, y vuelve a NULL cuando el equipo cumple
// una orden. Mismo criterio que Modo Ausente: push solo en la transición.
//
// Corre dentro del lock del motor (lib/automations/lock.ts), así que las
// corridas no se pisan. No importar desde engine.ts: ese archivo también llega
// al navegador (vía alerts.ts) y web-push no se puede empaquetar para él.
import type { SupabaseClient } from "@supabase/supabase-js"
import { sendPushNotification, type PushPayload } from "@/lib/push/send"
import { recortar } from "@/lib/chat-push"

interface EquipoConOrden {
  id: number
  nombre: string
  activo: boolean | null
  ultimo_comando_estado: string | null
  ultimo_comando_payload: Record<string, unknown> | null
  falla_notificada_en: string | null
}

/** Lo que dice la notificación. `motivo` es el error del comando, si lo hay. */
export function avisoDeOrdenSinCumplir(
  equipo: Pick<EquipoConOrden, "id" | "nombre" | "ultimo_comando_estado" | "ultimo_comando_payload">,
  motivo: string | null,
): PushPayload {
  const accion = equipo.ultimo_comando_payload?.accion
  const verbo = accion === "encender" || accion === "apagar" ? accion : "controlar"
  // Solo el puente de la sede deja comandos en timeout (lib/bridge/cola.ts).
  const body =
    equipo.ultimo_comando_estado === "timeout"
      ? "La orden no llegó a tiempo. Fijate si la notebook de la sede está prendida y con internet."
      : recortar(motivo || "El equipo no pudo cumplir la orden.")
  return { title: `No se pudo ${verbo} ${equipo.nombre}`, body, url: "/automatizaciones", tag: `orden-sin-cumplir-${equipo.id}` }
}

async function motivoDelUltimoComando(supabase: SupabaseClient, dispositivoId: number): Promise<string | null> {
  const { data } = await supabase
    .from("comandos_dispositivo")
    .select("error")
    .eq("dispositivo_id", dispositivoId)
    .order("creado_en", { ascending: false })
    .limit(1)
    .maybeSingle()
  return data?.error ?? null
}

/** Avisa de las fallas nuevas y olvida las resueltas. Devuelve cuántos avisos salieron. */
export async function avisarOrdenesSinCumplir(supabase: SupabaseClient, ahora: Date = new Date()): Promise<number> {
  const { data, error } = await supabase
    .from("dispositivos_controlables")
    .select("id, nombre, activo, ultimo_comando_estado, ultimo_comando_payload, falla_notificada_en")
  if (error) throw new Error(error.message)

  let avisos = 0
  for (const equipo of (data ?? []) as EquipoConOrden[]) {
    if (equipo.ultimo_comando_estado === "ejecutado" && equipo.falla_notificada_en) {
      await supabase.from("dispositivos_controlables").update({ falla_notificada_en: null }).eq("id", equipo.id)
      continue
    }

    const fallo = equipo.ultimo_comando_estado === "fallido" || equipo.ultimo_comando_estado === "timeout"
    if (!fallo || equipo.falla_notificada_en || equipo.activo === false) continue

    try {
      const motivo = equipo.ultimo_comando_estado === "fallido" ? await motivoDelUltimoComando(supabase, equipo.id) : null
      const resultado = await sendPushNotification(avisoDeOrdenSinCumplir(equipo, motivo))
      // Sin marcar: la próxima corrida lo vuelve a intentar.
      if (resultado.sent === 0 && resultado.failed > 0) continue
    } catch (err) {
      console.error(`[automations/aviso-fallas] No se pudo avisar (equipo ${equipo.id}):`, err)
      continue
    }

    await supabase.from("dispositivos_controlables").update({ falla_notificada_en: ahora.toISOString() }).eq("id", equipo.id)
    avisos += 1
  }
  return avisos
}
