"use client"

import { useState } from "react"
import { CalendarCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { TextoAsistente } from "@/components/chat/texto-asistente"

export interface ResumenGuardado {
  semana_desde: string
  texto: string
  sugerencia: string
}

const fecha = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`

/** Resumen semanal de Nubi en Control manual (script 100): el último de los lunes y "Generar ahora" para la comisión. */
export function ResumenSemanal({ ultimo, puedeGenerar }: { ultimo: ResumenGuardado | null; puedeGenerar: boolean }) {
  const [abierto, setAbierto] = useState(false)
  const [generado, setGenerado] = useState<{ texto: string; sugerencia: string } | null>(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState("")

  if (!ultimo && !puedeGenerar) return null
  const mostrar = generado ?? ultimo

  async function generar() {
    setCargando(true)
    setError("")
    try {
      const r = await fetch("/api/nubi/resumen", { method: "POST" })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || "No se pudo armar el resumen")
      setGenerado(j)
      setAbierto(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo armar el resumen")
    } finally {
      setCargando(false)
    }
  }

  return (
    <section className="mb-6 rounded-xl border border-border bg-card p-4" aria-label="Resumen semanal de Nubi">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold">
          <CalendarCheck className="h-5 w-5 text-sky-700" />
          {generado ? "Resumen de los últimos 7 días" : ultimo ? `Resumen semanal de Nubi · semana del ${fecha(ultimo.semana_desde)}` : "Resumen semanal de Nubi"}
        </h2>
        <div className="flex gap-2">
          {mostrar && (
            <Button size="sm" variant="ghost" onClick={() => setAbierto((a) => !a)}>
              {abierto ? "Ocultar" : "Ver todo"}
            </Button>
          )}
          {puedeGenerar && (
            <Button size="sm" variant="outline" onClick={generar} disabled={cargando}>
              {cargando ? "Armando…" : "Generar ahora"}
            </Button>
          )}
        </div>
      </div>
      {!mostrar && <p className="mt-2 text-sm text-muted-foreground">Llega los lunes a las 9. Tocá «Generar ahora» para ver el de los últimos 7 días.</p>}
      {mostrar && (
        <p className="mt-2 rounded-lg bg-sky-50 p-2 text-sm text-sky-950">
          <strong>Prioridad de la semana:</strong> {mostrar.sugerencia}
        </p>
      )}
      {mostrar && abierto && (
        <div className="mt-3">
          <TextoAsistente texto={mostrar.texto} />
        </div>
      )}
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </section>
  )
}
