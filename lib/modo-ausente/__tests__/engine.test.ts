// Validación de checkModoAusente contra un Supabase en memoria (reusa
// lib/automations/__tests__/fake-supabase.ts, extendido con in/not/upsert —
// ver ese archivo). No se seedean automatizaciones, así que
// getSensorStaleFlags nunca marca nada stale: estos tests se enfocan
// exclusivamente en la transición ok<->violación y su deduplicación de push,
// no en el fail-safe de sensor (ya cubierto por checklist.test.ts a nivel
// unitario).
import { beforeEach, describe, expect, it, vi } from "vitest"
import { checkModoAusente } from "../engine"
import { createFakeSupabase, type FakeSupabase } from "@/lib/automations/__tests__/fake-supabase"
import type { DispositivoControlable, ModoAusenteEstado } from "@/lib/types"
import type { PushPayload } from "@/lib/push/send"

const { sendPushNotification } = vi.hoisted(() => ({
  sendPushNotification: vi.fn(async (_payload: PushPayload) => ({ sent: 1, removed: 0, failed: 0 })),
}))
vi.mock("@/lib/push/send", () => ({ sendPushNotification }))

const AHORA = new Date("2026-01-01T12:00:00.000Z")

function makeDispositivo(overrides: Partial<DispositivoControlable> = {}): DispositivoControlable {
  return {
    id: 1,
    nombre: "Extractor Sala 1",
    sala_id: 1,
    tipo: "extractor",
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
    requisito_ausente: "apagado",
    created_at: AHORA.toISOString(),
    updated_at: AHORA.toISOString(),
    ...overrides,
  } as DispositivoControlable
}

function seedEstadoActivo(supabase: FakeSupabase, overrides: Partial<ModoAusenteEstado> = {}) {
  supabase.seed("modo_ausente_estado", [
    {
      id: 1,
      activo: true,
      activado_en: AHORA.toISOString(),
      activado_por: "test@monarca.local",
      activado_desde: null,
      desactivado_en: null,
      desactivado_por: null,
      ...overrides,
    },
  ])
}

function db(supabase: FakeSupabase) {
  return supabase as unknown as Parameters<typeof checkModoAusente>[0]
}

function cumple(supabase: FakeSupabase) {
  supabase.tables["dispositivos_controlables"][0].ultimo_comando_estado = "ejecutado"
  supabase.tables["dispositivos_controlables"][0].ultimo_comando_payload = { accion: "apagar" }
}

function viola(supabase: FakeSupabase) {
  supabase.tables["dispositivos_controlables"][0].ultimo_comando_estado = "ejecutado"
  supabase.tables["dispositivos_controlables"][0].ultimo_comando_payload = { accion: "encender" }
}

beforeEach(() => {
  sendPushNotification.mockClear()
})

describe("checkModoAusente", () => {
  it("no hace nada si Modo Ausente está inactivo", async () => {
    const supabase = createFakeSupabase()
    supabase.seed("dispositivos_controlables", [makeDispositivo()])
    supabase.seed("modo_ausente_estado", [{ id: 1, activo: false }])

    const resultado = await checkModoAusente(db(supabase))

    expect(resultado).toEqual({ evaluado: false, violacionesNuevas: 0, resueltas: 0 })
    expect(sendPushNotification).not.toHaveBeenCalled()
  })

  it("transición ok -> violación -> sigue violación -> ok: notifica solo en cada transición, nunca duplica", async () => {
    const supabase = createFakeSupabase()
    supabase.seed("dispositivos_controlables", [makeDispositivo()])
    seedEstadoActivo(supabase)

    // 1) Estado inicial OK (sin fila previa en modo_ausente_violaciones ->
    // se asume 'ok' por default): no hay transición, no se notifica.
    cumple(supabase)
    const run1 = await checkModoAusente(db(supabase))
    expect(run1).toEqual({ evaluado: true, violacionesNuevas: 0, resueltas: 0 })
    expect(sendPushNotification).not.toHaveBeenCalled()
    expect(supabase.tables["modo_ausente_violaciones"][0].estado).toBe("ok")

    // 2) Pasa a violación: transición ok->violación, notifica una vez.
    viola(supabase)
    const run2 = await checkModoAusente(db(supabase))
    expect(run2).toEqual({ evaluado: true, violacionesNuevas: 1, resueltas: 0 })
    expect(sendPushNotification).toHaveBeenCalledTimes(1)
    expect(sendPushNotification.mock.calls[0][0]).toMatchObject({ title: "Modo Ausente: requiere atención" })
    expect(supabase.tables["modo_ausente_violaciones"][0].estado).toBe("violacion")

    // 3) Sigue en violación (mismo estado incumplido): sin transición, no
    // se debe notificar de nuevo.
    const run3 = await checkModoAusente(db(supabase))
    expect(run3).toEqual({ evaluado: true, violacionesNuevas: 0, resueltas: 0 })
    expect(sendPushNotification).toHaveBeenCalledTimes(1)

    // 4) Vuelve a cumplir: transición violación->ok, notifica la
    // resolución (y solo esa, el contador total pasa a 2).
    cumple(supabase)
    const run4 = await checkModoAusente(db(supabase))
    expect(run4).toEqual({ evaluado: true, violacionesNuevas: 0, resueltas: 1 })
    expect(sendPushNotification).toHaveBeenCalledTimes(2)
    expect(sendPushNotification.mock.calls[1][0]).toMatchObject({ title: "Modo Ausente: todo OK de nuevo" })
    expect(supabase.tables["modo_ausente_violaciones"][0].estado).toBe("ok")

    // 5) Se mantiene OK: ninguna notificación adicional.
    const run5 = await checkModoAusente(db(supabase))
    expect(run5).toEqual({ evaluado: true, violacionesNuevas: 0, resueltas: 0 })
    expect(sendPushNotification).toHaveBeenCalledTimes(2)
  })

  it("un fallo al enviar el push no rompe la corrida ni pierde el estado de violación persistido", async () => {
    const supabase = createFakeSupabase()
    supabase.seed("dispositivos_controlables", [makeDispositivo()])
    seedEstadoActivo(supabase)
    viola(supabase)
    sendPushNotification.mockRejectedValueOnce(new Error("push service caído"))
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})

    const resultado = await checkModoAusente(db(supabase))
    consoleError.mockRestore()

    expect(resultado).toEqual({ evaluado: true, violacionesNuevas: 1, resueltas: 0 })
    expect(supabase.tables["modo_ausente_violaciones"][0].estado).toBe("violacion")
  })
})
