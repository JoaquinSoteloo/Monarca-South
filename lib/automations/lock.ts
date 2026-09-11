// Lock de ejecución del motor (ver scripts/047_create_automations_engine_lock.sql).
// Evita que dos corridas de evaluateAutomations se solapen — importante en
// cuanto el pinger externo pasa a invocar el endpoint cada 1 minuto: si una
// corrida puntual tarda más que eso (latencia de Pulse, etc.), la siguiente
// invocación no debe pisarla.
import type { SupabaseClient } from "@supabase/supabase-js"

// Si una corrida se cae sin liberar el lock (timeout de la función
// serverless, crash), se considera "abandonada" pasado este umbral y una
// corrida posterior puede reclamarlo igual. Generoso a propósito: mayor que
// cualquier timeout razonable de la función (ver maxDuration en las route
// handlers de evaluate), para no pisar una corrida que todavía está viva.
const LOCK_STALE_MS = 2 * 60 * 1000

/** Intenta tomar el lock. Devuelve true si lo consiguió, false si otra corrida ya lo tiene. */
export async function acquireEngineLock(supabase: SupabaseClient): Promise<boolean> {
  const ahora = new Date()
  const staleCutoff = new Date(ahora.getTime() - LOCK_STALE_MS).toISOString()

  // Update atómico condicionado: solo "gana" el lock si está libre, o si
  // quedó tomado desde hace más de LOCK_STALE_MS (corrida anterior abandonada).
  const { data } = await supabase
    .from("automations_engine_lock")
    .update({ locked: true, locked_at: ahora.toISOString() })
    .eq("id", 1)
    .or(`locked.eq.false,locked_at.lt.${staleCutoff}`)
    .select()
    .maybeSingle()

  return !!data
}

export async function releaseEngineLock(supabase: SupabaseClient): Promise<void> {
  await supabase.from("automations_engine_lock").update({ locked: false, locked_at: null }).eq("id", 1)
}

/**
 * Corre `fn` solo si consigue el lock del motor; si no, la salta (no es un
 * error — es el comportamiento esperado cuando dos invocaciones se solapan).
 * Libera el lock siempre, incluso si `fn` tira una excepción.
 */
export async function withEngineLock<T>(supabase: SupabaseClient, fn: () => Promise<T>): Promise<{ ejecuto: true; resultado: T } | { ejecuto: false }> {
  const tomado = await acquireEngineLock(supabase)
  if (!tomado) {
    return { ejecuto: false }
  }
  try {
    const resultado = await fn()
    return { ejecuto: true, resultado }
  } finally {
    await releaseEngineLock(supabase)
  }
}
