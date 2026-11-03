// sendPushToUsers (Chat, script 090) manda solo a los aparatos de esas
// personas; sendPushNotification (Modo Ausente) sigue mandando a todos.
// web-push y la tabla push_subscriptions van mockeados.
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { PushSubscriptionRow } from "@/lib/push/subscriptions"

const { sendNotification, listActiveSubscriptions, listActiveSubscriptionsOf, disableSubscription } = vi.hoisted(() => ({
  sendNotification: vi.fn(),
  listActiveSubscriptions: vi.fn(),
  listActiveSubscriptionsOf: vi.fn(),
  disableSubscription: vi.fn(),
}))
vi.mock("@/lib/push/config", () => ({ getWebPush: () => ({ sendNotification }) }))
vi.mock("@/lib/push/subscriptions", () => ({ listActiveSubscriptions, listActiveSubscriptionsOf, disableSubscription }))

import { sendPushNotification, sendPushToUsers } from "../send"

const aparato = (id: number, user_id: string | null): PushSubscriptionRow => ({
  id,
  usuario: "admin",
  user_id,
  endpoint: `https://push.example/${id}`,
  p256dh: "clave",
  auth: "auth",
  user_agent: null,
  device_label: null,
  enabled: true,
  created_at: "2026-11-03T12:00:00Z",
  last_seen_at: "2026-11-03T12:00:00Z",
})
const payload = { title: "Lucho te escribió", body: "Hola", url: "/chat?c=p:l", tag: "chat-p:l" }

beforeEach(() => {
  vi.clearAllMocks()
  sendNotification.mockResolvedValue({})
  vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("sendPushToUsers", () => {
  it("sin personas no busca aparatos ni manda nada", async () => {
    await expect(sendPushToUsers([], payload)).resolves.toEqual({ sent: 0, removed: 0, failed: 0 })
    expect(listActiveSubscriptionsOf).not.toHaveBeenCalled()
    expect(sendNotification).not.toHaveBeenCalled()
  })

  it("manda a los aparatos de esas personas, sin repetirlas", async () => {
    listActiveSubscriptionsOf.mockResolvedValue([aparato(1, "v"), aparato(2, "v")])

    await expect(sendPushToUsers(["v", "v"], payload)).resolves.toEqual({ sent: 2, removed: 0, failed: 0 })
    expect(listActiveSubscriptionsOf).toHaveBeenCalledWith(["v"])
    expect(listActiveSubscriptions).not.toHaveBeenCalled()
    expect(JSON.parse(sendNotification.mock.calls[0][1])).toEqual(payload)
  })

  it("da de baja el aparato vencido (410) y cuenta los errores", async () => {
    listActiveSubscriptionsOf.mockResolvedValue([aparato(1, "v"), aparato(2, "v"), aparato(3, "v")])
    sendNotification
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce({ statusCode: 410 })
      .mockRejectedValueOnce(new Error("push service caído"))

    await expect(sendPushToUsers(["v"], payload)).resolves.toEqual({ sent: 1, removed: 1, failed: 1 })
    expect(disableSubscription).toHaveBeenCalledWith("https://push.example/2")
  })
})

describe("sendPushNotification", () => {
  it("sigue mandando a todos los aparatos, tengan dueño o no", async () => {
    listActiveSubscriptions.mockResolvedValue([aparato(1, null), aparato(2, "v")])

    await expect(sendPushNotification(payload)).resolves.toEqual({ sent: 2, removed: 0, failed: 0 })
    expect(listActiveSubscriptionsOf).not.toHaveBeenCalled()
  })
})
