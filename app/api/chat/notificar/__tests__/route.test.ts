// /api/chat/notificar lo llama la base (pg_net, script 090) sin sesión: el
// secreto AUTOMATIONS_CRON_SECRET es su única autorización. Con el secreto,
// lee el mensaje de la base y le manda el push a quien corresponde.
import { beforeEach, describe, expect, it, vi } from "vitest"
import { createFakeSupabase, type FakeSupabase } from "@/lib/automations/__tests__/fake-supabase"

const { createServiceClientMock, sendPushToUsersMock } = vi.hoisted(() => ({
  createServiceClientMock: vi.fn(),
  sendPushToUsersMock: vi.fn(),
}))
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: createServiceClientMock }))
vi.mock("@/lib/push/send", () => ({ sendPushToUsers: sendPushToUsersMock }))

import { POST } from "../route"

const perfil = (id: string, nombre: string, extra: Record<string, unknown> = {}) => ({
  id, nombre, rol: "cultivo", ve_todas_las_tareas: false, supervisor_id: null, activo: true, ...extra,
})

function makeRequest(body: unknown, authorization = "Bearer el-secret-correcto") {
  return new Request("http://localhost/api/chat/notificar", {
    method: "POST",
    headers: { authorization, "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("POST /api/chat/notificar", () => {
  let db: FakeSupabase

  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, "log").mockImplementation(() => {})
    vi.spyOn(console, "error").mockImplementation(() => {})
    process.env.AUTOMATIONS_CRON_SECRET = "el-secret-correcto"
    db = createFakeSupabase()
    db.seed("equipo_perfiles", [
      perfil("f", "Facundo", { rol: "direccion", ve_todas_las_tareas: true }),
      perfil("l", "Lucho", { ve_todas_las_tareas: true }),
      perfil("v", "Vilela", { rol: "mantenimiento", supervisor_id: "l" }),
      perfil("p", "Pato", { rol: "ayudante", supervisor_id: "l" }),
    ])
    db.seed("tareas", [{ id: 9, titulo: "Recorrer las salas", responsable_id: "v", afecta_a: [] }])
    db.seed("mensajes", [
      { id: 1, autor_id: "l", para_id: "v", tarea_id: null, cuerpo: "¿Pasás por la sala 2?", created_at: "2026-11-03T14:00:00Z" },
      { id: 2, autor_id: "v", para_id: null, tarea_id: 9, cuerpo: "Mosquitas en la sala 2", created_at: "2026-11-03T14:05:00Z" },
    ])
    createServiceClientMock.mockReturnValue(db)
    sendPushToUsersMock.mockResolvedValue({ sent: 1, removed: 0, failed: 0 })
  })

  it("responde 500 y no lee nada si AUTOMATIONS_CRON_SECRET no está configurada", async () => {
    delete process.env.AUTOMATIONS_CRON_SECRET

    const response = await POST(makeRequest({ mensaje_id: 1 }))

    expect(response.status).toBe(500)
    expect(createServiceClientMock).not.toHaveBeenCalled()
  })

  it("responde 401 y no manda nada con otro secreto o sin Bearer", async () => {
    for (const authorization of ["Bearer otro-secret", "el-secret-correcto"]) {
      const response = await POST(makeRequest({ mensaje_id: 1 }, authorization))
      expect(response.status).toBe(401)
    }
    expect(createServiceClientMock).not.toHaveBeenCalled()
    expect(sendPushToUsersMock).not.toHaveBeenCalled()
  })

  it("responde 400 sin un mensaje_id válido", async () => {
    for (const body of [{}, { mensaje_id: "abc" }, { mensaje_id: -3 }]) {
      const response = await POST(makeRequest(body))
      expect(response.status).toBe(400)
    }
    expect(sendPushToUsersMock).not.toHaveBeenCalled()
  })

  it("responde 404 si el mensaje no existe", async () => {
    const response = await POST(makeRequest({ mensaje_id: 99 }))

    expect(response.status).toBe(404)
    expect(sendPushToUsersMock).not.toHaveBeenCalled()
  })

  it("un privado: push solo a quien va, y responde cuántos salieron", async () => {
    const response = await POST(makeRequest({ mensaje_id: 1 }))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ mensaje: 1, destinatarios: 1, sent: 1, removed: 0, failed: 0 })
    expect(sendPushToUsersMock).toHaveBeenCalledWith(["v"], {
      title: "Lucho te escribió",
      body: "¿Pasás por la sala 2?",
      url: "/chat?c=p:l",
      tag: "chat-p:l",
    })
  })

  it("un comentario: lee la tarea para saber a quién avisar", async () => {
    const response = await POST(makeRequest({ mensaje_id: 2 }))

    expect(response.status).toBe(200)
    const [destinatarios, payload] = sendPushToUsersMock.mock.calls[0]
    expect([...destinatarios].sort()).toEqual(["f", "l"])
    expect(payload).toMatchObject({ title: "Comentario en Recorrer las salas", body: "Vilela: Mosquitas en la sala 2", url: "/chat?c=t:9" })
  })

  it("responde 500 si falla el envío", async () => {
    sendPushToUsersMock.mockRejectedValue(new Error("Faltan las variables de entorno VAPID"))

    const response = await POST(makeRequest({ mensaje_id: 1 }))

    expect(response.status).toBe(500)
  })
})
