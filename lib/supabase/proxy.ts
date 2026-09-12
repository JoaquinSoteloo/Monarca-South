import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

// Rutas de página que no requieren sesión de Supabase Auth.
const PUBLIC_PAGES = ["/login", "/reservar"]

// Rutas de API que no requieren sesión de Supabase Auth:
// - auth/login, auth/logout, auth/session: son el propio flujo de login.
// - automations/evaluate: el cron externo (cron-job.org), autenticado con
//   su propio AUTOMATIONS_CRON_SECRET vía header Authorization, no con
//   sesión de usuario. automations/evaluate/manual SÍ requiere sesión.
const PUBLIC_API_PATHS = ["/api/auth/login", "/api/auth/logout", "/api/auth/session", "/api/automations/evaluate"]

// setAll() puede haber agregado o eliminado cookies (refresh de sesión) en
// `response` durante supabase.auth.getUser(). Toda respuesta que devolvamos
// en su lugar (redirect, 401) tiene que llevarse esas mismas cookies, o el
// browser se queda con una sesión desincronizada de la que Supabase acaba
// de escribir.
function withPropagatedCookies(source: NextResponse, target: NextResponse) {
  source.cookies.getAll().forEach((cookie) => target.cookies.set(cookie))
  return target
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase URL and Anon Key are required. Please check your environment variables.")
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
      },
    },
  })

  // Nunca reemplazar por getSession(): getUser() valida el token contra el
  // servidor de Supabase en cada request, getSession() solo lo decodifica.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl
  const isPublicPage = PUBLIC_PAGES.includes(pathname)
  const isPublicApi = PUBLIC_API_PATHS.includes(pathname)

  if (!user && !isPublicPage && !isPublicApi) {
    if (pathname.startsWith("/api/")) {
      return withPropagatedCookies(response, NextResponse.json({ error: "No autorizado" }, { status: 401 }))
    }
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    return withPropagatedCookies(response, NextResponse.redirect(url))
  }

  if (user && pathname === "/login") {
    const url = request.nextUrl.clone()
    url.pathname = "/"
    return withPropagatedCookies(response, NextResponse.redirect(url))
  }

  return response
}
