// Valida que /api/automations/evaluate siga exigiendo AUTOMATIONS_CRON_SECRET
// (el pinger externo no tiene sesión de Supabase, así que este secret es la
// ÚNICA autorización de este endpoint) y que, con el secret correcto, use el
// cliente service_role en vez del cliente anon/cookies — necesario para que
// el cron siga funcionando una vez que las tablas de automatizaciones/
// hardware queden con RLS restringida a `authenticated`.
import { beforeEach, describe, expect, it, vi } from "vitest"

// vi.mock() se hoistea por encima de TODO el archivo, incluidos los imports
// (que a su vez se hoistean por delante de cualquier `const` normal) — así
// que las funciones mock hay que crearlas con vi.hoisted() para que ya
// existan cuando las factory de vi.mock() se evalúen.
const { createServiceClientMock, evaluateAutomationsMock, checkModoAusenteMock, withEngineLockMock } = vi.hoisted(
  () => ({
    createServiceClientMock: vi.fn(),
    evaluateAutomationsMock: vi.fn(),
    checkModoAusenteMock: vi.fn(),
    withEngineLockMock: vi.fn(),
  }),
)

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: createServiceClientMock,
}))
vi.mock("@/lib/automations/engine", () => ({
  evaluateAutomations: evaluateAutomationsMock,
}))
vi.mock("@/lib/modo-ausente/engine", () => ({
  checkModoAusente: checkModoAusenteMock,
}))
vi.mock("@/lib/automations/lock", () => ({
  withEngineLock: withEngineLockMock,
}))

import { POST } from "../route"

const FAKE_SERVICE_CLIENT = { __marca: "service-client" }

function makeRequest(headers?: Record<string, string>) {
  return new Request("http://localhost/api/automations/evaluate", {
    method: "POST",
    headers,
  })
}

describe("POST /api/automations/evaluate", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    createServiceClientMock.mockReturnValue(FAKE_SERVICE_CLIENT)
    withEngineLockMock.mockImplementation(async (_supabase: unknown, fn: () => Promise<unknown>) => ({
      ejecuto: true,
      resultado: await fn(),
    }))
    evaluateAutomationsMock.mockResolvedValue({ evaluadas: 0 })
    checkModoAusenteMock.mockResolvedValue({ activo: false })
    delete process.env.AUTOMATIONS_CRON_SECRET
  })

  it("responde 500 y no llama al motor si AUTOMATIONS_CRON_SECRET no está configurada", async () => {
    const response = await POST(makeRequest({ authorization: "Bearer lo-que-sea" }))

    expect(response.status).toBe(500)
    expect(createServiceClientMock).not.toHaveBeenCalled()
    expect(withEngineLockMock).not.toHaveBeenCalled()
  })

  it("responde 401 y no llama al motor si falta el header Authorization", async () => {
    process.env.AUTOMATIONS_CRON_SECRET = "el-secret-correcto"

    const response = await POST(makeRequest())

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: "No autorizado" })
    expect(createServiceClientMock).not.toHaveBeenCalled()
    expect(withEngineLockMock).not.toHaveBeenCalled()
  })

  it("responde 401 y no llama al motor si el secret del header no coincide", async () => {
    process.env.AUTOMATIONS_CRON_SECRET = "el-secret-correcto"

    const response = await POST(makeRequest({ authorization: "Bearer secret-incorrecto" }))

    expect(response.status).toBe(401)
    expect(createServiceClientMock).not.toHaveBeenCalled()
    expect(withEngineLockMock).not.toHaveBeenCalled()
  })

  it("rechaza un header sin el prefijo Bearer aunque el valor sea correcto", async () => {
    process.env.AUTOMATIONS_CRON_SECRET = "el-secret-correcto"

    const response = await POST(makeRequest({ authorization: "el-secret-correcto" }))

    expect(response.status).toBe(401)
  })

  it("con el secret correcto, evalúa usando el cliente service_role (no anon/cookies)", async () => {
    process.env.AUTOMATIONS_CRON_SECRET = "el-secret-correcto"

    const response = await POST(makeRequest({ authorization: "Bearer el-secret-correcto" }))

    expect(response.status).toBe(200)
    expect(createServiceClientMock).toHaveBeenCalledTimes(1)
    // El mismo cliente que devuelve createServiceClient() es el que se le
    // pasa al lock y al motor — nunca uno creado por otro lado.
    expect(withEngineLockMock).toHaveBeenCalledWith(FAKE_SERVICE_CLIENT, expect.any(Function))
    expect(evaluateAutomationsMock).toHaveBeenCalledWith(FAKE_SERVICE_CLIENT)
    expect(checkModoAusenteMock).toHaveBeenCalledWith(FAKE_SERVICE_CLIENT)

    const body = await response.json()
    expect(body).toEqual({ skipped: false, evaluadas: 0, modoAusente: { activo: false } })
  })

  it("si el lock ya está tomado, responde 200 con skipped:true y no evalúa nada", async () => {
    process.env.AUTOMATIONS_CRON_SECRET = "el-secret-correcto"
    withEngineLockMock.mockResolvedValue({ ejecuto: false })

    const response = await POST(makeRequest({ authorization: "Bearer el-secret-correcto" }))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ skipped: true, motivo: "Ya había una evaluación en curso" })
    expect(evaluateAutomationsMock).not.toHaveBeenCalled()
  })

  it("responde 500 si el motor tira una excepción dentro del lock", async () => {
    process.env.AUTOMATIONS_CRON_SECRET = "el-secret-correcto"
    evaluateAutomationsMock.mockRejectedValue(new Error("boom"))

    const response = await POST(makeRequest({ authorization: "Bearer el-secret-correcto" }))

    expect(response.status).toBe(500)
  })
})
