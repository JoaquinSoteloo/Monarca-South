import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getServerSession } from "@/lib/auth/session"
import { getModoAusenteEstado, loadChecklist } from "@/lib/modo-ausente/engine"

// Recalcula el checklist EN VIVO en cada request (no cachea) — es lo que
// consulta el botón "Verificar Monarca" antes de activar. Nunca manda push:
// el resultado viaja solo como respuesta HTTP a quien lo pidió.
export async function GET() {
  const session = await getServerSession()
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const supabase = await createClient()
  const [estado, checklist] = await Promise.all([getModoAusenteEstado(supabase), loadChecklist(supabase)])

  return NextResponse.json({ ...estado, ...checklist })
}
