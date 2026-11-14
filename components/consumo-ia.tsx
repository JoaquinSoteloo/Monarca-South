"use client"

import { useState } from "react"
import { ChevronDown, Gauge } from "lucide-react"

/** Una fila de la vista ia_uso_por_dia (script 103). */
export interface ConsumoDia {
  dia: string
  funcion: string
  llamadas: number
  fallidas: number
  tokens_entrada: number
  tokens_cache: number
  tokens_salida: number
}

const NOMBRE: Record<string, string> = {
  nubi: "Nubi",
  nubi_eval: "Evals de Nubi",
  resumen_semanal: "Resumen semanal",
  asistente: "Asistente",
  otra: "Otras",
}

const miles = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1).replace(".", ",")} M` : n >= 1000 ? `${Math.round(n / 1000)} mil` : String(n))
const fecha = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`

// Consumo de IA (14/11/2026): llamadas y tokens de los últimos 7 días, por
// función. Solo la comisión. No se muestra plata: el precio depende del modelo
// y se ve en la cuenta del proveedor.
export function ConsumoIA({ filas }: { filas: ConsumoDia[] }) {
  const [abierto, setAbierto] = useState(false)
  const porFuncion = new Map<string, { llamadas: number; fallidas: number; entrada: number; cache: number; salida: number }>()
  for (const f of filas) {
    const a = porFuncion.get(f.funcion) ?? { llamadas: 0, fallidas: 0, entrada: 0, cache: 0, salida: 0 }
    a.llamadas += Number(f.llamadas)
    a.fallidas += Number(f.fallidas)
    a.entrada += Number(f.tokens_entrada)
    a.cache += Number(f.tokens_cache)
    a.salida += Number(f.tokens_salida)
    porFuncion.set(f.funcion, a)
  }
  const total = [...porFuncion.values()].reduce((t, a) => t + a.entrada + a.salida, 0)
  const dias = [...new Set(filas.map((f) => f.dia))].sort().reverse()

  return (
    <section className="mb-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <button type="button" className="flex w-full items-center justify-between gap-2 text-left" onClick={() => setAbierto((a) => !a)} aria-expanded={abierto}>
        <span className="flex items-center gap-2 font-semibold text-slate-900">
          <Gauge className="h-5 w-5" /> Consumo de IA
          <span className="text-sm font-normal text-muted-foreground">· {miles(total)} tokens en 7 días</span>
        </span>
        <ChevronDown className={`h-4 w-4 text-slate-700 transition-transform ${abierto ? "rotate-180" : ""}`} />
      </button>

      {abierto && (
        <>
          <p className="mt-1 text-xs text-muted-foreground">
            Lo que salió del caché se cobra mucho menos: es la parte fija de las instrucciones, que se repite en cada consulta. La plata exacta se ve en la cuenta de OpenAI.
          </p>
          {filas.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">Todavía no hay consumo registrado.</p>
          ) : (
            <>
              <ul className="mt-3 space-y-2">
                {[...porFuncion.entries()]
                  .sort((a, b) => b[1].entrada + b[1].salida - (a[1].entrada + a[1].salida))
                  .map(([funcion, a]) => (
                    <li key={funcion} className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
                      <p className="font-medium">{NOMBRE[funcion] ?? funcion}</p>
                      <p className="text-muted-foreground">
                        <span className="font-semibold text-foreground">{a.llamadas}</span> consultas
                        {a.fallidas ? `, ${a.fallidas} sin respuesta` : ""} · <span className="font-semibold text-foreground">{miles(a.entrada)}</span> de entrada,{" "}
                        {a.entrada ? Math.round((a.cache / a.entrada) * 100) : 0} % del caché · <span className="font-semibold text-foreground">{miles(a.salida)}</span> de salida
                      </p>
                    </li>
                  ))}
              </ul>
              <ul className="mt-3 space-y-0.5 text-xs text-muted-foreground">
                {dias.map((d) => {
                  const delDia = filas.filter((f) => f.dia === d)
                  const llamadas = delDia.reduce((t, f) => t + Number(f.llamadas), 0)
                  const tokens = delDia.reduce((t, f) => t + Number(f.tokens_entrada) + Number(f.tokens_salida), 0)
                  return (
                    <li key={d}>
                      {fecha(d)} · {llamadas} consultas · {miles(tokens)} tokens
                    </li>
                  )
                })}
              </ul>
            </>
          )}
        </>
      )}
    </section>
  )
}
