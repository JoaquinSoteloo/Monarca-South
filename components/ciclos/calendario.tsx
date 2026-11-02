"use client"

import { diasEntreFechas, fechaCorta, fechasCiclo, sumarDias, type CicloSala } from "@/lib/ciclo"
import type { SalaCultivo } from "@/lib/types"

const COLORES = {
  vege: "bg-green-500",
  flora: "bg-purple-500",
  lavado: "bg-sky-500",
  secado: "bg-amber-500",
  limpieza: "bg-zinc-400",
}

interface Props {
  hoy: string
  salas: SalaCultivo[]
  ciclos: CicloSala[]
}

/** Vista de todas las salas en el tiempo: 30 días atrás y 120 adelante. */
export function Calendario({ hoy, salas, ciclos }: Props) {
  const desde = sumarDias(hoy, -30)
  const total = 150
  const pos = (f: string) => Math.max(0, Math.min(100, (diasEntreFechas(desde, f) / total) * 100))
  const abiertos = ciclos.filter((c) => c.estado === "abierto")
  const filas = salas.filter((s) => abiertos.some((c) => c.sala_id === s.id))

  // Marcas de mes
  const meses: { fecha: string; label: string }[] = []
  for (let i = 0; i <= total; i++) {
    const f = sumarDias(desde, i)
    if (f.endsWith("-01")) meses.push({ fecha: f, label: ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"][+f.slice(5, 7) - 1] })
  }

  // Cortes próximos y separación entre ellos (objetivo: cada ~20 días)
  const cortes = abiertos
    .map((c) => ({ c, f: fechasCiclo(c).cosecha }))
    .filter((x) => x.f >= hoy)
    .sort((a, b) => a.f.localeCompare(b.f))

  return (
    <div className="space-y-4">
      <div className="relative">
        <div className="relative ml-20 h-5 text-[11px] text-muted-foreground">
          {meses.map((m) => (
            <span key={m.fecha} className="absolute -translate-x-1/2" style={{ left: `${pos(m.fecha)}%` }}>
              {m.label}
            </span>
          ))}
        </div>
        {filas.map((s) => (
          <div key={s.id} className="flex items-center gap-2 py-1">
            <div className="w-18 shrink-0 text-sm font-medium">{s.nombre}</div>
            <div className="relative h-7 flex-1 rounded bg-muted">
              {abiertos
                .filter((c) => c.sala_id === s.id)
                .map((c) => {
                  const f = fechasCiclo(c)
                  const tramos: [string, string, keyof typeof COLORES][] = [
                    [f.inicio, f.flip, "vege"],
                    [f.flip, f.lavado, "flora"],
                    [f.lavado, f.cosecha, "lavado"],
                    [f.cosecha, f.finSecado, "secado"],
                    [f.finSecado, f.libre, "limpieza"],
                  ]
                  return tramos.map(([a, b, k]) => {
                    const l = pos(a)
                    const w = pos(b) - l
                    if (w <= 0) return null
                    return (
                      <div
                        key={`${c.id}-${k}`}
                        className={`absolute top-0 h-full ${COLORES[k]} ${k === "vege" ? "rounded-l" : ""} ${k === "limpieza" ? "rounded-r" : ""}`}
                        style={{ left: `${l}%`, width: `${w}%` }}
                        title={`${s.nombre} · ${k} ${fechaCorta(a)}–${fechaCorta(b)}`}
                      />
                    )
                  })
                })}
              {abiertos
                .filter((c) => c.sala_id === s.id)
                .map((c) => {
                  const f = fechasCiclo(c)
                  return (
                    <span
                      key={`l${c.id}`}
                      className="absolute top-1/2 -translate-y-1/2 text-[11px] font-medium text-white drop-shadow"
                      style={{ left: `calc(${pos(f.cosecha)}% - 2.2rem)` }}
                    >
                      {fechaCorta(f.cosecha)}
                    </span>
                  )
                })}
              <div className="absolute top-[-4px] h-[calc(100%+8px)] w-0.5 bg-red-600" style={{ left: `${pos(hoy)}%` }} title="Hoy" />
            </div>
          </div>
        ))}
        <div className="ml-20 mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
          {(
            [
              ["vege", "Vege 18/6"],
              ["flora", "Flora 12/12"],
              ["lavado", "Lavado"],
              ["secado", "Secado"],
              ["limpieza", "Limpieza"],
            ] as const
          ).map(([k, l]) => (
            <span key={k} className="flex items-center gap-1">
              <span className={`inline-block h-2.5 w-2.5 rounded-sm ${COLORES[k]}`} /> {l}
            </span>
          ))}
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-0.5 bg-red-600" /> Hoy
          </span>
        </div>
      </div>

      {cortes.length > 0 && (
        <div className="text-sm">
          <span className="font-medium">Próximos cortes: </span>
          {cortes.map((x, i) => {
            const sala = salas.find((s) => s.id === x.c.sala_id)?.nombre ?? `Sala ${x.c.sala_id}`
            const gap = i > 0 ? diasEntreFechas(cortes[i - 1].f, x.f) : null
            return (
              <span key={x.c.id}>
                {i > 0 && (
                  <span className={gap !== null && gap > 25 ? "text-red-600" : "text-muted-foreground"}> → {gap} días → </span>
                )}
                {sala} {fechaCorta(x.f)}
              </span>
            )
          })}
          <span className="ml-1 text-xs text-muted-foreground">(objetivo: un corte cada ~20 días; en rojo, huecos de más de 25)</span>
        </div>
      )}
    </div>
  )
}
