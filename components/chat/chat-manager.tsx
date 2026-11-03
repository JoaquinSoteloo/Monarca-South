"use client"

import { useSearchParams } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Check, ChevronLeft, CircleAlert, Leaf, Users } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { horaCorta, ROL_LABEL, type Mensaje, type Perfil, type Tarea } from "@/lib/equipo"
import {
  armarLista,
  claveConversacion,
  etiquetaDia,
  leerConversacion,
  mensajesDe,
  teInvolucra,
  type Conversacion,
  type FilaChat,
} from "@/lib/chat"
import { EVENTO_LEIDOS, leerLeidos, marcarLeida, type Leidos } from "@/lib/chat-leidos"
import { puedeEditarTarea } from "@/lib/hoy"
import { AsistenteChat } from "@/components/chat/asistente-chat"
import { Composer } from "@/components/chat/composer"

interface Props {
  yo: Perfil
  perfiles: Perfil[]
  /** Desde qué fecha se buscan tareas con problema (YYYY-MM-DD). */
  problemasDesde: string
  initialGenerales: Mensaje[]
  initialProblemas: Tarea[]
  initialComentarios: Mensaje[]
  puedeAsistente: boolean
}

/** Junta mensajes nuevos sin repetir, del más viejo al más nuevo. */
function agregar(lista: Mensaje[], nuevos: Mensaje[]): Mensaje[] {
  const porId = new Map(lista.map((m) => [m.id, m]))
  for (const m of nuevos) porId.set(m.id, m)
  return [...porId.values()].sort((a, b) => a.created_at.localeCompare(b.created_at))
}

const SIN_LEIDOS: Leidos = { leidos: {}, desde: "9999-12-31" }

/**
 * Chat (rediseño del 03/11/2026): un solo lugar para hablar, como WhatsApp.
 * El asistente, el canal «Todos», las tareas con un problema y los privados en
 * una lista; en el celular la conversación ocupa toda la pantalla. La
 * conversación abierta va en la dirección (?c=…) para poder enlazarla.
 */
export function ChatManager({ yo, perfiles, problemasDesde, initialGenerales, initialProblemas, initialComentarios, puedeAsistente }: Props) {
  const supabase = useMemo(() => createClient(), [])
  const params = useSearchParams()
  const conv = leerConversacion(params.get("c"))
  const verConv = conv && (conv.tipo !== "asistente" || puedeAsistente) ? conv : null
  const clave = verConv ? claveConversacion(verConv) : null
  const tareaAbiertaId = verConv?.tipo === "tarea" ? verConv.id : null

  const [generales, setGenerales] = useState(initialGenerales)
  const [problemas, setProblemas] = useState(initialProblemas)
  const [comentarios, setComentarios] = useState(initialComentarios)
  const [tareaAbierta, setTareaAbierta] = useState<Tarea | null>(null)
  const [leidos, setLeidos] = useState<Leidos>(SIN_LEIDOS)
  const [error, setError] = useState<string | null>(null)
  const ultimoGeneral = useRef(initialGenerales[initialGenerales.length - 1]?.created_at ?? null)
  const fin = useRef<HTMLDivElement>(null)

  const nombre = useCallback((id: string) => perfiles.find((p) => p.id === id)?.nombre ?? "Alguien", [perfiles])

  function abrir(c: string | null) {
    setError(null)
    window.history.pushState(null, "", c ? `/chat?c=${c}` : "/chat")
  }

  // Lo leído vive en el navegador (lib/chat-leidos.ts).
  useEffect(() => {
    const actualizar = () => setLeidos(leerLeidos())
    actualizar()
    window.addEventListener(EVENTO_LEIDOS, actualizar)
    window.addEventListener("storage", actualizar)
    return () => {
      window.removeEventListener(EVENTO_LEIDOS, actualizar)
      window.removeEventListener("storage", actualizar)
    }
  }, [])

  // Mensajes nuevos del canal y de los privados cada 8 s (solo lo que falta),
  // y los comentarios de la tarea abierta.
  useEffect(() => {
    async function traerNuevos() {
      let q = supabase.from("mensajes").select("*").is("tarea_id", null).order("created_at").limit(200)
      if (ultimoGeneral.current) q = q.gt("created_at", ultimoGeneral.current)
      const { data } = await q
      if (data?.length) {
        const nuevos = data as Mensaje[]
        ultimoGeneral.current = nuevos[nuevos.length - 1].created_at
        setGenerales((gs) => agregar(gs, nuevos))
      }
      if (tareaAbiertaId) {
        const { data: cs } = await supabase.from("mensajes").select("*").eq("tarea_id", tareaAbiertaId).order("created_at")
        if (cs) setComentarios((c) => agregar(c, cs as Mensaje[]))
      }
    }
    const id = window.setInterval(traerNuevos, 8000)
    return () => window.clearInterval(id)
  }, [supabase, tareaAbiertaId])

  // Las tareas con problema y sus comentarios, cada minuto.
  useEffect(() => {
    async function traerProblemas() {
      const { data } = await supabase.from("tareas").select("*").eq("estado", "problema").gte("fecha", problemasDesde)
      const mias = ((data ?? []) as Tarea[]).filter((t) => teInvolucra(t, yo, perfiles))
      setProblemas(mias)
      if (mias.length === 0) return
      const { data: cs } = await supabase
        .from("mensajes")
        .select("*")
        .in(
          "tarea_id",
          mias.map((t) => t.id),
        )
        .order("created_at", { ascending: false })
        .limit(300)
      if (cs) setComentarios((c) => agregar(c, cs as Mensaje[]))
    }
    const id = window.setInterval(traerProblemas, 60000)
    return () => window.clearInterval(id)
  }, [supabase, problemasDesde, yo, perfiles])

  // La tarea abierta, fresca (puede venir de un enlace y no tener problema).
  useEffect(() => {
    if (!tareaAbiertaId) return
    let vivo = true
    void (async () => {
      const [{ data: t }, { data: cs }] = await Promise.all([
        supabase.from("tareas").select("*").eq("id", tareaAbiertaId).maybeSingle(),
        supabase.from("mensajes").select("*").eq("tarea_id", tareaAbiertaId).order("created_at"),
      ])
      if (!vivo) return
      setTareaAbierta((t as Tarea | null) ?? null)
      if (cs) setComentarios((c) => agregar(c, cs as Mensaje[]))
    })()
    return () => {
      vivo = false
    }
  }, [supabase, tareaAbiertaId])

  const mensajes = verConv && verConv.tipo !== "asistente" ? mensajesDe(verConv, generales, comentarios, yo.id) : []
  const ultimoAt = mensajes[mensajes.length - 1]?.created_at

  // Abrir una conversación la marca leída hasta el último mensaje.
  useEffect(() => {
    if (!clave || clave === "asistente") return
    const ahora = new Date().toISOString()
    marcarLeida(clave, ultimoAt && ultimoAt > ahora ? ultimoAt : ahora)
  }, [clave, ultimoAt])

  useEffect(() => {
    fin.current?.scrollIntoView({ block: "end" })
  }, [clave, mensajes.length])

  const filas = armarLista({ yo, perfiles, generales, problemas, comentarios, leidos: leidos.leidos, desde: leidos.desde })
  const tarea = tareaAbiertaId
    ? (tareaAbierta?.id === tareaAbiertaId ? tareaAbierta : (problemas.find((t) => t.id === tareaAbiertaId) ?? null))
    : null

  async function enviar(texto: string): Promise<boolean> {
    if (!verConv || verConv.tipo === "asistente") return false
    const fila: Record<string, unknown> = { cuerpo: texto, autor_id: yo.id }
    if (verConv.tipo === "privado") fila.para_id = verConv.con
    if (verConv.tipo === "tarea") fila.tarea_id = verConv.id
    const { data, error: err } = await supabase.from("mensajes").insert(fila).select().single()
    if (err || !data) {
      setError(`No se pudo enviar: ${err?.message ?? "probá de nuevo"}`)
      return false
    }
    setError(null)
    if (verConv.tipo === "tarea") setComentarios((c) => agregar(c, [data as Mensaje]))
    else setGenerales((g) => agregar(g, [data as Mensaje]))
    return true
  }

  async function resolver(t: Tarea) {
    const { data, error: err } = await supabase
      .from("tareas")
      .update({ estado: "hecha", nota: t.nota, completada_at: new Date().toISOString(), completada_por: yo.id })
      .eq("id", t.id)
      .select()
      .single()
    if (err || !data) {
      setError(`No se pudo guardar: ${err?.message ?? "probá de nuevo"}`)
      return
    }
    setTareaAbierta(data as Tarea)
    setProblemas((ps) => ps.filter((p) => p.id !== t.id))
  }

  return (
    <div className="mx-auto w-full max-w-5xl lg:grid lg:h-[calc(100dvh-3rem)] lg:grid-cols-[22rem_minmax(0,1fr)] lg:gap-4">
      <section aria-labelledby="chat-titulo" className={cn("space-y-4 lg:overflow-y-auto lg:pr-1", verConv && "hidden lg:block")}>
        <h1 id="chat-titulo" className="px-1 text-2xl font-semibold tracking-tight">
          Chat
        </h1>

        {puedeAsistente && (
          <button
            type="button"
            onClick={() => abrir("asistente")}
            aria-current={clave === "asistente" ? "true" : undefined}
            className={cn(
              "flex min-h-[4.5rem] w-full items-center gap-3 rounded-2xl border bg-card px-4 py-3 text-left hover:bg-muted/60",
              clave === "asistente" && "border-primary/50 bg-primary/5",
            )}
          >
            <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent/25 text-amber-800">
              <Leaf className="size-5" />
            </span>
            <span className="min-w-0">
              <span className="block font-semibold">Asistente de cultivo</span>
              <span className="block text-sm text-muted-foreground">Preguntale sobre riego, plagas o rangos.</span>
            </span>
          </button>
        )}

        <div className="space-y-2">
          <h2 className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Conversaciones</h2>
          <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
            {filas.map((f) => (
              <li key={f.clave}>
                <FilaConversacion fila={f} activa={clave === f.clave} onAbrir={() => abrir(f.clave)} />
              </li>
            ))}
          </ul>
        </div>
      </section>

      {verConv ? (
        <section
          aria-label="Conversación"
          className="fixed inset-0 z-40 flex flex-col bg-background lg:static lg:z-auto lg:overflow-hidden lg:rounded-2xl lg:border"
        >
          <header className="flex shrink-0 items-center gap-2 border-b bg-card px-2 py-2 lg:px-4">
            <button
              type="button"
              onClick={() => abrir(null)}
              aria-label="Volver a las conversaciones"
              className="flex size-11 shrink-0 items-center justify-center rounded-full text-primary hover:bg-muted lg:hidden"
            >
              <ChevronLeft className="size-6" />
            </button>
            <Avatar conv={verConv} nombre={verConv.tipo === "privado" ? nombre(verConv.con) : ""} />
            <div className="min-w-0 flex-1 pl-1">
              <h2 className="truncate font-semibold leading-snug">
                {verConv.tipo === "asistente"
                  ? "Asistente de cultivo"
                  : verConv.tipo === "todos"
                    ? "Todos"
                    : verConv.tipo === "privado"
                      ? nombre(verConv.con)
                      : (tarea?.titulo ?? "Tarea")}
              </h2>
              <p className="truncate text-sm text-muted-foreground">
                {verConv.tipo === "asistente"
                  ? "Solo lo ves vos"
                  : verConv.tipo === "todos"
                    ? "Todo el equipo"
                    : verConv.tipo === "privado"
                      ? (() => {
                          const p = perfiles.find((x) => x.id === verConv.con)
                          return p ? `Privado · ${ROL_LABEL[p.rol]}` : "Privado"
                        })()
                      : tarea
                        ? `Tarea de ${tarea.responsable_id === yo.id ? "vos" : nombre(tarea.responsable_id)} · ${
                            tarea.estado === "problema" ? "problema avisado" : tarea.estado === "hecha" ? "hecha" : "pendiente"
                          }`
                        : "Comentarios de la tarea"}
              </p>
            </div>
          </header>

          {verConv.tipo === "asistente" ? (
            <AsistenteChat />
          ) : (
            <>
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                {verConv.tipo === "tarea" && tarea && (
                  <TarjetaTarea
                    tarea={tarea}
                    nombre={nombre}
                    puedeResolver={tarea.estado === "problema" && puedeEditarTarea(tarea, yo, perfiles)}
                    onResolver={() => resolver(tarea)}
                  />
                )}
                {mensajes.length === 0 && (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    {verConv.tipo === "tarea" ? "Todavía no hay comentarios." : "Todavía no hay mensajes. Escribí el primero."}
                  </p>
                )}
                <ol className="space-y-2">
                  {mensajes.map((m, i) => {
                    const mio = m.autor_id === yo.id
                    const dia = etiquetaDia(m.created_at)
                    const nuevoDia = i === 0 || etiquetaDia(mensajes[i - 1].created_at) !== dia
                    const grupal = verConv.tipo !== "privado"
                    return (
                      <li key={m.id}>
                        {nuevoDia && (
                          <p className="my-3 text-center">
                            <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">{dia}</span>
                          </p>
                        )}
                        <div className={cn("flex", mio ? "justify-end" : "justify-start")}>
                          <div
                            className={cn(
                              "max-w-[82%] rounded-2xl px-3.5 py-2",
                              mio ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md border bg-card",
                            )}
                          >
                            {!mio && grupal && <p className="text-xs font-semibold text-primary">{nombre(m.autor_id)}</p>}
                            <p className="whitespace-pre-line break-words text-[15px] leading-relaxed">{m.cuerpo}</p>
                            <p className={cn("mt-0.5 text-right text-[11px]", mio ? "text-primary-foreground/75" : "text-muted-foreground")}>
                              {horaCorta(m.created_at)}
                            </p>
                          </div>
                        </div>
                      </li>
                    )
                  })}
                </ol>
                {error && (
                  <p role="alert" className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {error}
                  </p>
                )}
                <div ref={fin} />
              </div>
              <Composer
                key={clave ?? ""}
                placeholder={
                  verConv.tipo === "privado"
                    ? `Escribile a ${nombre(verConv.con)}`
                    : verConv.tipo === "tarea"
                      ? "Escribí un comentario"
                      : "Escribile al equipo"
                }
                onEnviar={enviar}
              />
            </>
          )}
        </section>
      ) : (
        <div className="hidden items-center justify-center rounded-2xl border border-dashed text-muted-foreground lg:flex">
          Elegí una conversación
        </div>
      )}
    </div>
  )
}

function FilaConversacion({ fila, activa, onAbrir }: { fila: FilaChat; activa: boolean; onAbrir: () => void }) {
  const problema = fila.tipo === "tarea"
  return (
    <button
      type="button"
      onClick={onAbrir}
      aria-current={activa ? "true" : undefined}
      className={cn("flex min-h-[4.5rem] w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/60", activa && "bg-primary/5")}
    >
      {fila.tipo === "todos" ? (
        <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Users className="size-5" />
        </span>
      ) : problema ? (
        <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <CircleAlert className="size-5" />
        </span>
      ) : (
        <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-full bg-muted font-semibold">
          {fila.titulo.charAt(0)}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="min-w-0 flex-1 truncate font-semibold">{fila.titulo}</span>
          {fila.ultimoAt && (
            <span className={cn("shrink-0 text-xs", fila.sinLeer > 0 ? "font-semibold text-primary" : "text-muted-foreground")}>
              {horaCorta(fila.ultimoAt)}
            </span>
          )}
        </span>
        <span className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
            {problema && <span className="font-semibold text-destructive">Problema · </span>}
            {fila.vistaPrevia}
          </span>
          {fila.sinLeer > 0 && (
            <span className="min-w-5 shrink-0 rounded-full bg-primary px-1.5 text-center text-xs font-bold leading-5 text-primary-foreground">
              {fila.sinLeer}
              <span className="sr-only"> sin leer</span>
            </span>
          )}
        </span>
      </span>
    </button>
  )
}

function Avatar({ conv, nombre }: { conv: Conversacion; nombre: string }) {
  const base = "flex size-10 shrink-0 items-center justify-center rounded-full"
  if (conv.tipo === "asistente") {
    return (
      <span aria-hidden className={cn(base, "bg-accent/25 text-amber-800")}>
        <Leaf className="size-5" />
      </span>
    )
  }
  if (conv.tipo === "todos") {
    return (
      <span aria-hidden className={cn(base, "bg-primary/10 text-primary")}>
        <Users className="size-5" />
      </span>
    )
  }
  if (conv.tipo === "tarea") {
    return (
      <span aria-hidden className={cn(base, "bg-destructive/10 text-destructive")}>
        <CircleAlert className="size-5" />
      </span>
    )
  }
  return (
    <span aria-hidden className={cn(base, "bg-muted font-semibold")}>
      {nombre.charAt(0)}
    </span>
  )
}

function TarjetaTarea({
  tarea,
  nombre,
  puedeResolver,
  onResolver,
}: {
  tarea: Tarea
  nombre: (id: string) => string
  puedeResolver: boolean
  onResolver: () => void
}) {
  const problema = tarea.estado === "problema" || (tarea.estado === "hecha" && !!tarea.nota)
  if (!problema && !tarea.detalle) return null
  return (
    <article
      className={cn("mb-4 overflow-hidden rounded-2xl border bg-card", tarea.estado === "problema" && "border-destructive/30")}
    >
      {problema && (
        <p
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 text-sm font-semibold",
            tarea.estado === "problema" ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary",
          )}
        >
          {tarea.estado === "problema" ? <CircleAlert className="size-4" /> : <Check className="size-4" />}
          {tarea.estado === "problema"
            ? `${nombre(tarea.completada_por ?? tarea.responsable_id)} marcó un problema`
            : "Problema resuelto"}
          {tarea.completada_at && <span className="font-normal">· {horaCorta(tarea.completada_at)}</span>}
        </p>
      )}
      <div className="space-y-2 px-4 py-3">
        {tarea.nota ? (
          <p className="text-base leading-relaxed">{tarea.nota}</p>
        ) : (
          tarea.detalle && <p className="whitespace-pre-line text-[15px] leading-relaxed text-muted-foreground">{tarea.detalle}</p>
        )}
        {puedeResolver && (
          <Button variant="outline" className="h-11" onClick={onResolver}>
            <Check className="size-4" /> Marcar como resuelto
          </Button>
        )}
      </div>
    </article>
  )
}
