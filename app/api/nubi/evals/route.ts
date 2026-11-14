import { NextResponse } from "next/server"
import { getServerSession } from "@/lib/auth/session"
import { ROL_COMISION } from "@/lib/permisos"
import { createServiceClient } from "@/lib/supabase/service"
import { pensar, registrar } from "@/lib/nubi-pensar"
import { ESCENARIOS, cumple, describir } from "@/lib/nubi-evals"

// Corre los escenarios de lib/nubi-evals.ts contra la IA (los 10 a la vez) y
// devuelve el puntaje. No toca equipos ni manda avisos: solo mide. Cada
// respuesta queda en nubi_decisiones con fuente 'eval'. Solo la comisión.
export const maxDuration = 60

export async function POST() {
  const session = await getServerSession()
  if (!session) return NextResponse.json({ error: "Iniciá sesión en la app" }, { status: 401 })
  if (session.rol !== ROL_COMISION) return NextResponse.json({ error: "Solo la comisión puede correr los evals" }, { status: 403 })

  const supabase = createServiceClient()
  const resultados = await Promise.all(
    ESCENARIOS.map(async (e) => {
      const p = await pensar(e.entrada, "nubi_eval").catch(() => null)
      if (!p) return { nombre: e.nombre, ok: false, obtuvo: "la IA no respondió", analisis: null as string | null }
      await registrar(supabase, { salaId: null, fuente: "eval", pensamiento: p })
      return { nombre: e.nombre, ok: cumple(p.validacion, e.entrada.equipos, e.esperado), obtuvo: describir(p.validacion), analisis: p.decision.analisis }
    }),
  )
  const bien = resultados.filter((r) => r.ok).length
  return NextResponse.json({ ok: true, bien, total: resultados.length, resultados })
}
