"use client"

import { useState } from "react"
import { Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

interface Props {
  placeholder: string
  /** Manda el texto; true si salió (ahí se limpia la caja). */
  onEnviar: (texto: string) => Promise<boolean>
  deshabilitado?: boolean
  /** Para completar la caja desde afuera (las preguntas de ejemplo del asistente). */
  texto?: string
  onTexto?: (t: string) => void
}

/** La caja de escribir de abajo de cada conversación. Enter manda, Shift+Enter baja de renglón. */
export function Composer({ placeholder, onEnviar, deshabilitado, texto: textoExterno, onTexto }: Props) {
  const [textoPropio, setTextoPropio] = useState("")
  const [enviando, setEnviando] = useState(false)
  const texto = textoExterno ?? textoPropio
  const setTexto = onTexto ?? setTextoPropio

  async function enviar() {
    const cuerpo = texto.trim()
    if (!cuerpo || enviando || deshabilitado) return
    setEnviando(true)
    const ok = await onEnviar(cuerpo.slice(0, 2000))
    setEnviando(false)
    if (ok) setTexto("")
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void enviar()
      }}
      className="flex items-end gap-2 border-t bg-card p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
    >
      <label htmlFor="chat-texto" className="sr-only">
        Mensaje
      </label>
      <Textarea
        id="chat-texto"
        rows={1}
        value={texto}
        placeholder={placeholder}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault()
            void enviar()
          }
        }}
        className="max-h-32 min-h-12 flex-1 resize-none rounded-3xl bg-background px-4 py-3 text-base"
      />
      <Button
        type="submit"
        size="icon"
        className="size-12 shrink-0 rounded-full"
        disabled={!texto.trim() || enviando || deshabilitado}
        aria-label="Enviar"
      >
        <Send className="size-5" />
      </Button>
    </form>
  )
}
