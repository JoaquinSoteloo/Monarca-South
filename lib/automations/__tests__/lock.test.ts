// Valida el lock de una sola fila que evita que dos evaluaciones del motor
// se solapen (ver lib/automations/lock.ts y
// scripts/047_create_automations_engine_lock.sql) — clave ahora que el
// pinger externo invoca /api/automations/evaluate cada 1 minuto.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { acquireEngineLock, releaseEngineLock, withEngineLock } from "../lock"
import { createFakeSupabase } from "./fake-supabase"

const AHORA = new Date("2026-01-01T12:00:00.000Z")

function db(supabase: ReturnType<typeof createFakeSupabase>) {
  return supabase as unknown as Parameters<typeof acquireEngineLock>[0]
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(AHORA)
})

afterEach(() => {
  vi.useRealTimers()
})

describe("automations_engine_lock", () => {
  it("una corrida consigue el lock cuando está libre", async () => {
    const supabase = createFakeSupabase()
    supabase.seed("automations_engine_lock", [{ id: 1, locked: false, locked_at: null }])

    const tomado = await acquireEngineLock(db(supabase))

    expect(tomado).toBe(true)
    expect(supabase.tables["automations_engine_lock"][0].locked).toBe(true)
  })

  it("una segunda corrida NO consigue el lock mientras la primera sigue activa", async () => {
    const supabase = createFakeSupabase()
    supabase.seed("automations_engine_lock", [{ id: 1, locked: false, locked_at: null }])

    const primera = await acquireEngineLock(db(supabase))
    expect(primera).toBe(true)

    // 10s después, con el lock todavía fresco.
    vi.setSystemTime(new Date(AHORA.getTime() + 10_000))
    const segunda = await acquireEngineLock(db(supabase))

    expect(segunda).toBe(false)
  })

  it("una corrida puede reclamar un lock abandonado (stale) de una anterior que no llegó a liberar", async () => {
    const supabase = createFakeSupabase()
    // Lock tomado hace más de LOCK_STALE_MS (2 min) y nunca liberado —
    // simula una función serverless que se cayó sin pasar por el finally.
    supabase.seed("automations_engine_lock", [
      { id: 1, locked: true, locked_at: new Date(AHORA.getTime() - 3 * 60 * 1000).toISOString() },
    ])

    const tomado = await acquireEngineLock(db(supabase))

    expect(tomado).toBe(true)
  })

  it("withEngineLock corre fn cuando consigue el lock, y lo libera al terminar", async () => {
    const supabase = createFakeSupabase()
    supabase.seed("automations_engine_lock", [{ id: 1, locked: false, locked_at: null }])

    const resultado = await withEngineLock(db(supabase), async () => "ok")

    expect(resultado).toEqual({ ejecuto: true, resultado: "ok" })
    expect(supabase.tables["automations_engine_lock"][0].locked).toBe(false)
  })

  it("withEngineLock no corre fn si no consigue el lock", async () => {
    const supabase = createFakeSupabase()
    supabase.seed("automations_engine_lock", [{ id: 1, locked: true, locked_at: AHORA.toISOString() }])
    const fn = vi.fn(async () => "no debería correr")

    const resultado = await withEngineLock(db(supabase), fn)

    expect(resultado).toEqual({ ejecuto: false })
    expect(fn).not.toHaveBeenCalled()
  })

  it("withEngineLock libera el lock incluso si fn tira una excepción", async () => {
    const supabase = createFakeSupabase()
    supabase.seed("automations_engine_lock", [{ id: 1, locked: false, locked_at: null }])

    await expect(
      withEngineLock(db(supabase), async () => {
        throw new Error("boom")
      }),
    ).rejects.toThrow("boom")

    expect(supabase.tables["automations_engine_lock"][0].locked).toBe(false)
  })

  it("releaseEngineLock limpia locked y locked_at", async () => {
    const supabase = createFakeSupabase()
    supabase.seed("automations_engine_lock", [{ id: 1, locked: true, locked_at: AHORA.toISOString() }])

    await releaseEngineLock(db(supabase))

    expect(supabase.tables["automations_engine_lock"][0]).toMatchObject({ locked: false, locked_at: null })
  })
})
