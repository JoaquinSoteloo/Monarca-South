"use client"

import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { ChevronDown, Droplet, Thermometer } from "lucide-react"
import { cn } from "@/lib/utils"
import { horaCorta } from "@/lib/equipo"
import { cajaEnPlano, LIMITES_PLANO, numeroAR, PLANO_SEDE, type EstadoSala, type LecturaSala } from "@/lib/sede"

export interface SalaHoy {
  id: number
  nombre: string
  descripcion: string | null
  estado: EstadoSala
  lectura: LecturaSala | null
}

const TONO: Record<EstadoSala["tono"], string> = {
  vege: "bg-primary/10 text-primary",
  flora: "bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200",
  neutro: "bg-muted text-foreground/80",
}

const FONDO_PLANO: Record<EstadoSala["tono"], string> = {
  vege: "bg-primary/10",
  flora: "bg-amber-50 dark:bg-amber-900/20",
  neutro: "bg-card",
}

/** Dónde queda cada sala que no está en el plano de la sede. */
const FUERA_DEL_PLANO: Record<string, string> = { "sala 4": "En Itaquí, casa de Lucho" }

/**
 * Sede en el celular (rediseño del 03/11/2026): cada sala con su ciclo y la
 * última lectura de Pulse, en lista o sobre el plano que dibujó Facundo. Sin
 * controles de demo: todo es dato real. En la compu se ve el 3D.
 */
export function SedeSalas({ salas }: { salas: SalaHoy[] }) {
  const router = useRouter()
  const [vista, setVista] = useState<"salas" | "plano">("salas")

  // Pulse guarda cada 5 minutos: se refresca al mismo ritmo.
  useEffect(() => {
    const id = window.setInterval(() => router.refresh(), 5 * 60_000)
    return () => window.clearInterval(id)
  }, [router])

  const ultima = salas.reduce<string | null>((u, s) => (s.lectura && (!u || s.lectura.leido_en > u) ? s.lectura.leido_en : u), null)
  const porNombre = new Map(salas.map((s) => [s.nombre.toLowerCase(), s]))
  const enPlano = new Set(PLANO_SEDE.flatMap((a) => (a.sala ? [a.sala.toLowerCase()] : [])))
  const fuera = salas.filter((s) => !enPlano.has(s.nombre.toLowerCase()))
  const proporcion = `${LIMITES_PLANO.x1 - LIMITES_PLANO.x0} / ${LIMITES_PLANO.z1 - LIMITES_PLANO.z0}`

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Sede</h1>
        <p className="text-sm text-muted-foreground">
          {ultima ? `Última lectura de Pulse: ${horaCorta(ultima)}` : "Sin lecturas de Pulse en las últimas 2 horas"}
        </p>
      </header>

      <div role="group" aria-label="Cómo ver la sede" className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
        {(["salas", "plano"] as const).map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={vista === v}
            onClick={() => setVista(v)}
            className={cn(
              "min-h-11 rounded-lg text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              vista === v ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {v === "salas" ? "Salas" : "Plano"}
          </button>
        ))}
      </div>

      {salas.length === 0 && <p className="rounded-2xl border bg-card p-5 text-muted-foreground">No hay salas cargadas en Cultivo.</p>}

      {vista === "salas" ? (
        <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
          {salas.map((s) => (
            <li key={s.id} className="space-y-1.5 px-4 py-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-semibold">
                  {s.nombre}
                  {FUERA_DEL_PLANO[s.nombre.toLowerCase()] && (
                    <span className="text-sm font-normal text-muted-foreground"> · {FUERA_DEL_PLANO[s.nombre.toLowerCase()]}</span>
                  )}
                </h2>
                <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", TONO[s.estado.tono])}>{s.estado.etiqueta}</span>
              </div>
              <Clima lectura={s.lectura} ultima={ultima} />
              {s.estado.proximo && (
                <p className={cn("text-sm", s.estado.pronto ? "font-semibold text-amber-800 dark:text-amber-300" : "text-muted-foreground")}>
                  {s.estado.proximo}
                </p>
              )}
              {s.descripcion && <p className="text-sm text-muted-foreground">{s.descripcion}</p>}
            </li>
          ))}
        </ul>
      ) : (
        <section aria-label="Plano de la sede" className="space-y-3">
          <div className="relative mx-auto w-full max-w-md" style={{ aspectRatio: proporcion }}>
            {PLANO_SEDE.map((a) => {
              const c = cajaEnPlano(a)
              const sala = a.sala ? porNombre.get(a.sala.toLowerCase()) : undefined
              const angosto = c.width < 15
              return (
                <div
                  key={a.id}
                  aria-hidden={angosto && !sala ? true : undefined}
                  className={cn(
                    "absolute flex flex-col gap-0.5 overflow-hidden p-1.5 ring-inset sm:p-2",
                    // Las salas, macizas; el resto de la casa (baño, patios, pasillo), apenas marcado.
                    sala ? cn("ring-[1.5px] ring-foreground/50", FONDO_PLANO[sala.estado.tono]) : "bg-background/40 ring-1 ring-foreground/15",
                  )}
                  style={{ left: `${c.left}%`, top: `${c.top}%`, width: `${c.width}%`, height: `${c.height}%` }}
                >
                  {sala ? (
                    <>
                      <span className="text-sm font-semibold leading-tight">{a.nombre}</span>
                      <span className="text-xs font-medium leading-tight">{sala.estado.etiqueta.replace(/ de \d+$/, "")}</span>
                      {sala.lectura && (
                        <span className="text-xs leading-tight text-foreground/80">
                          {numeroAR(sala.lectura.temperatura_c, 1)} °C · {numeroAR(sala.lectura.humedad_rh, 0)} %
                        </span>
                      )}
                      {sala.estado.pronto && sala.estado.proximo && (
                        <span className="mt-auto self-start rounded-full bg-amber-100 px-1.5 text-[11px] font-semibold text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
                          {sala.estado.proximo}
                        </span>
                      )}
                    </>
                  ) : (
                    !angosto && <span className="text-xs leading-tight text-muted-foreground">{a.nombre}</span>
                  )}
                </div>
              )
            })}
          </div>
          <p className="mx-auto flex w-full max-w-md items-center justify-end gap-1 text-xs text-muted-foreground">
            Por el pasillo, a atención al socio <ChevronDown aria-hidden className="size-3.5" />
          </p>
          {fuera.length > 0 && (
            <ul className="mx-auto w-full max-w-md space-y-2">
              {fuera.map((s) => (
                <li key={s.id} className="space-y-1 rounded-2xl border bg-card px-4 py-3">
                  <p className="font-semibold">
                    {s.nombre}{" "}
                    <span className="text-sm font-normal text-muted-foreground">
                      · {FUERA_DEL_PLANO[s.nombre.toLowerCase()] ?? "fuera del plano"}
                    </span>
                  </p>
                  <p className="text-sm text-muted-foreground">{s.estado.etiqueta}</p>
                  <Clima lectura={s.lectura} ultima={ultima} />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}

function Clima({ lectura, ultima }: { lectura: LecturaSala | null; ultima: string | null }) {
  if (!lectura) return <p className="text-sm text-muted-foreground">Sin lecturas en las últimas 2 horas</p>
  // Más de 20 minutos atrás de la última lectura de la sede: el sensor puede estar sin conexión.
  const atrasada = !!ultima && new Date(ultima).getTime() - new Date(lectura.leido_en).getTime() > 20 * 60_000
  return (
    <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[15px] font-medium">
      <span className="inline-flex items-center gap-1">
        <Thermometer aria-hidden className="size-4 text-muted-foreground" />
        <span className="sr-only">Temperatura</span>
        {numeroAR(lectura.temperatura_c, 1)} °C
      </span>
      <span className="inline-flex items-center gap-1">
        <Droplet aria-hidden className="size-4 text-muted-foreground" />
        <span className="sr-only">Humedad</span>
        {numeroAR(lectura.humedad_rh, 0)} %
      </span>
      <span>VPD {numeroAR(lectura.vpd, 2)}</span>
      {atrasada && <span className="text-xs font-normal text-muted-foreground">(lectura de las {horaCorta(lectura.leido_en)})</span>}
    </p>
  )
}
