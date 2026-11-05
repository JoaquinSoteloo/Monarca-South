import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { shellyCloudAdapter, urlSetSwitch } from "../shelly-cloud"

describe("shellyCloudAdapter", () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.stubEnv("SHELLY_CLOUD_SERVER", "https://shelly-123-eu.shelly.cloud/")
    vi.stubEnv("SHELLY_CLOUD_AUTH_KEY", "clave-de-prueba")
    vi.stubGlobal("fetch", fetchMock)
    fetchMock.mockReset()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it("arma la URL del endpoint v2 aunque el servidor venga sin https o con barra final", () => {
    expect(urlSetSwitch("shelly-123-eu.shelly.cloud/")).toBe("https://shelly-123-eu.shelly.cloud/v2/devices/api/set/switch")
  })

  it("encender manda on: true al device y canal configurados", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 200 }))
    const r = await shellyCloudAdapter.ejecutarComando({ accion: "encender" }, { device_id: "a0b1c2d3e4f5", canal: 0 })
    expect(r).toEqual({ estado: "ejecutado" })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("https://shelly-123-eu.shelly.cloud/v2/devices/api/set/switch?auth_key=clave-de-prueba")
    expect(JSON.parse(init.body)).toEqual({ id: "a0b1c2d3e4f5", channel: 0, on: true })
  })

  it("apagar manda on: false", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 200 }))
    await shellyCloudAdapter.ejecutarComando({ accion: "apagar" }, { device_id: "a0b1c2d3e4f5" })
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ id: "a0b1c2d3e4f5", channel: 0, on: false })
  })

  it("una respuesta de error de Shelly deja el comando fallido", async () => {
    fetchMock.mockResolvedValue(new Response("DEVICE_OFFLINE", { status: 400 }))
    const r = await shellyCloudAdapter.ejecutarComando({ accion: "encender" }, { device_id: "a0b1c2d3e4f5" })
    expect(r.estado).toBe("fallido")
    expect(r.error).toContain("400")
    expect(r.error).not.toContain("clave-de-prueba")
  })

  it("sin ID de dispositivo o sin credenciales no llama a Shelly", async () => {
    expect((await shellyCloudAdapter.ejecutarComando({ accion: "encender" }, {})).estado).toBe("fallido")
    vi.stubEnv("SHELLY_CLOUD_AUTH_KEY", "")
    expect((await shellyCloudAdapter.ejecutarComando({ accion: "encender" }, { device_id: "x" })).estado).toBe("fallido")
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("rechaza acciones que no son prender o apagar", async () => {
    const r = await shellyCloudAdapter.ejecutarComando({ accion: "setpoint" }, { device_id: "x" })
    expect(r.estado).toBe("fallido")
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
