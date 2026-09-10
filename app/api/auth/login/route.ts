import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createClient } from "@/lib/supabase/server"

export async function POST(request: Request) {
  try {
    const { usuario, password } = await request.json()

    console.log("[v0] Login attempt for user:", usuario)

    if (!usuario || !password) {
      return NextResponse.json({ error: "Usuario y contraseña son requeridos" }, { status: 400 })
    }

    const supabase = await createClient()

    // Buscar usuario en la base de datos
    const { data: users, error } = await supabase.from("usuarios_admin").select("*").eq("usuario", usuario).limit(1)

    console.log("[v0] Query result:", { found: users?.length, error })

    if (error || !users || users.length === 0) {
      return NextResponse.json({ error: "Usuario o contraseña incorrectos" }, { status: 401 })
    }

    const user = users[0]

    // Verificar contraseña (sin bcrypt por ahora)
    if (password !== "Sede6065" || usuario !== "admin") {
      return NextResponse.json({ error: "Usuario o contraseña incorrectos" }, { status: 401 })
    }

    console.log("[v0] Login successful for:", user.usuario)

    const sessionUser = {
      id: user.id,
      usuario: user.usuario,
      nombre: user.nombre,
    }

    // Cookie httpOnly server-side — GET /api/auth/session, POST
    // /api/auth/logout y los endpoints que pueden mover hardware real
    // (lib/auth/session.ts) dependen de que esta cookie exista.
    // sessionStorage (AuthGuard) sigue gateando la navegación del lado del
    // cliente, pero eso solo, nunca protegió una llamada directa a la API.
    // Sin maxAge a propósito: cookie de sesión de navegador, para que dure
    // lo mismo que sessionStorage (hasta cerrar la pestaña/navegador).
    const cookieStore = await cookies()
    cookieStore.set("auth-session", JSON.stringify(sessionUser), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    })

    return NextResponse.json({
      success: true,
      user: sessionUser,
    })
  } catch (error) {
    console.error("[v0] Login error:", error)
    return NextResponse.json({ error: "Error al iniciar sesión" }, { status: 500 })
  }
}
