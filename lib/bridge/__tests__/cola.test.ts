import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createFakeSupabase, type FakeSupabase } from "@/lib/automations/__tests__/fake-supabase"
import { autorizado, resolverComando, tomarComandos } from "../cola"

const AHORA = new Date("2026-11-05T22:00:00.000Z")
const hace = (s: number) => new Date(AHORA.getTime() - s * 1000).toISOString()

describe("cola del puente BroadLink", () => {
  let db: FakeSupabase

  beforeEach(() => {
    db = createFakeSupabase()
    db.seed("dispositivos_controlables", [
      { id: 1, nombre: "Aire Sala 5", tipo: "aire_acondicionado", proveedor: "broadlink_ir", modo_ejecucion: "bridge_polling", proveedor_config: { equipo: "sala5" }, activo: true },
      { id: 2, nombre: "Deshu Sala 5", tipo: "deshumidificador", proveedor: "shelly_cloud", modo_ejecucion: "servidor_directo", proveedor_config: {}, activo: true },
    ])
  })

  afterEach(() => {
    delete process.env.BRIDGE_TOKEN
  })

  it("entrega el último pendiente de cada equipo y cancela los anteriores", async () => {
    db.seed("comandos_dispositivo", [
      { id: 10, dispositivo_id: 1, estado: "pendiente", payload: { accion: "encender", modo: "frio", setpoint: 23 }, creado_en: hace(40), intentos: 0 },
      { id: 11, dispositivo_id: 1, estado: "pendiente", payload: { accion: "apagar" }, creado_en: hace(10), intentos: 0 },
      { id: 12, dispositivo_id: 2, estado: "pendiente", payload: { accion: "encender" }, creado_en: hace(10), intentos: 0 },
    ])
    const tomados = await tomarComandos(db as any, "notebook", AHORA)
    expect(tomados.map((c) => c.id)).toEqual([11])
    expect(tomados[0].dispositivo.proveedor_config).toEqual({ equipo: "sala5" })
    const fila = (id: number) => db.tables.comandos_dispositivo.find((c) => c.id === id)!
    expect(fila(10).estado).toBe("cancelado")
    expect(fila(11).estado).toBe("en_proceso")
    expect(fila(11).bridge_id).toBe("notebook")
    expect(fila(12).estado).toBe("pendiente") // no es del puente
  })

  it("los comandos viejos vencen en vez de ejecutarse tarde", async () => {
    db.seed("comandos_dispositivo", [
      { id: 20, dispositivo_id: 1, estado: "pendiente", payload: { accion: "encender" }, creado_en: hace(600), intentos: 0 },
    ])
    expect(await tomarComandos(db as any, "notebook", AHORA)).toEqual([])
    expect(db.tables.comandos_dispositivo[0].estado).toBe("timeout")
    expect(db.tables.dispositivos_controlables[0].ultimo_comando_estado).toBe("timeout")
  })

  it("resolver deja el resultado en el comando y en el equipo", async () => {
    db.seed("comandos_dispositivo", [
      { id: 30, dispositivo_id: 1, estado: "en_proceso", payload: { accion: "apagar" }, creado_en: hace(5), enviado_en: hace(4), intentos: 1 },
    ])
    expect(await resolverComando(db as any, 30, { estado: "fallido", error: "Falta aprender el código apagar" }, AHORA)).toBe(true)
    const c = db.tables.comandos_dispositivo[0]
    expect(c.estado).toBe("fallido")
    expect(c.ejecutado_por).toBe("bridge")
    expect(c.error).toContain("apagar")
    expect(db.tables.dispositivos_controlables[0].ultimo_comando_estado).toBe("fallido")
    // Un segundo resultado para el mismo comando no cambia nada.
    expect(await resolverComando(db as any, 30, { estado: "ejecutado" }, AHORA)).toBe(false)
  })

  it("solo autoriza con BRIDGE_TOKEN configurado y correcto", () => {
    const req = (h?: string) => new Request("http://x/api/bridge/commands", { headers: h ? { authorization: h } : {} })
    expect(autorizado(req("Bearer cualquiera"))).toBe(false)
    process.env.BRIDGE_TOKEN = "token-largo-de-prueba-123"
    expect(autorizado(req("Bearer token-largo-de-prueba-123"))).toBe(true)
    expect(autorizado(req("Bearer otro"))).toBe(false)
    expect(autorizado(req())).toBe(false)
  })
})
