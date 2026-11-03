"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useState } from "react"
import { Check, ChevronDown, CircleAlert, ClipboardList, History, Inbox, Plus, Repeat, X } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { horaCorta, personasVisibles, ROL_LABEL, type Notificacion, type Perfil, type Tarea } from "@/lib/equipo"
import {
  destinatariosProblema,
  fechaLarga,
  listaNombres,
  primerNombre,
  resumenEquipo,
  separarDia,
  sinTareas,
} from "@/lib/hoy"
import { PasoDialog } from "@/components/procesos/paso-dialog"
import { AvisosDialog } from "@/components/hoy/avisos-dialog"
import { NuevaTareaDialog } from "@/components/hoy/nueva-tarea-dialog"
import { ProblemaDialog } from "@/components/hoy/problema-dialog"
import { TareaDialog } from "@/components/hoy/tarea-dialog"

interface Props {
  yo: Perfil
  hoy: string
  perfiles: Perfil[]
  initialTareas: Tarea[]
  initialAvisos: Notificacion[]
}

type Aviso = { tipo: "ok" | "error"; texto: string; tareaId?: number }

const etiqueta = "text-xs font-semibold uppercase tracking-wider text-muted-foreground"

/**
 * Pantalla Hoy (rediseño de Equipo, propuesta del 03/11/2026): una tarea por
 * vez con «Hecha» y «Problema» bien grandes; quien supervisa ve además cómo
 * viene el equipo. Los comentarios de cada tarea están en el Chat. La pantalla
 * anterior sigue en /equipo/anterior.
 */
export function HoyManager({ yo, hoy, perfiles, initialTareas, initialAvisos }: Props) {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()
  const visibles = useMemo(() => personasVisibles(yo, perfiles), [yo, perfiles])
  const supervisa = visibles.length > 1
  const [tareas, setTareas] = useState(initialTareas)
  const [avisos, setAvisos] = useState(initialAvisos)
  // Quien supervisa y no tiene tareas propias arranca viendo al equipo.
  const [vista, setVista] = useState<"mias" | "equipo">(() =>
    supervisa && !initialTareas.some((t) => t.responsable_id === yo.id) ? "equipo" : "mias",
  )
  const [verHechas, setVerHechas] = useState(false)
  const [personaAbierta, setPersonaAbierta] = useState<string | null>(null)
  const [detalleId, setDetalleId] = useState<number | null>(null)
  const [problemaId, setProblemaId] = useState<number | null>(null)
  const [pasoTarea, setPasoTarea] = useState<Tarea | null>(null)
  const [nuevaAbierta, setNuevaAbierta] = useState(false)
  const [avisosAbiertos, setAvisosAbiertos] = useState(false)
  const [guardando, setGuardando] = useState<number | null>(null)
  const [aviso, setAviso] = useState<Aviso | null>(null)

  const idsVisibles = useMemo(() => new Set(visibles.map((p) => p.id)), [visibles])
  const nombre = (id: string | null) => perfiles.find((p) => p.id === id)?.nombre ?? "—"
  const porId = (id: number | null) => tareas.find((t) => t.id === id) ?? null

  const dia = separarDia(tareas.filter((t) => t.responsable_id === yo.id))
  const pendientes = dia.despues.length + (dia.actual ? 1 : 0)
  const porcentaje = dia.total === 0 ? 0 : Math.round((dia.hechas.length / dia.total) * 100)
  const sinLeer = avisos.filter((a) => !a.leida).length

  const recargar = useCallback(async () => {
    const [t, a] = await Promise.all([
      supabase.from("tareas").select("*").eq("fecha", hoy),
      supabase.from("notificaciones").select("*").order("created_at", { ascending: false }).limit(60),
    ])
    if (t.data) setTareas(t.data as Tarea[])
    if (a.data) setAvisos(a.data as Notificacion[])
  }, [supabase, hoy])

  // Cada 30 s, para que quien supervisa vea el avance sin recargar la página.
  useEffect(() => {
    const id = window.setInterval(recargar, 30000)
    return () => window.clearInterval(id)
  }, [recargar])

  async function cambiarEstado(t: Tarea, estado: Tarea["estado"], nota: string | null): Promise<boolean> {
    setGuardando(t.id)
    const cambios =
      estado === "pendiente"
        ? { estado, nota: null, completada_at: null, completada_por: null }
        : { estado, nota, completada_at: new Date().toISOString(), completada_por: yo.id }
    const { data, error } = await supabase.from("tareas").update(cambios).eq("id", t.id).select().single()
    setGuardando(null)
    if (error || !data) {
      setAviso({ tipo: "error", texto: `No se pudo guardar: ${error?.message ?? "probá de nuevo"}` })
      return false
    }
    setTareas((ts) => ts.map((x) => (x.id === t.id ? (data as Tarea) : x)))
    return true
  }

  function marcarHecha(t: Tarea) {
    // Un paso de un procedimiento se completa con su formulario.
    if (t.proceso_paso_id) {
      setPasoTarea(t)
      return
    }
    void cambiarEstado(t, "hecha", t.nota)
  }

  async function avisarProblema(t: Tarea, nota: string) {
    const ok = await cambiarEstado(t, "problema", nota)
    if (ok) {
      const a = destinatariosProblema(t, perfiles, yo.id).map((p) => p.nombre)
      setAviso({ tipo: "ok", texto: a.length ? `Le avisamos a ${listaNombres(a)}.` : "Quedó avisado el problema.", tareaId: t.id })
    }
    return ok
  }

  async function marcarLeidos(ids: number[]) {
    if (ids.length === 0) return
    await supabase.from("notificaciones").update({ leida: true }).in("id", ids)
    setAvisos((as) => as.map((a) => (ids.includes(a.id) ? { ...a, leida: true } : a)))
  }

  async function abrirAviso(a: Notificacion) {
    await marcarLeidos([a.id])
    if (a.tarea_id) router.push(`/chat?c=t:${a.tarea_id}`)
    else if (a.enlace && a.enlace !== "/equipo") router.push(a.enlace)
  }

  function tareaCargada(t: Tarea) {
    if (t.fecha === hoy) setTareas((ts) => [...ts, t])
    setAviso({
      tipo: "ok",
      texto: t.responsable_id === yo.id ? "Tarea cargada." : `Tarea cargada. Le llega un aviso a ${nombre(t.responsable_id)}.`,
    })
  }

  const problemasEquipo = tareas
    .filter((t) => t.estado === "problema" && idsVisibles.has(t.responsable_id))
    .sort((a, b) => (b.completada_at ?? "").localeCompare(a.completada_at ?? ""))
  const resumen = resumenEquipo(visibles, tareas, yo.id)
  const libres = sinTareas(visibles, tareas, yo.id)

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">{fechaLarga(hoy)}</p>
          <h1 className="text-2xl font-semibold tracking-tight">Hola, {primerNombre(yo.nombre)}</h1>
        </div>
        {/* Con texto: la campanita de arriba es la de las notificaciones del celular. */}
        <Button
          variant="outline"
          className="h-11 shrink-0 rounded-full px-4"
          onClick={() => setAvisosAbiertos(true)}
          aria-label={sinLeer > 0 ? `Avisos, ${sinLeer} sin leer` : "Avisos"}
        >
          <Inbox className="size-4" /> Avisos
          {sinLeer > 0 && (
            <span aria-hidden className="min-w-5 rounded-full bg-destructive px-1.5 text-center text-xs font-semibold leading-5 text-white">
              {sinLeer}
            </span>
          )}
        </Button>
      </header>

      {supervisa && (
        <div role="group" aria-label="Qué tareas ver" className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
          {(["mias", "equipo"] as const).map((v) => (
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
              {v === "mias" ? "Mis tareas" : "Equipo"}
            </button>
          ))}
        </div>
      )}

      {aviso && (
        <div
          role="status"
          className={cn(
            "flex items-center justify-between gap-3 rounded-lg py-2 pr-1 pl-4 text-sm",
            aviso.tipo === "ok" ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive",
          )}
        >
          <span>
            {aviso.texto}{" "}
            {aviso.tareaId && (
              <Link href={`/chat?c=t:${aviso.tareaId}`} className="font-semibold underline underline-offset-2">
                Ver en el chat
              </Link>
            )}
          </span>
          <button
            type="button"
            onClick={() => setAviso(null)}
            aria-label="Cerrar este mensaje"
            className="flex size-11 shrink-0 items-center justify-center rounded-lg hover:bg-black/5"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {vista === "mias" ? (
        <>
          {dia.total === 0 ? (
            <p className="rounded-2xl border bg-card p-5 text-muted-foreground">No tenés tareas para hoy.</p>
          ) : (
            <section aria-label="Avance del día" className="space-y-2">
              <div className="flex items-baseline justify-between gap-3">
                <p className="font-semibold">
                  {dia.hechas.length} de {dia.total} hechas
                </p>
                <p className="text-sm text-muted-foreground">{pendientes === 0 ? "Sin pendientes" : `Te quedan ${pendientes}`}</p>
              </div>
              <div aria-hidden className="h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-2 rounded-full bg-primary transition-[width]" style={{ width: `${porcentaje}%` }} />
              </div>
            </section>
          )}

          {dia.actual ? (
            <section aria-labelledby="hoy-ahora" className="space-y-3 rounded-2xl border bg-card p-5">
              <p className={etiqueta}>Ahora</p>
              <h2 id="hoy-ahora" className="text-xl font-semibold leading-snug">
                {dia.actual.titulo}
              </h2>
              {dia.actual.detalle && (
                <p className="whitespace-pre-line text-[15px] leading-relaxed text-muted-foreground">{dia.actual.detalle}</p>
              )}
              {dia.actual.creada_por && dia.actual.creada_por !== yo.id && (
                <p className="text-sm text-muted-foreground">Te la pasó {nombre(dia.actual.creada_por)}.</p>
              )}
              <div className="flex gap-2 pt-1">
                <Button
                  className="h-12 flex-[1.3] text-base"
                  disabled={guardando === dia.actual.id}
                  onClick={() => dia.actual && marcarHecha(dia.actual)}
                >
                  {dia.actual.proceso_paso_id ? (
                    <>
                      <ClipboardList className="size-5" /> Completar
                    </>
                  ) : (
                    <>
                      <Check className="size-5" /> Hecha
                    </>
                  )}
                </Button>
                {!dia.actual.proceso_paso_id && (
                  <Button
                    variant="outline"
                    className="h-12 flex-1 text-base text-destructive hover:text-destructive"
                    onClick={() => dia.actual && setProblemaId(dia.actual.id)}
                  >
                    <CircleAlert className="size-5" /> Problema
                  </Button>
                )}
              </div>
              <Button variant="link" className="h-11 px-0" onClick={() => dia.actual && setDetalleId(dia.actual.id)}>
                Ver detalle y comentarios
              </Button>
            </section>
          ) : (
            dia.total > 0 && (
              <section className="space-y-1 rounded-2xl bg-primary/10 p-5 text-primary">
                <h2 className="text-xl font-semibold">Listo por hoy</h2>
                <p className="text-[15px]">
                  {dia.problemas.length > 0
                    ? "No te quedan pendientes. Lo que tiene un problema se sigue en el chat."
                    : "Hiciste todas tus tareas. Si pasa algo, avisá por el chat."}
                </p>
              </section>
            )
          )}

          {dia.problemas.length > 0 && (
            <section aria-labelledby="hoy-problemas" className="space-y-2">
              <h2 id="hoy-problemas" className={etiqueta}>
                Con un problema avisado
              </h2>
              <ul className="divide-y overflow-hidden rounded-2xl border border-destructive/30 bg-card">
                {dia.problemas.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 py-2 pr-2 pl-4">
                    <button type="button" onClick={() => setDetalleId(t.id)} className="min-h-11 min-w-0 flex-1 text-left">
                      <span className="block font-medium leading-snug">{t.titulo}</span>
                      {t.nota && <span className="block text-sm text-destructive">«{t.nota}»</span>}
                    </button>
                    <Button variant="ghost" asChild className="h-11 shrink-0 text-primary">
                      <Link href={`/chat?c=t:${t.id}`}>Chat</Link>
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {dia.despues.length > 0 && (
            <section aria-labelledby="hoy-despues" className="space-y-2">
              <h2 id="hoy-despues" className={etiqueta}>
                Después
              </h2>
              <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
                {dia.despues.map((t) => (
                  <li key={t.id} className="flex items-center pr-3">
                    <button
                      type="button"
                      aria-label={t.proceso_paso_id ? `Completar: ${t.titulo}` : `Marcar como hecha: ${t.titulo}`}
                      disabled={guardando === t.id}
                      onClick={() => marcarHecha(t)}
                      className="flex size-12 shrink-0 items-center justify-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span aria-hidden className="size-6 rounded-full border-2 border-muted-foreground/70" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDetalleId(t.id)}
                      className="min-h-12 flex-1 py-2 text-left leading-snug"
                    >
                      {t.titulo}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {dia.hechas.length > 0 && (
            <section className="space-y-2">
              <button
                type="button"
                aria-expanded={verHechas}
                onClick={() => setVerHechas((v) => !v)}
                className="flex min-h-11 w-full items-center justify-between rounded-lg px-1 text-sm font-semibold text-muted-foreground hover:text-foreground"
              >
                Hechas ({dia.hechas.length})
                <ChevronDown className={cn("size-5 transition-transform", verHechas && "rotate-180")} />
              </button>
              {verHechas && (
                <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
                  {dia.hechas.map((t) => (
                    <li key={t.id} className="flex items-center pr-3">
                      <button
                        type="button"
                        aria-label={`Volver a pendiente: ${t.titulo}`}
                        disabled={guardando === t.id || !!t.proceso_paso_id}
                        onClick={() => cambiarEstado(t, "pendiente", null)}
                        className="flex size-12 shrink-0 items-center justify-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span aria-hidden className="flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
                          <Check className="size-3.5" strokeWidth={3} />
                        </span>
                      </button>
                      <button type="button" onClick={() => setDetalleId(t.id)} className="min-h-12 flex-1 py-2 text-left">
                        <span className="block leading-snug text-muted-foreground">{t.titulo}</span>
                        {t.completada_at && (
                          <span className="block text-xs text-muted-foreground">Hecha a las {horaCorta(t.completada_at)}</span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </>
      ) : (
        <>
          {problemasEquipo.length > 0 && (
            <section aria-labelledby="equipo-mirar" className="space-y-2">
              <h2 id="equipo-mirar" className={etiqueta}>
                Para mirar
              </h2>
              <ul className="space-y-2">
                {problemasEquipo.map((t) => {
                  const avisados = destinatariosProblema(t, perfiles, t.completada_por ?? t.responsable_id).map((p) => p.nombre)
                  return (
                    <li key={t.id} className="space-y-2 rounded-2xl border border-destructive/30 bg-card p-4">
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2.5 py-0.5 font-semibold text-destructive">
                          <CircleAlert className="size-3.5" /> Problema
                        </span>
                        <span className="text-muted-foreground">
                          {nombre(t.responsable_id)}
                          {t.completada_at ? ` · ${horaCorta(t.completada_at)}` : ""}
                        </span>
                      </div>
                      <h3 className="font-semibold leading-snug">{t.titulo}</h3>
                      {t.nota && <p className="text-[15px]">«{t.nota}»</p>}
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm text-muted-foreground">
                          {avisados.length > 0 ? `Le llegó a ${listaNombres(avisados)}` : ""}
                        </span>
                        <Button variant="secondary" asChild className="h-11 shrink-0 px-5 text-primary">
                          <Link href={`/chat?c=t:${t.id}`}>Ver</Link>
                        </Button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </section>
          )}

          <section aria-labelledby="equipo-como" className="space-y-2">
            <h2 id="equipo-como" className={etiqueta}>
              Cómo vienen
            </h2>
            {resumen.length === 0 ? (
              <p className="rounded-2xl border bg-card p-5 text-muted-foreground">Nadie más tiene tareas hoy.</p>
            ) : (
              <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
                {resumen.map((r) => {
                  const abierta = personaAbierta === r.persona.id
                  const suyas = separarDia(tareas.filter((t) => t.responsable_id === r.persona.id))
                  const lista = [...suyas.problemas, ...(suyas.actual ? [suyas.actual] : []), ...suyas.despues, ...suyas.hechas]
                  return (
                    <li key={r.persona.id}>
                      <button
                        type="button"
                        aria-expanded={abierta}
                        onClick={() => setPersonaAbierta(abierta ? null : r.persona.id)}
                        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/50"
                      >
                        <span
                          aria-hidden
                          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted font-semibold"
                        >
                          {r.persona.nombre.charAt(0)}
                        </span>
                        <span className="min-w-0 flex-1 space-y-1.5">
                          <span className="flex items-baseline justify-between gap-2">
                            <span className="truncate font-semibold">
                              {primerNombre(r.persona.nombre)}{" "}
                              <span className="text-sm font-normal text-muted-foreground">· {ROL_LABEL[r.persona.rol]}</span>
                            </span>
                            <span className="shrink-0 text-sm font-semibold">
                              {r.hechas} de {r.total}
                            </span>
                          </span>
                          <span className="flex items-center gap-2">
                            <span aria-hidden className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                              <span className="block h-1.5 rounded-full bg-primary" style={{ width: `${r.porcentaje}%` }} />
                            </span>
                            {r.problemas > 0 && (
                              <span className="shrink-0 text-xs font-semibold text-destructive">
                                {r.problemas === 1 ? "1 problema" : `${r.problemas} problemas`}
                              </span>
                            )}
                          </span>
                        </span>
                        <ChevronDown
                          aria-hidden
                          className={cn("size-5 shrink-0 text-muted-foreground transition-transform", abierta && "rotate-180")}
                        />
                      </button>
                      {abierta && (
                        <ul className="space-y-1 pr-4 pb-3 pl-[4.25rem]">
                          {lista.map((t) => (
                            <li key={t.id}>
                              <button
                                type="button"
                                onClick={() => setDetalleId(t.id)}
                                className="flex min-h-10 w-full items-start gap-2.5 py-1 text-left text-[15px] leading-snug"
                              >
                                <EstadoIcono estado={t.estado} />
                                <span className={cn(t.estado === "hecha" && "text-muted-foreground")}>{t.titulo}</span>
                                <span className="sr-only">
                                  {t.estado === "hecha" ? " (hecha)" : t.estado === "problema" ? " (con problema)" : " (pendiente)"}
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
            {libres.length > 0 && (
              <p className="px-1 text-sm text-muted-foreground">Sin tareas hoy: {listaNombres(libres.map((p) => p.nombre))}.</p>
            )}
          </section>
        </>
      )}

      <nav aria-label="Más de Equipo" className="flex flex-wrap gap-1 border-t pt-3">
        <Button variant="ghost" className="h-11" onClick={() => setNuevaAbierta(true)}>
          <Plus className="size-4" /> {supervisa ? "Asignar una tarea" : "Agregar una tarea"}
        </Button>
        <Button variant="ghost" asChild className="h-11">
          <Link href="/equipo/rutinas">
            <Repeat className="size-4" /> Rutinas
          </Link>
        </Button>
        <Button variant="ghost" asChild className="h-11 text-muted-foreground">
          <Link href="/equipo/anterior">
            <History className="size-4" /> Pantalla anterior
          </Link>
        </Button>
      </nav>

      <TareaDialog
        tarea={porId(detalleId)}
        yo={yo}
        perfiles={perfiles}
        guardando={guardando === detalleId}
        onCerrar={() => setDetalleId(null)}
        onHecha={(t) => {
          setDetalleId(null)
          marcarHecha(t)
        }}
        onProblema={(t) => {
          setDetalleId(null)
          setProblemaId(t.id)
        }}
        onResuelto={(t) => void cambiarEstado(t, "hecha", t.nota)}
        onPendiente={(t) => void cambiarEstado(t, "pendiente", null)}
      />
      <ProblemaDialog
        key={problemaId ?? "cerrado"}
        tarea={porId(problemaId)}
        yo={yo}
        perfiles={perfiles}
        onCerrar={() => setProblemaId(null)}
        onAvisar={avisarProblema}
      />
      <NuevaTareaDialog
        abierto={nuevaAbierta}
        onCerrar={() => setNuevaAbierta(false)}
        yo={yo}
        perfiles={perfiles}
        hoy={hoy}
        supabase={supabase}
        onCreada={tareaCargada}
      />
      <AvisosDialog
        abierto={avisosAbiertos}
        onCerrar={() => setAvisosAbiertos(false)}
        avisos={avisos}
        onMarcarLeidos={marcarLeidos}
        onAbrir={abrirAviso}
      />
      {pasoTarea && (
        <PasoDialog
          pasoId={pasoTarea.proceso_paso_id ?? null}
          onClose={() => setPasoTarea(null)}
          onListo={() => {
            setPasoTarea(null)
            void recargar()
          }}
          yo={yo}
          perfiles={perfiles}
          supabase={supabase}
        />
      )}
    </div>
  )
}

function EstadoIcono({ estado }: { estado: Tarea["estado"] }) {
  if (estado === "hecha") {
    return (
      <span aria-hidden className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <Check className="size-3" strokeWidth={3} />
      </span>
    )
  }
  if (estado === "problema") {
    return (
      <span aria-hidden className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-destructive text-xs font-bold text-white">
        !
      </span>
    )
  }
  return <span aria-hidden className="mt-0.5 size-5 shrink-0 rounded-full border-2 border-muted-foreground/70" />
}
