import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getServerSession } from "@/lib/auth/session"
import { activarModoAusente } from "@/lib/modo-ausente/engine"

// Vuelve a correr el checklist server-side antes de activar: nunca confía
// en lo que ya vio el cliente, que pudo quedar desactualizado entre el
// "Verificar" y el "Activar". No manda push (eso es solo para anomalías
// detectadas DESPUÉS de activar, vía el evaluador periódico) — el resultado
// de esta activación vuelve únicamente en la respuesta HTTP.
export async function POST(request: Request) {
  const session = await getServerSession()
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const supabase = await createClient()
  const desde = request.headers.get("user-agent")
  const { activado, checklist } = await activarModoAusente(supabase, session.usuario, desde)

  if (!activado) {
    return NextResponse.json(checklist, { status: 409 })
  }

  return NextResponse.json({ activo: true, ...checklist })
}
