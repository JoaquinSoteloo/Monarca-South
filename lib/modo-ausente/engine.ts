// Capa con acceso a datos de Modo Ausente. checklist.ts hace el cálculo puro;
// acá vive todo lo que toca Supabase: cargar dispositivos críticos, resolver
// si su sensor asociado está stale, activar/desactivar, y el chequeo
// periódico que corre el evaluador de automatizaciones (lib/automations/engine.ts)
// en cada tick mientras Modo Ausente está activo.
import type { SupabaseClient } from "@supabase/supabase-js"
import { STALE_AFTER_MINUTES } from "@/lib/pulse-grow/format"
import { sendPushNotification } from "@/lib/push/send"
import { computeChecklist, type ChecklistAusente } from "./checklist"
import type { DispositivoControlable, ModoAusenteEstado } from "@/lib/types"

const ESTADO_DEFAULT: ModoAusenteEstado = {
  activo: false,
  activado_en: null,
  activado_por: null,
  activado_desde: null,
  desactivado_en: null,
  desactivado_por: null,
}

export async function getModoAusenteEstado(supabase: SupabaseClient): Promise<ModoAusenteEstado> {
  const { data } = await supabase.from("modo_ausente_estado").select("*").eq("id", 1).maybeSingle()
  return data ? (data as ModoAusenteEstado) : ESTADO_DEFAULT
}

/**
 * Para cada dispositivo crítico, ¿el sensor Pulse de alguna automatización
 * activa que lo controla dejó de reportar datos frescos? Reutiliza el mismo
 * umbral (STALE_AFTER_MINUTES) que ya usa el motor de automatizaciones para
 * fail-safe — "dato viejo" se define en un solo lugar en todo el proyecto.
 * Un dispositivo sin automatización asociada nunca se marca stale por esto
 * (no hay sensor del que depender).
 */
async function getSensorStaleFlags(supabase: SupabaseClient, dispositivoIds: number[]): Promise<Record<number, boolean>> {
  if (dispositivoIds.length === 0) return {}

  const { data: automatizaciones } = await supabase
    .from("automatizaciones")
    .select("dispositivo_id, pulse_device_id")
    .eq("activa", true)
    .in("dispositivo_id", dispositivoIds)

  const relevantes = automatizaciones ?? []
  const pulseIds = [...new Set(relevantes.map((a) => a.pulse_device_id as number))]
  if (pulseIds.length === 0) return {}

  const staleAfterMs = STALE_AFTER_MINUTES * 60 * 1000
  const ahora = Date.now()
  const staleByPulseId: Record<number, boolean> = {}

  await Promise.all(
    pulseIds.map(async (id) => {
      const { data } = await supabase
        .from("lecturas_ambientales")
        .select("leido_en")
        .eq("pulse_device_id", id)
        .order("leido_en", { ascending: false })
        .limit(1)
        .maybeSingle()
      staleByPulseId[id] = !data || ahora - new Date(data.leido_en).getTime() > staleAfterMs
    }),
  )

  const staleByDispositivo: Record<number, boolean> = {}
  for (const a of relevantes) {
    if (staleByPulseId[a.pulse_device_id as number]) {
      staleByDispositivo[a.dispositivo_id as number] = true
    }
  }
  return staleByDispositivo
}

/** Recalcula el checklist EN VIVO — nunca cachea, siempre lee el estado actual. */
export async function loadChecklist(supabase: SupabaseClient): Promise<ChecklistAusente> {
  const { data, error } = await supabase
    .from("dispositivos_controlables")
    .select("*")
    .not("requisito_ausente", "is", null)
    .order("nombre")

  if (error) {
    console.error("[modo-ausente] Error leyendo dispositivos críticos:", error)
    return { items: [], todoOk: true, sinConfirmacionFisica: 0, resumen: "Todo OK para retirarse." }
  }

  const criticos = (data ?? []) as DispositivoControlable[]
  const staleFlags = await getSensorStaleFlags(
    supabase,
    criticos.map((d) => d.id),
  )
  return computeChecklist(criticos, staleFlags)
}

/**
 * Revalida todo server-side (nunca confía en lo que ya vio el cliente) y,
 * si el checklist da OK, activa Modo Ausente y resetea el tracking de
 * violaciones de todos los dispositivos críticos a 'ok' — así la próxima
 * corrida del evaluador arranca limpia, sin arrastrar una violación vieja
 * de antes de activar.
 */
export async function activarModoAusente(
  supabase: SupabaseClient,
  usuario: string,
  desde: string | null,
): Promise<{ activado: boolean; checklist: ChecklistAusente }> {
  const checklist = await loadChecklist(supabase)
  if (!checklist.todoOk) {
    return { activado: false, checklist }
  }

  const ahoraIso = new Date().toISOString()
  await supabase.from("modo_ausente_estado").upsert({
    id: 1,
    activo: true,
    activado_en: ahoraIso,
    activado_por: usuario,
    activado_desde: desde,
    desactivado_en: null,
    desactivado_por: null,
  })

  if (checklist.items.length > 0) {
    await supabase.from("modo_ausente_violaciones").upsert(
      checklist.items.map((item) => ({
        dispositivo_id: item.dispositivoId,
        estado: "ok",
        motivo: null,
        detectado_en: null,
        notificado_en: null,
        resuelto_notificado_en: null,
        updated_at: ahoraIso,
      })),
    )
  }

  return { activado: true, checklist }
}

export async function desactivarModoAusente(supabase: SupabaseClient, usuario: string): Promise<void> {
  await supabase
    .from("modo_ausente_estado")
    .update({ activo: false, desactivado_en: new Date().toISOString(), desactivado_por: usuario })
    .eq("id", 1)
}

export interface ResultadoCheckModoAusente {
  evaluado: boolean
  violacionesNuevas: number
  resueltas: number
}

/**
 * Chequeo periódico invocado por el evaluador de automatizaciones (mismo
 * lock — withEngineLock —, misma cadencia de ~1 min). No hace nada si Modo
 * Ausente está inactivo (costo cero). Solo manda push en la TRANSICIÓN
 * ok<->violación de cada dispositivo crítico, nunca en cada corrida: el
 * estado persistido en modo_ausente_violaciones es la fuente de verdad, el
 * mismo principio que ya usa el motor para no re-loguear fail-safe en cada
 * tick (ver ultimoLogEsTipo en lib/automations/engine.ts). Al estar dentro
 * del mismo withEngineLock que evaluateAutomations, las corridas ya están
 * serializadas — no hace falta un update atómico condicional adicional
 * como el que usa el cooldown de automatizaciones.
 */
export async function checkModoAusente(supabase: SupabaseClient): Promise<ResultadoCheckModoAusente> {
  const estado = await getModoAusenteEstado(supabase)
  if (!estado.activo) {
    return { evaluado: false, violacionesNuevas: 0, resueltas: 0 }
  }

  const checklist = await loadChecklist(supabase)
  let violacionesNuevas = 0
  let resueltas = 0

  const { data: filasPrevias } = await supabase
    .from("modo_ausente_violaciones")
    .select("dispositivo_id, estado")
    .in(
      "dispositivo_id",
      checklist.items.map((i) => i.dispositivoId),
    )
  const estadoPrevioPorDispositivo: Record<number, "ok" | "violacion"> = Object.fromEntries(
    (filasPrevias ?? []).map((f) => [f.dispositivo_id, f.estado]),
  )

  for (const item of checklist.items) {
    const nuevoEstado: "ok" | "violacion" = item.nivel === "incumplimiento" ? "violacion" : "ok"
    const estadoPrevio = estadoPrevioPorDispositivo[item.dispositivoId] ?? "ok"
    const ahoraIso = new Date().toISOString()

    if (estadoPrevio === nuevoEstado) {
      // Sin transición: se refresca igual el motivo/timestamp para que el
      // checklist en pantalla muestre siempre el detalle más reciente, pero
      // no se manda push de nuevo.
      await supabase
        .from("modo_ausente_violaciones")
        .upsert({ dispositivo_id: item.dispositivoId, estado: nuevoEstado, motivo: item.motivo || null, updated_at: ahoraIso })
      continue
    }

    if (nuevoEstado === "violacion") {
      await supabase.from("modo_ausente_violaciones").upsert({
        dispositivo_id: item.dispositivoId,
        estado: "violacion",
        motivo: item.motivo,
        detectado_en: ahoraIso,
        notificado_en: ahoraIso,
        updated_at: ahoraIso,
      })
      violacionesNuevas += 1
      try {
        await sendPushNotification({
          title: "Modo Ausente: requiere atención",
          body: `${item.nombre}: ${item.motivo}`,
          url: "/modo-ausente",
          tag: `modo-ausente-${item.dispositivoId}`,
        })
      } catch (err) {
        // Un fallo de push (VAPID mal configurado, service_role ausente,
        // push service caído) no puede tirar abajo el resto del evaluador:
        // el estado de violación ya quedó persistido arriba, así que el
        // checklist en pantalla y el próximo intento de notificar siguen
        // siendo correctos aunque este envío puntual haya fallado.
        console.error(`[modo-ausente] Error enviando push de violación (dispositivo ${item.dispositivoId}):`, err)
      }
    } else {
      await supabase.from("modo_ausente_violaciones").upsert({
        dispositivo_id: item.dispositivoId,
        estado: "ok",
        motivo: null,
        resuelto_notificado_en: ahoraIso,
        updated_at: ahoraIso,
      })
      resueltas += 1
      try {
        await sendPushNotification({
          title: "Modo Ausente: todo OK de nuevo",
          body: `${item.nombre} volvió a cumplir el estado requerido.`,
          url: "/modo-ausente",
          tag: `modo-ausente-${item.dispositivoId}`,
        })
      } catch (err) {
        console.error(`[modo-ausente] Error enviando push de resolución (dispositivo ${item.dispositivoId}):`, err)
      }
    }
  }

  return { evaluado: true, violacionesNuevas, resueltas }
}
