// Consumo de IA (pedido de Joaquín, 14/11/2026; script 103): cada llamada a un
// modelo deja una fila en ia_uso con la función que la hizo, el modelo, los
// tokens (y cuántos salieron del caché, que cobran mucho menos) y cuánto tardó.
// Se ve en Control manual. Si no se puede guardar, no frena nada.
// Solo servidor.
import { createServiceClient } from "@/lib/supabase/service"

export type FuncionIA = "nubi" | "nubi_eval" | "resumen_semanal" | "asistente" | "fenotipado" | "otra"

export interface UsoIA {
  funcion: FuncionIA
  modelo: string | null
  tokensEntrada: number | null
  tokensCache: number | null
  tokensSalida: number | null
  latenciaMs: number
  ok: boolean
}

/** Tokens de una respuesta de OpenAI (Chat Completions) o de Anthropic (Messages). */
export function tokensDe(usage: unknown): { entrada: number | null; cache: number | null; salida: number | null } {
  const u = (usage ?? {}) as Record<string, unknown> & { prompt_tokens_details?: { cached_tokens?: number } }
  if (typeof u.prompt_tokens === "number") {
    return { entrada: u.prompt_tokens, cache: u.prompt_tokens_details?.cached_tokens ?? 0, salida: (u.completion_tokens as number) ?? null }
  }
  if (typeof u.input_tokens === "number") {
    // Anthropic cuenta aparte lo leído del caché y lo escrito en él.
    const leido = (u.cache_read_input_tokens as number) ?? 0
    const escrito = (u.cache_creation_input_tokens as number) ?? 0
    return { entrada: u.input_tokens + leido + escrito, cache: leido, salida: (u.output_tokens as number) ?? null }
  }
  return { entrada: null, cache: null, salida: null }
}

export async function registrarUso(uso: UsoIA): Promise<void> {
  try {
    const { error } = await createServiceClient().from("ia_uso").insert({
      funcion: uso.funcion,
      modelo: uso.modelo,
      tokens_entrada: uso.tokensEntrada,
      tokens_cache: uso.tokensCache,
      tokens_salida: uso.tokensSalida,
      latencia_ms: uso.latenciaMs,
      ok: uso.ok,
    })
    if (error) console.error("[ia] No se pudo registrar el consumo:", error.message)
  } catch (err) {
    console.error("[ia] No se pudo registrar el consumo:", err)
  }
}
