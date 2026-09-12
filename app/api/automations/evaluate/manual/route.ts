import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { evaluateAutomations } from "@/lib/automations/engine"
import { getServerSession } from "@/lib/auth/session"
import { withEngineLock } from "@/lib/automations/lock"
import { checkModoAusente } from "@/lib/modo-ausente/engine"

// Variante del motor para el botón "Evaluar ahora" de la UI admin (debug /
// testing manual, sin esperar al próximo tick del pinger externo). No pide
// AUTOMATIONS_CRON_SECRET (ese secret es para el pinger externo, ver
// /api/automations/evaluate) pero SÍ requiere sesión: este endpoint puede
// terminar moviendo hardware real, así que un POST directo sin sesión válida
// no alcanza (antes solo lo gateaba AuthGuard del lado del cliente, que no
// protege una llamada directa a la API).
//
// Comparte el mismo lock que /api/automations/evaluate (lib/automations/lock.ts):
// alguien puede apretar "Evaluar ahora" justo cuando el pinger externo (cada
// 1 minuto) está corriendo una evaluación — sin el lock compartido, ambas
// corridas se solaparían.
export const maxDuration = 30

export async function POST() {
  const session = await getServerSession()
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const supabase = await createClient()
  try {
    const resultado = await withEngineLock(supabase, async () => {
      const evaluacion = await evaluateAutomations(supabase)
      const modoAusente = await checkModoAusente(supabase)
      return { evaluacion, modoAusente }
    })
    if (!resultado.ejecuto) {
      return NextResponse.json({ skipped: true, motivo: "Ya había una evaluación en curso" })
    }
    return NextResponse.json({ skipped: false, ...resultado.resultado.evaluacion, modoAusente: resultado.resultado.modoAusente })
  } catch (error) {
    console.error("[automations/evaluate/manual] Error evaluando automatizaciones:", error)
    return NextResponse.json({ error: "Error evaluando automatizaciones" }, { status: 500 })
  }
}
