import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { evaluateAutomations } from "@/lib/automations/engine"
import { withEngineLock } from "@/lib/automations/lock"

// Dispara una corrida del motor de automatizaciones. Pensado para ser
// invocado por un pinger EXTERNO (ej. cron-job.org) cada 1 minuto — Vercel
// Cron no sirve acá: en el plan Hobby los cron jobs corren como máximo una
// vez por día, muy por debajo de lo que necesita el motor (ver
// lib/automations/engine.ts, que sí soporta cualquier frecuencia porque
// calcula todo contra timestamps reales, nunca contra un conteo de ticks).
// Protegido con AUTOMATIONS_CRON_SECRET: sin este endpoint bloqueado,
// cualquiera podría forzar comandos sobre el hardware controlado.
//
// Para el botón "Evaluar ahora" de la UI (debug/testing manual sin esperar
// al próximo tick) usar POST /api/automations/evaluate/manual, que se
// autentica con sesión en vez del secret.
//
// maxDuration: si Pulse está lento, una corrida puntual puede tardar más de
// los 10s por defecto de una función serverless. 30s da margen sin acercarse
// al techo del plan (Hobby permite configurar hasta 60s).
export const maxDuration = 30

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
    // withEngineLock evita que dos invocaciones se solapen (ej. una corrida
    // lenta todavía en curso cuando el pinger dispara la siguiente, cada
    // 1 minuto). Si no consigue el lock, no es un error: se omite esta
    // corrida y se responde 200 igual, para que el pinger no lo marque como
    // fallo — el cooldown/dedup de cada regla sigue intacto en la próxima
    // corrida que sí consiga el lock.
    const resultado = await withEngineLock(supabase, () => evaluateAutomations(supabase))
    if (!resultado.ejecuto) {
      return NextResponse.json({ skipped: true, motivo: "Ya había una evaluación en curso" })
    }
    return NextResponse.json({ skipped: false, ...resultado.resultado })
  } catch (error) {
    console.error("[automations/evaluate] Error evaluando automatizaciones:", error)
    return NextResponse.json({ error: "Error evaluando automatizaciones" }, { status: 500 })
  }
}
