import { NextResponse } from "next/server"
import { getServerSession } from "@/lib/auth/session"
import { ROL_COMISION } from "@/lib/permisos"
import { createServiceClient } from "@/lib/supabase/service"
import { armarResumen } from "@/lib/resumen-semanal"

// "Generar ahora" del resumen semanal de Nubi (solo la comisión): arma el de los
// últimos 7 días para verlo en pantalla. No lo guarda ni manda push: el oficial
// lo arma el motor los lunes (lib/resumen-semanal-aviso.ts).
export const maxDuration = 60

export async function POST() {
  const session = await getServerSession()
  if (!session) return NextResponse.json({ error: "Iniciá sesión en la app" }, { status: 401 })
  if (session.rol !== ROL_COMISION) return NextResponse.json({ error: "Solo la comisión puede generarlo" }, { status: 403 })
  const hasta = new Date()
  const desde = new Date(hasta.getTime() - 7 * 86400_000)
  try {
    const r = await armarResumen(createServiceClient(), desde, hasta)
    return NextResponse.json({ texto: r.texto, sugerencia: r.sugerencia, conIA: r.conIA })
  } catch (err) {
    console.error("[nubi/resumen] No se pudo armar:", err)
    return NextResponse.json({ error: "No se pudo armar el resumen" }, { status: 500 })
  }
}
