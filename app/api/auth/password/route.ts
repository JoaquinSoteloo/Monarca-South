import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { errorDeContrasena, validarNuevaContrasena } from "@/lib/auth/contrasena"

// Cada uno cambia su propia contraseña (pantalla Mi cuenta). Pide la actual
// para que nadie la cambie desde un celular que quedó con la sesión abierta.
export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: "Iniciá sesión de nuevo." }, { status: 401 })

  const body = (await request.json().catch(() => null)) as { actual?: unknown; nueva?: unknown } | null
  const actual = typeof body?.actual === "string" ? body.actual : ""
  const nueva = typeof body?.nueva === "string" ? body.nueva : ""
  const problema = validarNuevaContrasena(actual, nueva)
  if (problema) return NextResponse.json({ error: problema }, { status: 400 })

  const { error: errorActual } = await supabase.auth.signInWithPassword({ email: user.email, password: actual })
  if (errorActual) return NextResponse.json({ error: "La contraseña actual no es correcta." }, { status: 400 })

  const { error } = await supabase.auth.updateUser({ password: nueva })
  if (error) return NextResponse.json({ error: errorDeContrasena(error.message) }, { status: 400 })
  return NextResponse.json({ ok: true })
}
