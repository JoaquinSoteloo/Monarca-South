import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getServerSession } from "@/lib/auth/session"
import { desactivarModoAusente } from "@/lib/modo-ausente/engine"

export async function POST() {
  const session = await getServerSession()
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const supabase = await createClient()
  await desactivarModoAusente(supabase, session.usuario)

  return NextResponse.json({ activo: false })
}
