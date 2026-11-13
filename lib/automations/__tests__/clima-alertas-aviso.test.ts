import { beforeEach, describe, expect, it, vi } from "vitest"
import type { PushPayload } from "@/lib/push/send"
import { createFakeSupabase, type FakeSupabase } from "./fake-supabase"

const sendPushNotification = vi.hoisted(() =>
  vi.fn<(p: PushPayload) => Promise<{ sent: number; removed: number; failed: number }>>(),
)
vi.mock("@/lib/push/send", () => ({ sendPushNotification }))

import { avisarClima } from "@/lib/clima-alertas-aviso"

const AHORA = new Date("2026-11-13T18:30:00.000Z")
const hace = (min: number) => new Date(AHORA.getTime() - min * 60000).toISOString()

function sembrar(db: FakeSupabase, humedades: number[]) {
  db.seed("salas_cultivo", [{ id: 9, nombre: "Sala 5", activo: true }])
  db.seed("ciclos_sala", [{
    id: 4, sala_id: 9, nombre: null, estado: "abierto", geneticas: null, plantas: null, m2: 10,
    fecha_inicio: "2026-09-22", dias_vege: 50, dias_flora: 60, dias_lavado: 7, dias_secado: 6, dias_limpieza: 2, notas: null,
  }])
  db.seed("lecturas_ambientales", humedades.map((h, i) => ({
    sala_id: 9, temperatura_c: 23.3, humedad_rh: h, leido_en: hace((humedades.length - 1 - i) * 5),
  })))
}

describe("avisarClima", () => {
  let db: FakeSupabase
  beforeEach(() => {
    db = createFakeSupabase()
    sendPushNotification.mockReset()
    sendPushNotification.mockResolvedValue({ sent: 2, removed: 0, failed: 0 })
  })

  it("avisa una sola vez mientras la sala sigue fuera de rango", async () => {
    sembrar(db, [71, 72, 73, 72])
    expect(await avisarClima(db as never, AHORA)).toBe(1)
    expect(sendPushNotification).toHaveBeenCalledWith(expect.objectContaining({ title: "⚠ Sala 5: humedad 72 % (máx 55)", url: "/sede" }))
    const [alerta] = db.tables["alertas_clima"]
    expect(alerta).toMatchObject({ sala_id: 9, variable: "humedad", lado: "alto", valor: 72, limite: 55, notificada_en: AHORA.toISOString() })

    expect(await avisarClima(db as never, AHORA)).toBe(0)
    expect(sendPushNotification).toHaveBeenCalledTimes(1)
    expect(db.tables["alertas_clima"]).toHaveLength(1)
  })

  it("si el push falla, lo reintenta en la próxima corrida", async () => {
    sembrar(db, [71, 72, 73, 72])
    sendPushNotification.mockResolvedValueOnce({ sent: 0, removed: 0, failed: 2 })
    expect(await avisarClima(db as never, AHORA)).toBe(0)
    expect(db.tables["alertas_clima"][0].notificada_en ?? null).toBeNull()
    expect(await avisarClima(db as never, AHORA)).toBe(1)
    expect(db.tables["alertas_clima"][0].notificada_en).toBe(AHORA.toISOString())
  })

  it("avisa cuando vuelve al rango y cierra la alerta", async () => {
    sembrar(db, [71, 72, 73, 72])
    await avisarClima(db as never, AHORA)
    db.tables["lecturas_ambientales"] = [
      { sala_id: 9, temperatura_c: 23, humedad_rh: 60, leido_en: hace(10) },
      { sala_id: 9, temperatura_c: 23, humedad_rh: 54, leido_en: hace(5) },
      { sala_id: 9, temperatura_c: 23, humedad_rh: 53, leido_en: hace(0) },
    ]
    expect(await avisarClima(db as never, AHORA)).toBe(1)
    expect(sendPushNotification).toHaveBeenLastCalledWith(expect.objectContaining({ title: "✓ Sala 5: la humedad volvió al rango (53 %)" }))
    expect(db.tables["alertas_clima"][0].resuelta_en).toBe(AHORA.toISOString())
  })

  it("sin lecturas del sensor no avisa ni cierra nada", async () => {
    sembrar(db, [71, 72, 73, 72])
    await avisarClima(db as never, AHORA)
    db.tables["lecturas_ambientales"] = []
    expect(await avisarClima(db as never, AHORA)).toBe(0)
    expect(db.tables["alertas_clima"][0].resuelta_en ?? null).toBeNull()
  })

  it("en rango no hace nada", async () => {
    sembrar(db, [50, 51, 52, 50])
    expect(await avisarClima(db as never, AHORA)).toBe(0)
    expect(sendPushNotification).not.toHaveBeenCalled()
    expect(db.tables["alertas_clima"] ?? []).toHaveLength(0)
  })
})
