"use client"

import { CheckCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { horaCorta, type Notificacion } from "@/lib/equipo"

interface Props {
  abierto: boolean
  onCerrar: () => void
  avisos: Notificacion[]
  onMarcarLeidos: (ids: number[]) => void
  onAbrir: (a: Notificacion) => void
}

/** Los avisos de la base (tareas hechas, problemas, riegos, comentarios), como estaban en Equipo. */
export function AvisosDialog({ abierto, onCerrar, avisos, onMarcarLeidos, onAbrir }: Props) {
  const sinLeer = avisos.filter((a) => !a.leida)

  return (
    <Dialog open={abierto} onOpenChange={(a) => !a && onCerrar()}>
      <DialogContent showCloseButton={false} className="max-h-[85dvh] gap-4 overflow-y-auto">
        <DialogHeader className="text-left">
          <DialogTitle>Avisos</DialogTitle>
          <DialogDescription>
            Cuando alguien que supervisás termina o marca un problema, cuando una tarea te afecta o cuando comentan en tus
            tareas.
          </DialogDescription>
        </DialogHeader>

        {sinLeer.length > 0 && (
          <Button variant="outline" className="h-11 self-start" onClick={() => onMarcarLeidos(sinLeer.map((a) => a.id))}>
            <CheckCheck className="size-4" /> Marcar todo leído
          </Button>
        )}

        {avisos.length === 0 && <p className="text-sm text-muted-foreground">No tenés avisos.</p>}
        <ul className="space-y-2">
          {avisos.map((a) => {
            const urgente = a.tipo === "tarea_problema" || a.tipo === "riego"
            return (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => onAbrir(a)}
                  className={cn(
                    "block min-h-12 w-full rounded-lg border p-3 text-left text-sm",
                    a.leida ? "text-muted-foreground" : "border-primary/40 bg-primary/5",
                    urgente && !a.leida && "border-destructive/40 bg-destructive/5",
                  )}
                >
                  <span className="flex justify-between gap-3">
                    <span className={cn("font-medium", !a.leida && "text-foreground")}>{a.titulo}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{horaCorta(a.created_at)}</span>
                  </span>
                  {a.cuerpo && <span className="mt-1 block whitespace-pre-line text-muted-foreground">{a.cuerpo}</span>}
                </button>
              </li>
            )
          })}
        </ul>

        <Button variant="ghost" className="h-11" onClick={onCerrar}>
          Cerrar
        </Button>
      </DialogContent>
    </Dialog>
  )
}
