import { NextResponse } from "next/server"
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

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        usuario: user.usuario,
        nombre: user.nombre,
      },
    })
  } catch (error) {
    console.error("[v0] Login error:", error)
    return NextResponse.json({ error: "Error al iniciar sesión" }, { status: 500 })
  }
}
