"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { Perfil, Tarea } from "@/lib/equipo"
import { destinatariosProblema, listaNombres } from "@/lib/hoy"

interface Props {
  tarea: Tarea | null
  yo: Perfil
  perfiles: Perfil[]
  onCerrar: () => void
  /** Guarda el problema; true si salió bien (ahí se cierra). */
  onAvisar: (tarea: Tarea, nota: string) => Promise<boolean>
}

/**
 * Hoja corta para avisar un problema en una tarea: qué pasó y a quién le llega.
 * Quien la usa le pone `key` con la tarea, así cada una arranca en blanco.
 */
export function ProblemaDialog({ tarea, yo, perfiles, onCerrar, onAvisar }: Props) {
  const [nota, setNota] = useState("")
  const [enviando, setEnviando] = useState(false)

  const nombres = tarea ? destinatariosProblema(tarea, perfiles, yo.id).map((p) => p.nombre) : []

  async function avisar() {
    if (!tarea || !nota.trim()) return
    setEnviando(true)
    const ok = await onAvisar(tarea, nota.trim())
    setEnviando(false)
    if (ok) onCerrar()
  }

  return (
    <Dialog open={!!tarea} onOpenChange={(abierto) => !abierto && onCerrar()}>
      <DialogContent showCloseButton={false} className="gap-5">
        <DialogHeader className="text-left">
          <DialogTitle>Avisar un problema</DialogTitle>
          <DialogDescription className="text-base font-medium text-foreground">{tarea?.titulo}</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="que-paso" className="text-base">
            ¿Qué pasó?
          </Label>
          <Textarea
            id="que-paso"
            rows={5}
            autoFocus
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Contá qué viste y dónde: sala, planta, qué tiene."
            className="text-base"
          />
        </div>

        {nombres.length > 0 && (
          <div className="flex items-center gap-3 rounded-lg bg-primary/10 px-4 py-3 text-primary">
            <span
              aria-hidden
              className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground"
            >
              {nombres[0].charAt(0)}
            </span>
            <div>
              <p className="font-semibold">Le llega a {listaNombres(nombres)}</p>
              <p className="text-sm">Te pueden responder en el chat, dentro de la tarea.</p>
            </div>
          </div>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" className="h-11" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button className="h-12 text-base" disabled={!nota.trim() || enviando} onClick={avisar}>
            {enviando ? "Avisando…" : "Avisar el problema"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
