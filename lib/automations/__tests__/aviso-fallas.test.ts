import { beforeEach, describe, expect, it, vi } from "vitest"
import type { PushPayload } from "@/lib/push/send"
import { createFakeSupabase, type FakeSupabase } from "./fake-supabase"

const sendPushNotification = vi.hoisted(() =>
  vi.fn<(p: PushPayload) => Promise<{ sent: number; removed: number; failed: number }>>(),
)
vi.mock("@/lib/push/send", () => ({ sendPushNotification }))

import { avisarOrdenesSinCumplir, avisoDeOrdenSinCumplir } from "../aviso-fallas"

const AHORA = new Date("2026-11-09T22:00:00.000Z")

function equipo(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    nombre: "Aire Sala 5",
    activo: true,
    ultimo_comando_estado: "timeout",
    ultimo_comando_payload: { accion: "encender" },
    falla_notificada_en: null,
    ...overrides,
  }
}

describe("avisoDeOrdenSinCumplir", () => {
  it("si venció, dice qué orden era y manda a revisar la notebook", () => {
    const aviso = avisoDeOrdenSinCumplir(equipo(), null)
    expect(aviso.title).toBe("No se pudo encender Aire Sala 5")
    expect(aviso.body).toContain("notebook")
    expect(aviso.url).toBe("/automatizaciones")
  })

  it("si falló, muestra el motivo", () => {
    const aviso = avisoDeOrdenSinCumplir(
      equipo({ ultimo_comando_estado: "fallido", ultimo_comando_payload: { accion: "apagar" } }),
      "Shelly no respondió a tiempo",
    )
    expect(aviso.title).toBe("No se pudo apagar Aire Sala 5")
    expect(aviso.body).toBe("Shelly no respondió a tiempo")
  })

  it("con una acción desconocida o sin motivo no queda un texto roto", () => {
    const aviso = avisoDeOrdenSinCumplir(equipo({ ultimo_comando_estado: "fallido", ultimo_comando_payload: null }), null)
    expect(aviso.title).toBe("No se pudo controlar Aire Sala 5")
    expect(aviso.body).toBe("El equipo no pudo cumplir la orden.")
  })
})

describe("avisarOrdenesSinCumplir", () => {
  let db: FakeSupabase
  const correr = () => avisarOrdenesSinCumplir(db as never, AHORA)
  const fila = () => db.tables.dispositivos_controlables[0]

  beforeEach(() => {
    db = createFakeSupabase()
    sendPushNotification.mockReset()
    sendPushNotification.mockResolvedValue({ sent: 2, removed: 0, failed: 0 })
  })

  it("avisa una sola vez aunque la regla reintente y vuelva a vencer", async () => {
    db.seed("dispositivos_controlables", [equipo()])

    expect(await correr()).toBe(1)
    expect(fila().falla_notificada_en).toBe(AHORA.toISOString())

    fila().ultimo_comando_estado = "pendiente"
    await correr()
    fila().ultimo_comando_estado = "timeout"
    await correr()

    expect(sendPushNotification).toHaveBeenCalledTimes(1)
  })

  it("cuando el equipo vuelve a cumplir una orden, la próxima falla avisa de nuevo", async () => {
    db.seed("dispositivos_controlables", [equipo({ falla_notificada_en: "2026-11-09T20:00:00.000Z", ultimo_comando_estado: "ejecutado" })])

    await correr()
    expect(fila().falla_notificada_en).toBeNull()
    expect(sendPushNotification).not.toHaveBeenCalled()

    fila().ultimo_comando_estado = "fallido"
    await correr()
    expect(sendPushNotification).toHaveBeenCalledTimes(1)
  })

  it("incluye el motivo guardado en el último comando", async () => {
    db.seed("dispositivos_controlables", [equipo({ ultimo_comando_estado: "fallido" })])
    db.seed("comandos_dispositivo", [
      { id: 1, dispositivo_id: 1, estado: "fallido", error: "Motivo viejo", creado_en: "2026-11-09T20:00:00.000Z" },
      { id: 2, dispositivo_id: 1, estado: "fallido", error: "Falta aprender el botón encender", creado_en: "2026-11-09T21:59:00.000Z" },
    ])

    await correr()

    expect(sendPushNotification.mock.calls[0][0].body).toBe("Falta aprender el botón encender")
  })

  it("si no se pudo mandar, no lo marca y lo reintenta en la próxima corrida", async () => {
    db.seed("dispositivos_controlables", [equipo()])
    sendPushNotification.mockRejectedValueOnce(new Error("VAPID mal configurado"))
    sendPushNotification.mockResolvedValueOnce({ sent: 0, removed: 0, failed: 2 })

    expect(await correr()).toBe(0)
    expect(await correr()).toBe(0)
    expect(fila().falla_notificada_en).toBeNull()

    expect(await correr()).toBe(1)
    expect(fila().falla_notificada_en).toBe(AHORA.toISOString())
  })

  it("si nadie tiene notificaciones activadas, no insiste", async () => {
    db.seed("dispositivos_controlables", [equipo()])
    sendPushNotification.mockResolvedValue({ sent: 0, removed: 0, failed: 0 })

    await correr()

    expect(fila().falla_notificada_en).toBe(AHORA.toISOString())
  })

  it("no avisa por equipos sin falla ni dados de baja", async () => {
    db.seed("dispositivos_controlables", [
      equipo({ id: 1, ultimo_comando_estado: "ejecutado" }),
      equipo({ id: 2, ultimo_comando_estado: "pendiente" }),
      equipo({ id: 3, ultimo_comando_estado: null }),
      equipo({ id: 4, activo: false }),
    ])

    expect(await correr()).toBe(0)
    expect(sendPushNotification).not.toHaveBeenCalled()
  })
})
