"use client"

import { useState } from "react"
import { Brain, ChevronDown, ClipboardCheck } from "lucide-react"
import { Button } from "@/components/ui/button"

/** Una fila de nubi_decisiones (script 102), con el nombre de la sala resuelto. */
export interface PensamientoNubi {
  id: number
  creada_en: string
  sala: string | null
  fuente: "ia" | "reglas" | "prueba" | "eval"
  decision: string | null
  analisis: string | null
  valida: boolean | null
  motivo_rechazo: string | null
  titulo: string | null
}

interface ResultadoEval {
  nombre: string
  ok: boolean
  obtuvo: string
  analisis: string | null
}

const hora = (iso: string) =>
  new Date(iso).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })

function queHizo(p: PensamientoNubi): string {
  if (p.fuente === "reglas") return "La IA no respondió: usó las reglas"
  if (p.valida === false) return `Quiso ${p.titulo ?? "proponer algo"}, pero lo frenaron los controles: ${p.motivo_rechazo}`
  if (p.decision === "nada") return "No hace falta tocar nada"
  return p.decision === "avisar" ? `Avisó: ${p.titulo}` : `Propuso ${p.titulo}`
}

// Observabilidad de Nubi (14/11/2026): qué vio y pensó en las últimas
// decisiones, y para la comisión, el botón de los evals.
export function NubiPensamientos({ pensamientos, puedeEvaluar }: { pensamientos: PensamientoNubi[]; puedeEvaluar: boolean }) {
  const [abierto, setAbierto] = useState(false)
  const [corriendo, setCorriendo] = useState(false)
  const [evals, setEvals] = useState<{ bien: number; total: number; resultados: ResultadoEval[] } | { error: string } | null>(null)

  if (pensamientos.length === 0 && !puedeEvaluar) return null

  async function correrEvals() {
    setCorriendo(true)
    setEvals(null)
    try {
      const r = await fetch("/api/nubi/evals", { method: "POST" })
      const j = await r.json().catch(() => ({}))
      setEvals(r.ok ? j : { error: j.error || "No se pudieron correr los evals." })
    } catch {
      setEvals({ error: "No se pudieron correr los evals. Revisá la conexión." })
    } finally {
      setCorriendo(false)
    }
  }

  return (
    <section className="mb-6 rounded-xl border border-violet-200 bg-violet-50/60 p-4">
      <button type="button" className="flex w-full items-center justify-between gap-2 text-left" onClick={() => setAbierto((a) => !a)} aria-expanded={abierto}>
        <span className="flex items-center gap-2 font-semibold text-violet-950">
          <Brain className="h-5 w-5" /> Qué está pensando Nubi
        </span>
        <ChevronDown className={`h-4 w-4 text-violet-900 transition-transform ${abierto ? "rotate-180" : ""}`} />
      </button>

      {abierto && (
        <>
          <p className="mt-1 text-xs text-violet-950/80">
            Nubi mira cada sala cada 10 minutos. Si está tranquila, en rango y estable, no gasta consultando a la IA; la consulta cuando algo se acerca al borde, se mueve o se abre una alerta, y una vez por hora como control. Antes de llegarte, lo que decide pasa por controles fijos.
          </p>
          {pensamientos.length === 0 && <p className="mt-3 text-sm text-muted-foreground">Todavía no pensó nada.</p>}
          <ul className="mt-3 space-y-2">
            {pensamientos.map((p) => (
              <li key={p.id} className="rounded-lg border border-violet-100 bg-white p-3 text-sm">
                <p className="text-xs text-muted-foreground">
                  {hora(p.creada_en)} · {p.sala ?? "Escenario de prueba"}
                  {p.fuente === "prueba" ? " · Probar Nubi" : ""}
                </p>
                <p className="mt-0.5 font-medium text-foreground">{queHizo(p)}</p>
                {p.analisis && <p className="mt-1 text-muted-foreground">{p.analisis}</p>}
              </li>
            ))}
          </ul>

          {puedeEvaluar && (
            <div className="mt-3 rounded-lg border border-dashed border-violet-300 p-3">
              <p className="text-xs text-violet-950/80">
                <ClipboardCheck className="mr-1 inline h-3.5 w-3.5" />
                Evals: 10 situaciones armadas con la respuesta correcta. Sirven para ver si Nubi sigue decidiendo bien después de cambiarle algo. No tocan equipos ni mandan avisos.
              </p>
              <Button size="sm" variant="outline" className="mt-2" disabled={corriendo} onClick={correrEvals}>
                {corriendo ? "Corriendo… tarda unos segundos" : "Correr evals"}
              </Button>
              {evals && "error" in evals && <p className="mt-2 text-sm text-red-800">{evals.error}</p>}
              {evals && "resultados" in evals && (
                <div className="mt-2 text-sm">
                  <p className="font-semibold">
                    {evals.bien} de {evals.total} bien
                  </p>
                  <ul className="mt-1 space-y-1">
                    {evals.resultados.map((r) => (
                      <li key={r.nombre} className={r.ok ? "text-emerald-800" : "text-red-800"}>
                        {r.ok ? "✓" : "✗"} {r.nombre}
                        {!r.ok && <span className="block pl-4 text-xs text-muted-foreground">Respondió: {r.obtuvo}. {r.analisis}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </section>
  )
}
