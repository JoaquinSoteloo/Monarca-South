import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { evaluateAutomations } from "@/lib/automations/engine"

// Dispara una corrida del motor de automatizaciones. Pensado para ser
// invocado por algo EXTERNO (un pinger tipo cron-job.org, o Vercel Cron si
// el proyecto pasa a plan Pro) a cualquier intervalo — el motor no asume una
// frecuencia fija (ver lib/automations/engine.ts). Protegido con
// AUTOMATIONS_CRON_SECRET: sin este endpoint bloqueado, cualquiera podría
// forzar comandos sobre el hardware controlado.
//
// Para el botón "Evaluar ahora" de la UI (debug/testing manual sin esperar
// al próximo tick) usar POST /api/automations/evaluate/manual, que NO
// requiere el secret porque nunca sale del propio servidor de la app.
export async function POST(request: Request) {
  const secret = process.env.AUTOMATIONS_CRON_SECRET
  if (!secret) {
    console.error("[automations/evaluate] AUTOMATIONS_CRON_SECRET no está configurada en el servidor")
    return NextResponse.json({ error: "No configurado" }, { status: 500 })
  }

  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const supabase = await createClient()
  try {
    const resumen = await evaluateAutomations(supabase)
    return NextResponse.json(resumen)
  } catch (error) {
    console.error("[automations/evaluate] Error evaluando automatizaciones:", error)
    return NextResponse.json({ error: "Error evaluando automatizaciones" }, { status: 500 })
  }
}
