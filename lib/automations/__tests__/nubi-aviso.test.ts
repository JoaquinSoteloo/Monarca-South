import { beforeEach, describe, expect, it, vi } from "vitest"
import type { PushPayload } from "@/lib/push/send"
import { createFakeSupabase, type FakeSupabase } from "./fake-supabase"

const sendPushToUsers = vi.hoisted(() => vi.fn<(ids: string[], p: PushPayload) => Promise<{ sent: number; removed: number; failed: number }>>())
vi.mock("@/lib/push/send", () => ({ sendPushToUsers }))

import { proponerNubi } from "@/lib/nubi-aviso"

const AHORA = new Date("2026-11-13T18:30:00.000Z")
const hace = (min: number) => new Date(AHORA.getTime() - min * 60000).toISOString()

function sembrar(db: FakeSupabase, opciones: { temp?: number; aire?: Record<string, unknown>; ultimaOrdenHace?: number; proveedor?: string } = {}) {
  const temp = opciones.temp ?? 27.4
  db.seed("salas_cultivo", [{ id: 9, nombre: "Sala 5", activo: true }])
  db.seed("ciclos_sala", [{
    id: 4, sala_id: 9, nombre: null, estado: "abierto", geneticas: null, plantas: null, m2: 10,
    fecha_inicio: "2026-09-22", dias_vege: 50, dias_flora: 60, dias_lavado: 7, dias_secado: 6, dias_limpieza: 2, notas: null,
  }])
  db.seed("lecturas_ambientales", [60, 45, 30, 15, 10, 5, 0].map((m) => ({ sala_id: 9, temperatura_c: temp, humedad_rh: 50, leido_en: hace(m) })))
  db.seed("alertas_clima", [{ id: 1, sala_id: 9, variable: "temperatura", lado: temp > 26 ? "alto" : "bajo", valor: temp, limite: temp > 26 ? 26 : 22, mensaje: "x", desde: hace(20), notificada_en: hace(20), resuelta_en: null }])
  db.seed("dispositivos_controlables", [{
    id: 4, nombre: "Aire acondicionado", sala_id: 9, tipo: "aire_acondicionado", proveedor: opciones.proveedor ?? "broadlink_ir", activo: true,
    ultimo_comando_estado: "ejecutado", ultimo_comando_payload: opciones.aire ?? { accion: "encender", modo: "frio", setpoint: 23, fan: "auto" },
    ultimo_comando_en: hace(opciones.ultimaOrdenHace ?? 120),
  }])
  db.seed("perfiles", [
    { user_id: "u-joaco", rol: "comision", activo: true },
    { user_id: "u-vilela", rol: "operador", activo: true },
  ])
  db.seed("rol_permisos", [])
}

describe("proponerNubi", () => {
  let db: FakeSupabase
  beforeEach(() => {
    db = createFakeSupabase()
    sendPushToUsers.mockReset()
    sendPushToUsers.mockResolvedValue({ sent: 1, removed: 0, failed: 0 })
  })

  it("con calor y el aire en frío 23, propone bajarlo y le pregunta solo a quien puede aprobar", async () => {
    sembrar(db)
    expect(await proponerNubi(db as never, AHORA)).toBe(1)
    const [p] = db.tables["propuestas_nubi"]
    expect(p).toMatchObject({ estado: "pendiente", resumen: "bajar el aire de 23 a 21 °C", payload: { accion: "encender", modo: "frio", setpoint: 21, fan: "auto" } })
    expect(p.motivo).toBe("Sala 5: temperatura 27,4 °C (máx 26), aire en frío 23 °C")
    expect(sendPushToUsers).toHaveBeenCalledWith(["u-joaco"], expect.objectContaining({
      title: "🛰 ¿Bajar el aire de 23 a 21 °C?",
      acciones: [{ action: "mandar", title: "Mandar" }, { action: "no", title: "No" }],
      datos: { propuestaId: p.id },
    }))
  })

  it("no propone otra mientras haya una pendiente", async () => {
    sembrar(db)
    await proponerNubi(db as never, AHORA)
    expect(await proponerNubi(db as never, AHORA)).toBe(0)
    expect(db.tables["propuestas_nubi"]).toHaveLength(1)
  })

  it("las pendientes vencen a los 30 minutos y después puede proponer de nuevo", async () => {
    sembrar(db)
    await proponerNubi(db as never, AHORA)
    const despues = new Date(AHORA.getTime() + 31 * 60000)
    db.tables["lecturas_ambientales"].push({ sala_id: 9, temperatura_c: 27.4, humedad_rh: 50, leido_en: despues.toISOString() })
    expect(await proponerNubi(db as never, despues)).toBe(1)
    expect(db.tables["propuestas_nubi"].map((p) => p.estado)).toEqual(["vencida", "pendiente"])
  })

  it("espera 10 minutos después de la última orden", async () => {
    sembrar(db, { ultimaOrdenHace: 5 })
    expect(await proponerNubi(db as never, AHORA)).toBe(0)
  })

  it("con el aire en 16 avisa una sola vez que no alcanza", async () => {
    sembrar(db, { aire: { accion: "encender", modo: "frio", setpoint: 16 } })
    expect(await proponerNubi(db as never, AHORA)).toBe(1)
    expect(db.tables["propuestas_nubi"][0]).toMatchObject({ estado: "informada", payload: null })
    expect(sendPushToUsers.mock.calls[0][1].acciones).toBeUndefined()
    expect(await proponerNubi(db as never, AHORA)).toBe(0)
  })

  it("no le propone a los equipos de prueba", async () => {
    sembrar(db, { proveedor: "manual_noop" })
    expect(await proponerNubi(db as never, AHORA)).toBe(0)
  })
})
