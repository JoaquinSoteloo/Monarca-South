import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { evaluateAutomations } from "@/lib/automations/engine"
import { getServerSession } from "@/lib/auth/session"

// Variante del motor para el botón "Evaluar ahora" de la UI admin (debug /
// testing manual, sin esperar al próximo tick del pinger externo). No pide
// AUTOMATIONS_CRON_SECRET (ese secret es para el pinger externo, ver
// /api/automations/evaluate) pero SÍ requiere sesión: este endpoint puede
// terminar moviendo hardware real, así que un POST directo sin sesión válida
// no alcanza (antes solo lo gateaba AuthGuard del lado del cliente, que no
// protege una llamada directa a la API).
export async function POST() {
  const session = await getServerSession()
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const supabase = await createClient()
  try {
    const resumen = await evaluateAutomations(supabase)
    return NextResponse.json(resumen)
  } catch (error) {
    console.error("[automations/evaluate/manual] Error evaluando automatizaciones:", error)
    return NextResponse.json({ error: "Error evaluando automatizaciones" }, { status: 500 })
  }
}
