import { describe, expect, it } from "vitest"
import { createFakeSupabase } from "@/lib/automations/__tests__/fake-supabase"
import { registrarEstados } from "../estado"

const AHORA = new Date("2026-11-13T20:30:00.000Z")

function db() {
  const d = createFakeSupabase()
  d.seed("dispositivos_controlables", [
    { id: 5, nombre: "Deshumidificador", proveedor: "shelly_local", activo: true, soporta_feedback: false, proveedor_config: { device_id: "28372f26420c", canal: 0 } },
    { id: 4, nombre: "Aire acondicionado", proveedor: "broadlink_ir", activo: true, soporta_feedback: false, proveedor_config: { equipo: "sala5" } },
  ])
  return d
}

describe("registrarEstados", () => {
  it("devuelve los Shelly que el puente tiene que leer", async () => {
    expect(await registrarEstados(db() as never, [], AHORA)).toEqual([{ id: 5, nombre: "Deshumidificador", device_id: "28372f26420c", canal: 0 }])
  })

  it("guarda el estado real con el consumo", async () => {
    const d = db()
    await registrarEstados(d as never, [{ dispositivo_id: 5, encendido: true, potencia_w: 561.44 }], AHORA)
    expect(d.tables["dispositivos_controlables"][0]).toMatchObject({
      soporta_feedback: true,
      ultimo_estado_confirmado_payload: { accion: "encender", potencia_w: 561.4 },
      ultimo_estado_confirmado_en: AHORA.toISOString(),
    })
    await registrarEstados(d as never, [{ dispositivo_id: 5, encendido: false, potencia_w: 0 }], AHORA)
    expect(d.tables["dispositivos_controlables"][0].ultimo_estado_confirmado_payload).toEqual({ accion: "apagar" })
  })

  it("no deja escribir el estado de equipos que no son Shelly del puente", async () => {
    const d = db()
    await registrarEstados(d as never, [{ dispositivo_id: 4, encendido: true }], AHORA)
    expect(d.tables["dispositivos_controlables"][1].ultimo_estado_confirmado_payload).toBeUndefined()
  })
})
