import { beforeEach, describe, expect, it, vi } from "vitest"
import type { PushPayload } from "@/lib/push/send"
import { createFakeSupabase, type FakeSupabase } from "./fake-supabase"

const sendPushToUsers = vi.hoisted(() => vi.fn<(ids: string[], p: PushPayload) => Promise<{ sent: number; removed: number; failed: number }>>())
vi.mock("@/lib/push/send", () => ({ sendPushToUsers }))

import { proponerNubi } from "@/lib/nubi-aviso"

const AHORA = new Date("2026-11-13T18:30:00.000Z")
const hace = (min: number) => new Date(AHORA.getTime() - min * 60000).toISOString()

function sembrar(db: FakeSupabase, o: { humedad: number; real: Record<string, unknown>; alerta?: boolean }) {
  db.seed("salas_cultivo", [{ id: 9, nombre: "Sala 5", activo: true }])
  db.seed("ciclos_sala", [{
    id: 4, sala_id: 9, nombre: null, estado: "abierto", geneticas: null, plantas: null, m2: 10,
    fecha_inicio: "2026-09-22", dias_vege: 50, dias_flora: 60, dias_lavado: 7, dias_secado: 6, dias_limpieza: 2, notas: null,
  }])
  db.seed("lecturas_ambientales", [15, 10, 5, 0].map((m) => ({ sala_id: 9, temperatura_c: 23.5, humedad_rh: o.humedad, leido_en: hace(m) })))
  db.seed("alertas_clima", o.alerta ? [{ id: 7, sala_id: 9, variable: "humedad", lado: "alto", valor: o.humedad, limite: 55, mensaje: "x", desde: hace(20), resuelta_en: null }] : [])
  db.seed("dispositivos_controlables", [{
    id: 5, nombre: "Deshumidificador", sala_id: 9, tipo: "deshumidificador", proveedor: "shelly_local", activo: true,
    soporta_feedback: true, ultimo_estado_confirmado_payload: o.real, ultimo_estado_confirmado_en: hace(1),
    ultimo_comando_estado: "ejecutado", ultimo_comando_payload: { accion: "encender" }, ultimo_comando_en: hace(120),
  }])
  db.seed("perfiles", [{ user_id: "u-joaco", rol: "comision", activo: true }])
  db.seed("rol_permisos", [])
}

describe("proponerNubi: deshumidificador", () => {
  let db: FakeSupabase
  beforeEach(() => {
    db = createFakeSupabase()
    sendPushToUsers.mockReset()
    sendPushToUsers.mockResolvedValue({ sent: 1, removed: 0, failed: 0 })
  })

  it("humedad alta con alerta y el deshumidificador apagado (estado real): propone prenderlo", async () => {
    sembrar(db, { humedad: 73, real: { accion: "apagar" }, alerta: true })
    expect(await proponerNubi(db as never, AHORA)).toBe(1)
    expect(db.tables["propuestas_nubi"][0]).toMatchObject({
      estado: "pendiente",
      resumen: "prender el deshumidificador",
      payload: { accion: "encender" },
      motivo: "Sala 5: humedad 73 % (rango 45–55), deshumidificador apagado",
    })
    expect(sendPushToUsers.mock.calls[0][1].title).toBe("🛰 ¿Prender el deshumidificador?")
  })

  it("sin alerta todavía (menos de 15 minutos) no propone prenderlo", async () => {
    sembrar(db, { humedad: 73, real: { accion: "apagar" }, alerta: false })
    expect(await proponerNubi(db as never, AHORA)).toBe(0)
  })

  it("prendido y la humedad ya en la mitad del rango: propone apagarlo", async () => {
    sembrar(db, { humedad: 49, real: { accion: "encender", potencia_w: 560 } })
    expect(await proponerNubi(db as never, AHORA)).toBe(1)
    expect(db.tables["propuestas_nubi"][0]).toMatchObject({ resumen: "apagar el deshumidificador", payload: { accion: "apagar" } })
  })

  it("prendido sin consumir hace 15 minutos: avisa una sola vez", async () => {
    sembrar(db, { humedad: 73, real: { accion: "encender", potencia_w: 0, sin_consumo_desde: hace(20) }, alerta: true })
    expect(await proponerNubi(db as never, AHORA)).toBe(1)
    expect(db.tables["propuestas_nubi"][0]).toMatchObject({ estado: "informada", payload: null })
    expect(sendPushToUsers.mock.calls[0][1]).toMatchObject({ title: "🛰 Sala 5: el deshumidificador no está consumiendo" })
    expect(sendPushToUsers.mock.calls[0][1].acciones).toBeUndefined()
    expect(await proponerNubi(db as never, AHORA)).toBe(0)
  })
})
