import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

// @supabase/ssr no puede hablar con un proyecto real en el test, así que
// mockeamos createServerClient y controlamos auth.getUser() por caso.
// Guardamos el adaptador de cookies que le pasamos para poder simular, desde
// el propio getUser() (como hace @supabase/ssr de verdad al refrescar el
// token), una llamada a setAll() con cookies nuevas.
type CookieAdapter = {
  getAll: () => { name: string; value: string }[]
  setAll: (cookies: { name: string; value: string; options?: Record<string, unknown> }[]) => void
}

let capturedCookieAdapter: CookieAdapter | null = null
const getUserMock = vi.fn()

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn((_url: string, _key: string, options: { cookies: CookieAdapter }) => {
    capturedCookieAdapter = options.cookies
    return { auth: { getUser: getUserMock } }
  }),
}))

// vi.mock() se hoistea por encima de este import, así que updateSession ya
// recibe la versión mockeada de @supabase/ssr.
import { updateSession } from "@/lib/supabase/proxy"

function makeRequest(path: string) {
  return new NextRequest(new URL(path, "http://localhost"))
}

describe("updateSession (proxy)", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co"
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key"
    capturedCookieAdapter = null
    getUserMock.mockReset()
  })

  it("redirige a /login cuando no hay sesión en una página administrativa", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })

    const response = await updateSession(makeRequest("/ventas"))

    expect(response.status).toBe(307)
    expect(response.headers.get("location")).toBe("http://localhost/login")
  })

  it("responde 401 cuando no hay sesión en una API administrativa", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })

    const response = await updateSession(makeRequest("/api/devices"))

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: "No autorizado" })
  })

  it.each(["/login", "/reservar", "/api/auth/login", "/api/auth/logout", "/api/auth/session", "/api/automations/evaluate"])(
    "deja pasar la ruta pública %s sin sesión",
    async (path) => {
      getUserMock.mockResolvedValue({ data: { user: null } })

      const response = await updateSession(makeRequest(path))

      expect(response.status).toBe(200)
    },
  )

  it("deja pasar una página administrativa cuando hay sesión", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1", email: "admin@monarca.com" } } })

    const response = await updateSession(makeRequest("/ventas"))

    expect(response.status).toBe(200)
  })

  it("redirige de /login a / cuando ya hay sesión", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1", email: "admin@monarca.com" } } })

    const response = await updateSession(makeRequest("/login"))

    expect(response.status).toBe(307)
    expect(response.headers.get("location")).toBe("http://localhost/")
  })

  it("propaga a un redirect las cookies que Supabase escribió durante getUser()", async () => {
    getUserMock.mockImplementation(async () => {
      capturedCookieAdapter?.setAll([{ name: "sb-access-token", value: "refreshed", options: { path: "/" } }])
      return { data: { user: null } }
    })

    const response = await updateSession(makeRequest("/ventas"))

    expect(response.status).toBe(307)
    expect(response.cookies.get("sb-access-token")?.value).toBe("refreshed")
  })

  it("propaga a un 401 las cookies que Supabase escribió durante getUser()", async () => {
    getUserMock.mockImplementation(async () => {
      capturedCookieAdapter?.setAll([{ name: "sb-access-token", value: "refreshed", options: { path: "/" } }])
      return { data: { user: null } }
    })

    const response = await updateSession(makeRequest("/api/devices"))

    expect(response.status).toBe(401)
    expect(response.cookies.get("sb-access-token")?.value).toBe("refreshed")
  })
})
