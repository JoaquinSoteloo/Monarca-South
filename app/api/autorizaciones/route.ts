import { NextResponse } from "next/server"
import { createClient as createSupabaseClient } from "@supabase/supabase-js"
import { getServerSession } from "@/lib/auth/session"

// Excepción autorizada en el mismo equipo donde se carga la entrega: alguien
// de la comisión escribe su email y contraseña. Se abre una sesión aparte,
// sólo para esta llamada (sin cookies: no reemplaza la sesión del operador),
// se crea la autorización COMO esa persona — la base verifica su rol con
// auth.uid() — y se cierra esa sesión enseguida.
export async function POST(request: Request) {
  const session = await getServerSession()
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const body = (await request.json().catch(() => null)) as {
    email?: string
    password?: string
    socio_id?: string
    motivo?: string
  } | null

  if (!body?.email || !body.password || !body.socio_id) {
    return NextResponse.json({ error: "Faltan datos para autorizar" }, { status: 400 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ error: "Configuración de Supabase incompleta" }, { status: 500 })
  }

  const supabase = createSupabaseClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { error: loginError } = await supabase.auth.signInWithPassword({
    email: body.email.trim(),
    password: body.password,
  })
  if (loginError) {
    return NextResponse.json({ error: "Email o contraseña incorrectos" }, { status: 401 })
  }

  try {
    const { data, error } = await supabase.rpc("crear_autorizacion_entrega", {
      p_socio_id: body.socio_id,
      p_motivo: body.motivo ?? "",
    })

    if (error) {
      const esPropio = /^VB00\d$/.test(error.code || "")
      if (!esPropio) console.error("Error al crear la autorización:", error)
      return NextResponse.json(
        { error: esPropio ? error.message : "No se pudo registrar la autorización" },
        { status: error.code === "VB004" ? 403 : 400 },
      )
    }

    return NextResponse.json({ id: data.id, autorizado_por_nombre: data.autorizado_por_nombre })
  } finally {
    // "local": revoca sólo esta sesión, no las que esa persona tenga abiertas
    // en sus propios dispositivos.
    await supabase.auth.signOut({ scope: "local" })
  }
}
