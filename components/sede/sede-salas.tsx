"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { ChevronDown, Droplet, Thermometer } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { horaCorta } from "@/lib/equipo"
import {
  cajaEnPlano,
  LIMITES_PLANO,
  numeroAR,
  PLANO_SEDE,
  type EstadoSala,
  type FilaMedicion,
  type Hito,
  type LecturaSala,
  type ResumenCiclo,
} from "@/lib/sede"

export interface SalaHoy {
  id: number
  nombre: string
  descripcion: string | null
  estado: EstadoSala
  lectura: LecturaSala | null
  ciclo: ResumenCiclo | null
  /** Objetivo y medición de hoy (lib/sede.ts → filasMedicion). */
  medicion: FilaMedicion[]
  /** Lo que viene, según el protocolo de Ciclos. */
  hitos: Hito[]
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

const diaMes = (f: string) => `${Number(f.slice(8, 10))}/${Number(f.slice(5, 7))}`

/**
 * Sede en el celular (rediseño del 03/11/2026): cada sala con su ciclo y la
 * última lectura de Pulse, en lista o sobre el plano que dibujó Facundo. Al
 * tocar una sala se abre su ficha, la misma que en la compu: objetivo y
 * medición del día, el ciclo y lo que viene. Todo es dato real.
 */
export function SedeSalas({ salas }: { salas: SalaHoy[] }) {
  const router = useRouter()
  const [vista, setVista] = useState<"salas" | "plano">("salas")
  const [abierta, setAbierta] = useState<number | null>(null)
  const irA = useRef<number | null>(null)

  // Pulse guarda cada 5 minutos: se refresca al mismo ritmo.
  useEffect(() => {
    const id = window.setInterval(() => router.refresh(), 5 * 60_000)
    return () => window.clearInterval(id)
  }, [router])

  // Al tocar una sala en el plano, se pasa a la lista con su ficha abierta.
  useEffect(() => {
    if (vista !== "salas" || irA.current === null) return
    document.getElementById(`sala-${irA.current}`)?.scrollIntoView({ block: "start" })
    irA.current = null
  }, [vista, abierta])

  function abrirDesdePlano(id: number) {
    irA.current = id
    setAbierta(id)
    setVista("salas")
  }

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
          {salas.map((s) => {
            const open = abierta === s.id
            return (
              <li key={s.id} id={`sala-${s.id}`} className="scroll-mt-4">
                <h2>
                  <button
                    type="button"
                    aria-expanded={open}
                    aria-controls={`ficha-${s.id}`}
                    onClick={() => setAbierta(open ? null : s.id)}
                    className="flex w-full flex-col gap-1.5 px-4 py-3.5 text-left hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  >
                    <span className="flex w-full flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold">
                        {s.nombre}
                        {FUERA_DEL_PLANO[s.nombre.toLowerCase()] && (
                          <span className="text-sm font-normal text-muted-foreground"> · {FUERA_DEL_PLANO[s.nombre.toLowerCase()]}</span>
                        )}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", TONO[s.estado.tono])}>{s.estado.etiqueta}</span>
                        <ChevronDown aria-hidden className={cn("size-5 text-muted-foreground transition-transform", open && "rotate-180")} />
                      </span>
                    </span>
                    <Clima lectura={s.lectura} ultima={ultima} />
                    {s.estado.proximo && (
                      <span
                        className={cn(
                          "block text-sm",
                          s.estado.pronto ? "font-semibold text-amber-800 dark:text-amber-300" : "font-normal text-muted-foreground",
                        )}
                      >
                        {s.estado.proximo}
                      </span>
                    )}
                    {s.descripcion && <span className="block text-sm font-normal text-muted-foreground">{s.descripcion}</span>}
                  </button>
                </h2>
                {open && <FichaSala sala={s} />}
              </li>
            )
          })}
        </ul>
      ) : (
        <section aria-label="Plano de la sede" className="space-y-3">
          <p className="text-sm text-muted-foreground">Tocá una sala para ver su ficha.</p>
          <div className="relative mx-auto w-full max-w-md" style={{ aspectRatio: proporcion }}>
            {PLANO_SEDE.map((a) => {
              const c = cajaEnPlano(a)
              const sala = a.sala ? porNombre.get(a.sala.toLowerCase()) : undefined
              const angosto = c.width < 15
              const caja = { left: `${c.left}%`, top: `${c.top}%`, width: `${c.width}%`, height: `${c.height}%` }
              if (!sala) {
                // El resto de la casa (baño, patios, pasillo), apenas marcado.
                return (
                  <div
                    key={a.id}
                    aria-hidden={angosto ? true : undefined}
                    className="absolute overflow-hidden bg-background/40 p-1.5 ring-1 ring-inset ring-foreground/15 sm:p-2"
                    style={caja}
                  >
                    {!angosto && <span className="text-xs leading-tight text-muted-foreground">{a.nombre}</span>}
                  </div>
                )
              }
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => abrirDesdePlano(sala.id)}
                  aria-label={`Ver la ficha de ${a.nombre}`}
                  className={cn(
                    "absolute flex flex-col gap-0.5 overflow-hidden p-1.5 text-left ring-[1.5px] ring-inset ring-foreground/50 hover:ring-primary focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary sm:p-2",
                    FONDO_PLANO[sala.estado.tono],
                  )}
                  style={caja}
                >
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
                </button>
              )
            })}
          </div>
          <p className="mx-auto flex w-full max-w-md items-center justify-end gap-1 text-xs text-muted-foreground">
            Por el pasillo, a atención al socio <ChevronDown aria-hidden className="size-3.5" />
          </p>
          {fuera.length > 0 && (
            <ul className="mx-auto w-full max-w-md space-y-2">
              {fuera.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => abrirDesdePlano(s.id)}
                    className="flex w-full flex-col gap-1 rounded-2xl border bg-card px-4 py-3 text-left hover:bg-muted/40"
                  >
                    <span className="font-semibold">
                      {s.nombre}{" "}
                      <span className="text-sm font-normal text-muted-foreground">
                        · {FUERA_DEL_PLANO[s.nombre.toLowerCase()] ?? "fuera del plano"}
                      </span>
                    </span>
                    <span className="text-sm text-muted-foreground">{s.estado.etiqueta}</span>
                    <Clima lectura={s.lectura} ultima={ultima} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}

/** La ficha de una sala, como la del 3D en la compu. */
function FichaSala({ sala }: { sala: SalaHoy }) {
  const c = sala.ciclo
  const marca = (f: FilaMedicion) => (f.marca === "ok" ? " ✓" : f.marca === "bajo" ? " ↓ bajo" : f.marca === "alto" ? " ↑ alto" : "")
  const etiqueta = "text-xs font-semibold uppercase tracking-wider text-muted-foreground"

  return (
    <div id={`ficha-${sala.id}`} className="space-y-4 border-t bg-muted/30 px-4 pt-3 pb-4">
      {c && (
        <section aria-label="Ciclo" className="space-y-1.5">
          <div aria-hidden className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-1.5 rounded-full bg-primary" style={{ width: `${c.avance}%` }} />
          </div>
          <p className="flex justify-between gap-2 text-xs text-muted-foreground">
            <span>Entrada {diaMes(c.inicio)}</span>
            <span>12/12 {diaMes(c.flip)}</span>
            <span>Corte {diaMes(c.cosecha)}</span>
            <span>Libre {diaMes(c.libre)}</span>
          </p>
          {c.m2 && (
            <p className="text-sm text-muted-foreground">
              {numeroAR(c.m2, 0)} m²{c.plantas ? ` · ~${c.plantas} plantas` : ""}
            </p>
          )}
        </section>
      )}

      {sala.medicion.length > 0 && (
        <section aria-labelledby={`medicion-${sala.id}`} className="space-y-1">
          <h3 id={`medicion-${sala.id}`} className={etiqueta}>
            Objetivo y medición de hoy
          </h3>
          <ul className="divide-y">
            {sala.medicion.map((f) => (
              <li key={f.que} className="py-2">
                <p className="flex items-baseline justify-between gap-3">
                  <span className="font-medium">{f.que}</span>
                  {f.objetivo && <span className="text-right text-sm text-muted-foreground">Objetivo {f.objetivo}</span>}
                </p>
                <p className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-sm">
                  {f.valor && (
                    <span
                      className={cn(
                        "font-semibold",
                        f.marca === "ok" && "text-primary",
                        (f.marca === "bajo" || f.marca === "alto") && "text-destructive",
                      )}
                    >
                      {f.valor}
                      {marca(f)}
                    </span>
                  )}
                  {f.detalle && <span className="text-muted-foreground">{f.detalle}</span>}
                  {f.nota && <span className="text-muted-foreground">{f.nota}</span>}
                </p>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            {sala.lectura ? `Pulse, ${horaCorta(sala.lectura.leido_en)}` : "Sin lecturas de Pulse en las últimas 2 horas"} · EC, pH y
            drenaje se miden a mano en cada riego.
          </p>
        </section>
      )}

      {sala.hitos.length > 0 && (
        <section aria-labelledby={`hitos-${sala.id}`} className="space-y-1">
          <h3 id={`hitos-${sala.id}`} className={etiqueta}>
            Lo que viene
          </h3>
          <ul className="divide-y">
            {sala.hitos.map((h) => (
              <li key={`${h.fecha}-${h.titulo}`} className="flex items-baseline gap-3 py-1.5 text-sm">
                <span className="w-11 shrink-0 text-muted-foreground">{diaMes(h.fecha)}</span>
                <span className="flex-1">{h.titulo}</span>
                <span className="shrink-0 text-muted-foreground">
                  {h.enDias === 0 ? "hoy" : h.enDias === 1 ? "mañana" : `en ${h.enDias} d`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-wrap gap-2">
        <Button asChild className="h-11">
          <Link href="/riego">Cargar riego</Link>
        </Button>
        <Button asChild variant="outline" className="h-11">
          <Link href="/ciclos">Ciclos</Link>
        </Button>
        <Button asChild variant="outline" className="h-11">
          <Link href="/monitoreo">Monitoreo</Link>
        </Button>
      </div>
    </div>
  )
}

function Clima({ lectura, ultima }: { lectura: LecturaSala | null; ultima: string | null }) {
  if (!lectura) return <span className="block text-sm font-normal text-muted-foreground">Sin lecturas en las últimas 2 horas</span>
  // Más de 20 minutos atrás de la última lectura de la sede: el sensor puede estar sin conexión.
  const atrasada = !!ultima && new Date(ultima).getTime() - new Date(lectura.leido_en).getTime() > 20 * 60_000
  return (
    <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[15px] font-medium">
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
    </span>
  )
}
