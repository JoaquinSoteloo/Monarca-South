// Validación del motor de automatizaciones (evaluateAutomations) contra un
// Supabase en memoria (ver ./fake-supabase.ts), sin red ni base real. Cubre
// exactamente los casos pedidos antes de conectar hardware real:
// activación, condición sostenida, histéresis, cooldown, modo manual, Pulse
// stale (fail-safe mantener/apagar), comando fallido, y deduplicación de
// comandos. getPulseSnapshots se mockea para que el motor no intente pegarle
// a Pulse Grow real — las lecturas de cada test se siembran directo en
// lecturas_ambientales, que es lo que el motor realmente lee para sus
// decisiones temporales.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { evaluateAutomations } from "../engine"
import { createFakeSupabase, type FakeSupabase } from "./fake-supabase"
import type { Automatizacion, DispositivoControlable } from "@/lib/types"

vi.mock("@/lib/pulse-grow/service", () => ({
  getPulseSnapshots: vi.fn(async () => []),
}))

const AHORA = new Date("2026-01-01T12:00:00.000Z")

function makeDispositivo(overrides: Partial<DispositivoControlable> = {}): DispositivoControlable {
  return {
    id: 1,
    nombre: "Aire acondicionado Sala 1",
    sala_id: 1,
    tipo: "aire_acondicionado",
    proveedor: "manual_noop",
    modo_ejecucion: "servidor_directo",
    proveedor_config: {},
    soporta_feedback: false,
    modo: "automatico",
    activo: true,
    ultimo_comando_payload: null,
    ultimo_comando_en: null,
    ultimo_comando_origen: null,
    ultimo_comando_estado: null,
    ultimo_estado_confirmado_payload: null,
    ultimo_estado_confirmado_en: null,
    created_at: AHORA.toISOString(),
    updated_at: AHORA.toISOString(),
    ...overrides,
  } as DispositivoControlable
}

function makeAutomatizacion(overrides: Partial<Automatizacion> = {}): Automatizacion {
  return {
    id: 1,
    nombre: "Enfriar Sala 1",
    sala_id: 1,
    activa: true,
    pulse_device_id: 1,
    variable: "temperatura_c",
    operador: ">",
    valor_objetivo: 25,
    duracion_minima_segundos: 0,
    operador_apagado: null,
    valor_apagado: null,
    duracion_apagado_segundos: null,
    cooldown_segundos: 300,
    dispositivo_id: 1,
    accion_encendido: { accion: "encender" },
    accion_apagado: { accion: "apagar" },
    accion_fail_safe: "mantener",
    ultimo_disparo_en: null,
    ultimo_disparo_tipo: null,
    created_at: AHORA.toISOString(),
    updated_at: AHORA.toISOString(),
    ...overrides,
  } as Automatizacion
}

function seedLectura(db: FakeSupabase, overrides: Record<string, unknown>) {
  db.tables["lecturas_ambientales"] = db.tables["lecturas_ambientales"] ?? []
  db.tables["lecturas_ambientales"].push({
    id: db.tables["lecturas_ambientales"].length + 1,
    pulse_device_id: 1,
    sala_id: 1,
    temperatura_c: null,
    humedad_rh: null,
    vpd: null,
    luz_lux: null,
    presion_hpa: null,
    dew_point_c: null,
    created_at: AHORA.toISOString(),
    ...overrides,
  })
}

function db(supabase: FakeSupabase) {
  return supabase as unknown as Parameters<typeof evaluateAutomations>[0]
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(AHORA)
})

afterEach(() => {
  vi.useRealTimers()
})

describe("evaluateAutomations", () => {
  it("activa una regla cuando la condición instantánea se cumple", async () => {
    const supabase = createFakeSupabase()
    supabase.seed("dispositivos_controlables", [makeDispositivo()])
    supabase.seed("automatizaciones", [makeAutomatizacion()])
    seedLectura(supabase, { leido_en: AHORA.toISOString(), temperatura_c: 26 })

    const resumen = await evaluateAutomations(db(supabase))

    expect(resumen.comandosEncolados).toBe(1)
    expect(supabase.tables["comandos_dispositivo"]).toHaveLength(1)
    expect(supabase.tables["comandos_dispositivo"][0].estado).toBe("ejecutado")
    expect(supabase.tables["dispositivos_controlables"][0].ultimo_comando_estado).toBe("ejecutado")
    expect(supabase.tables["ejecuciones_automatizacion"].some((e) => e.tipo === "encendido")).toBe(true)
  })

  it("no dispara una condición sostenida si no hay historial suficiente cubriendo la ventana", async () => {
    const supabase = createFakeSupabase()
    supabase.seed("dispositivos_controlables", [makeDispositivo()])
    supabase.seed("automatizaciones", [makeAutomatizacion({ duracion_minima_segundos: 180 })])
    // Una sola lectura reciente: no cubre los 3 minutos pedidos.
    seedLectura(supabase, { leido_en: AHORA.toISOString(), temperatura_c: 26 })

    const resumen = await evaluateAutomations(db(supabase))

    expect(resumen.comandosEncolados).toBe(0)
  })

  it("dispara una condición sostenida cuando el historial cubre toda la ventana pedida", async () => {
    const supabase = createFakeSupabase()
    supabase.seed("dispositivos_controlables", [makeDispositivo()])
    supabase.seed("automatizaciones", [makeAutomatizacion({ duracion_minima_segundos: 180 })])
    for (let s = 180; s >= 0; s -= 30) {
      seedLectura(supabase, { leido_en: new Date(AHORA.getTime() - s * 1000).toISOString(), temperatura_c: 26 })
    }

    const resumen = await evaluateAutomations(db(supabase))

    expect(resumen.comandosEncolados).toBe(1)
  })

  it("no dispara nada en la zona muerta entre la condición de encendido y la de histéresis", async () => {
    const supabase = createFakeSupabase()
    supabase.seed("dispositivos_controlables", [makeDispositivo()])
    supabase.seed(
      "automatizaciones",
      [makeAutomatizacion({ operador_apagado: "<", valor_apagado: 23, duracion_apagado_segundos: 0 })],
    )
    seedLectura(supabase, { leido_en: AHORA.toISOString(), temperatura_c: 24 })

    const resumen = await evaluateAutomations(db(supabase))

    expect(resumen.comandosEncolados).toBe(0)
  })

  it("dispara apagado cuando se cumple la condición de histéresis", async () => {
    const supabase = createFakeSupabase()
    supabase.seed("dispositivos_controlables", [makeDispositivo()])
    supabase.seed(
      "automatizaciones",
      [makeAutomatizacion({ operador_apagado: "<", valor_apagado: 23, duracion_apagado_segundos: 0 })],
    )
    seedLectura(supabase, { leido_en: AHORA.toISOString(), temperatura_c: 22 })

    const resumen = await evaluateAutomations(db(supabase))

    expect(resumen.comandosEncolados).toBe(1)
    expect(supabase.tables["ejecuciones_automatizacion"].some((e) => e.tipo === "apagado")).toBe(true)
  })

  it("el cooldown bloquea un segundo disparo aunque la condición cambie, y lo libera al vencer", async () => {
    const supabase = createFakeSupabase()
    supabase.seed("dispositivos_controlables", [makeDispositivo()])
    supabase.seed("automatizaciones", [makeAutomatizacion({ cooldown_segundos: 300 })])

    seedLectura(supabase, { leido_en: AHORA.toISOString(), temperatura_c: 26 })
    const run1 = await evaluateAutomations(db(supabase))
    expect(run1.comandosEncolados).toBe(1)

    // 30s después: condición distinta (apagado), pero dentro del cooldown.
    vi.setSystemTime(new Date(AHORA.getTime() + 30_000))
    seedLectura(supabase, { leido_en: new Date(AHORA.getTime() + 30_000).toISOString(), temperatura_c: 20 })
    const run2 = await evaluateAutomations(db(supabase))
    expect(run2.comandosEncolados).toBe(0)

    // 310s después del disparo original: cooldown ya venció.
    vi.setSystemTime(new Date(AHORA.getTime() + 310_000))
    seedLectura(supabase, { leido_en: new Date(AHORA.getTime() + 310_000).toISOString(), temperatura_c: 20 })
    const run3 = await evaluateAutomations(db(supabase))
    expect(run3.comandosEncolados).toBe(1)
    expect(supabase.tables["ejecuciones_automatizacion"].filter((e) => e.tipo === "apagado")).toHaveLength(1)
  })

  it("no toca dispositivos en modo manual aunque la condición se cumpla", async () => {
    const supabase = createFakeSupabase()
    supabase.seed("dispositivos_controlables", [makeDispositivo({ modo: "manual" })])
    supabase.seed("automatizaciones", [makeAutomatizacion()])
    seedLectura(supabase, { leido_en: AHORA.toISOString(), temperatura_c: 30 })

    const resumen = await evaluateAutomations(db(supabase))

    expect(resumen.comandosEncolados).toBe(0)
    expect(supabase.tables["comandos_dispositivo"] ?? []).toHaveLength(0)
    expect((supabase.tables["ejecuciones_automatizacion"] ?? []).filter((e) => e.automatizacion_id === 1)).toHaveLength(0)
  })

  it("entra en fail-safe 'mantener' cuando Pulse no reporta datos, sin duplicar el log en corridas siguientes", async () => {
    const supabase = createFakeSupabase()
    supabase.seed("dispositivos_controlables", [makeDispositivo()])
    supabase.seed("automatizaciones", [makeAutomatizacion({ accion_fail_safe: "mantener" })])
    // Sin lecturas_ambientales sembradas -> sensor stale.

    const run1 = await evaluateAutomations(db(supabase))
    expect(run1.comandosEncolados).toBe(0)
    expect(supabase.tables["ejecuciones_automatizacion"].filter((e) => e.tipo === "fail_safe")).toHaveLength(1)

    const run2 = await evaluateAutomations(db(supabase))
    expect(run2.comandosEncolados).toBe(0)
    expect(supabase.tables["ejecuciones_automatizacion"].filter((e) => e.tipo === "fail_safe")).toHaveLength(1)
  })

  it("fail-safe 'apagar' dispara el apagado ignorando el cooldown", async () => {
    const supabase = createFakeSupabase()
    supabase.seed(
      "dispositivos_controlables",
      [makeDispositivo({ ultimo_comando_payload: { accion: "encender" }, ultimo_comando_estado: "ejecutado" })],
    )
    supabase.seed(
      "automatizaciones",
      [
        makeAutomatizacion({
          accion_fail_safe: "apagar",
          cooldown_segundos: 999_999,
          ultimo_disparo_en: AHORA.toISOString(),
          ultimo_disparo_tipo: "encendido",
        }),
      ],
    )
    // Sin lecturas_ambientales -> sensor stale.

    const resumen = await evaluateAutomations(db(supabase))

    expect(resumen.comandosEncolados).toBe(1)
    expect(supabase.tables["dispositivos_controlables"][0].ultimo_comando_payload).toEqual({ accion: "apagar" })
  })

  it("registra un comando fallido con manual_noop.fallarSiempre sin romper la corrida", async () => {
    const supabase = createFakeSupabase()
    supabase.seed("dispositivos_controlables", [makeDispositivo({ proveedor_config: { fallarSiempre: true } })])
    supabase.seed("automatizaciones", [makeAutomatizacion()])
    seedLectura(supabase, { leido_en: AHORA.toISOString(), temperatura_c: 26 })

    const resumen = await evaluateAutomations(db(supabase))

    expect(resumen.comandosEncolados).toBe(1)
    expect(supabase.tables["comandos_dispositivo"][0].estado).toBe("fallido")
    expect(supabase.tables["dispositivos_controlables"][0].ultimo_comando_estado).toBe("fallido")
  })

  it("evita re-encolar un comando idéntico al último ya ejecutado", async () => {
    const supabase = createFakeSupabase()
    supabase.seed(
      "dispositivos_controlables",
      [makeDispositivo({ ultimo_comando_payload: { accion: "encender" }, ultimo_comando_estado: "ejecutado" })],
    )
    supabase.seed("automatizaciones", [makeAutomatizacion({ cooldown_segundos: 0 })])
    seedLectura(supabase, { leido_en: AHORA.toISOString(), temperatura_c: 26 })

    const resumen = await evaluateAutomations(db(supabase))

    expect(resumen.comandosEncolados).toBe(0)
    expect(supabase.tables["comandos_dispositivo"] ?? []).toHaveLength(0)
  })
})
