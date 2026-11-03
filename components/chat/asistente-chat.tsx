"use client"

import { useEffect, useRef, useState } from "react"
import { Leaf } from "lucide-react"
import { horaCorta } from "@/lib/equipo"
import { Composer } from "@/components/chat/composer"

interface MensajeAsistente {
  rol: "user" | "assistant"
  cuerpo: string
  created_at: string
}

/** Preguntas de ejemplo que había puesto Facundo en la Sede. */
const EJEMPLOS = [
  "¿Qué EC uso en la Sala 5 hoy?",
  "Las hojas de abajo se ponen amarillas, ¿qué puede ser?",
  "¿En qué orden van los productos en el tanque?",
]

/** La conversación de cada uno con el asistente de cultivo (app/api/asistente, script 088). */
export function AsistenteChat() {
  const [mensajes, setMensajes] = useState<MensajeAsistente[] | null>(null)
  const [pensando, setPensando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [texto, setTexto] = useState("")
  const fin = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch("/api/asistente")
      .then((r) => (r.ok ? r.json() : { mensajes: [] }))
      .then((d: { mensajes?: MensajeAsistente[] }) => setMensajes(d.mensajes ?? []))
      .catch(() => setMensajes([]))
  }, [])

  useEffect(() => {
    fin.current?.scrollIntoView({ block: "end" })
  }, [mensajes?.length, pensando])

  async function preguntar(pregunta: string): Promise<boolean> {
    setError(null)
    setMensajes((ms) => [...(ms ?? []), { rol: "user", cuerpo: pregunta, created_at: new Date().toISOString() }])
    setPensando(true)
    try {
      const r = await fetch("/api/asistente", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mensaje: pregunta }),
      })
      const d = (await r.json().catch(() => ({}))) as { respuesta?: string; error?: string }
      if (!r.ok || !d.respuesta) throw new Error(d.error || "El asistente no pudo responder ahora.")
      const respuesta = d.respuesta
      setMensajes((ms) => [...(ms ?? []), { rol: "assistant", cuerpo: respuesta, created_at: new Date().toISOString() }])
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : "El asistente no pudo responder ahora.")
      return true
    } finally {
      setPensando(false)
    }
  }

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {mensajes === null && <p className="text-center text-sm text-muted-foreground">Cargando…</p>}
        {mensajes?.length === 0 && (
          <div className="mx-auto flex max-w-sm flex-col items-center gap-3 py-6 text-center">
            <span aria-hidden className="flex size-16 items-center justify-center rounded-full bg-accent/25 text-amber-800">
              <Leaf className="size-8" />
            </span>
            <h2 className="text-xl font-semibold">Preguntale lo que necesites del cultivo</h2>
            <p className="text-[15px] text-muted-foreground">
              Conoce los manuales de Monarca y mira las salas y los últimos riegos antes de responder. Lo importante,
              confirmalo con Lucho.
            </p>
            <div className="mt-2 flex w-full flex-col gap-2 text-left">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Por ejemplo</p>
              {EJEMPLOS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setTexto(e)}
                  className="min-h-12 rounded-xl border bg-card px-4 py-3 text-left text-[15px] hover:bg-muted"
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
        )}
        <ul className="space-y-2">
          {(mensajes ?? []).map((m, i) => {
            const mio = m.rol === "user"
            return (
              <li key={i} className={mio ? "flex justify-end" : "flex justify-start"}>
                <div
                  className={
                    mio
                      ? "max-w-[85%] rounded-2xl rounded-br-md bg-primary px-3.5 py-2 text-primary-foreground"
                      : "max-w-[85%] rounded-2xl rounded-bl-md border bg-card px-3.5 py-2"
                  }
                >
                  <p className="whitespace-pre-line break-words text-[15px] leading-relaxed">{m.cuerpo}</p>
                  <p className={mio ? "mt-0.5 text-right text-[11px] text-primary-foreground/75" : "mt-0.5 text-right text-[11px] text-muted-foreground"}>
                    {horaCorta(m.created_at)}
                  </p>
                </div>
              </li>
            )
          })}
          {pensando && (
            <li className="flex justify-start" aria-live="polite">
              <p className="rounded-2xl rounded-bl-md border bg-card px-3.5 py-2 text-[15px] text-muted-foreground">Pensando…</p>
            </li>
          )}
        </ul>
        {error && (
          <p role="alert" className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        <div ref={fin} />
      </div>
      <Composer
        placeholder="Escribí tu pregunta"
        onEnviar={preguntar}
        deshabilitado={pensando}
        texto={texto}
        onTexto={setTexto}
      />
    </>
  )
}
