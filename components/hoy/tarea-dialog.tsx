"use client"

import Link from "next/link"
import { Check, CircleAlert, ClipboardList, MessageCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { horaCorta, type Perfil, type Tarea } from "@/lib/equipo"
import { listaNombres, puedeEditarTarea } from "@/lib/hoy"

interface Props {
  tarea: Tarea | null
  yo: Perfil
  perfiles: Perfil[]
  guardando: boolean
  onCerrar: () => void
  onHecha: (t: Tarea) => void
  onProblema: (t: Tarea) => void
  onResuelto: (t: Tarea) => void
  onPendiente: (t: Tarea) => void
}

/** Detalle de una tarea con lo que se puede hacer con ella; los comentarios están en el chat. */
export function TareaDialog({ tarea, yo, perfiles, guardando, onCerrar, onHecha, onProblema, onResuelto, onPendiente }: Props) {
  const nombre = (id: string | null) => perfiles.find((p) => p.id === id)?.nombre ?? "—"
  const puede = tarea ? puedeEditarTarea(tarea, yo, perfiles) : false

  let estado = ""
  if (tarea) {
    const de = tarea.responsable_id === yo.id ? "Tuya" : `De ${nombre(tarea.responsable_id)}`
    const cuando = tarea.completada_at ? ` a las ${horaCorta(tarea.completada_at)}` : ""
    const quien = tarea.completada_por && tarea.completada_por !== tarea.responsable_id ? ` por ${nombre(tarea.completada_por)}` : ""
    estado =
      tarea.estado === "hecha"
        ? `${de} · hecha${cuando}${quien}`
        : tarea.estado === "problema"
          ? `${de} · problema avisado${cuando}`
          : `${de} · pendiente`
  }

  return (
    <Dialog open={!!tarea} onOpenChange={(abierto) => !abierto && onCerrar()}>
      <DialogContent showCloseButton={false} className="gap-5">
        {tarea && (
          <>
            <DialogHeader className="text-left">
              <p className="text-sm text-muted-foreground">{estado}</p>
              <DialogTitle className="text-xl leading-snug">{tarea.titulo}</DialogTitle>
              {tarea.detalle ? (
                <DialogDescription className="whitespace-pre-line text-[15px] leading-relaxed">{tarea.detalle}</DialogDescription>
              ) : (
                <DialogDescription className="sr-only">Detalle de la tarea</DialogDescription>
              )}
            </DialogHeader>

            {tarea.estado === "problema" && tarea.nota && (
              <p className="rounded-lg bg-destructive/10 px-4 py-3 text-destructive">«{tarea.nota}»</p>
            )}
            {(tarea.afecta_a.length > 0 || tarea.creada_por) && (
              <p className="text-sm text-muted-foreground">
                {tarea.creada_por && `Cargada por ${nombre(tarea.creada_por)}. `}
                {tarea.afecta_a.length > 0 && `Afecta a ${listaNombres(tarea.afecta_a.map(nombre))}.`}
              </p>
            )}

            <div className="flex flex-col gap-2">
              {puede && tarea.estado === "pendiente" && !tarea.proceso_paso_id && (
                <div className="flex gap-2">
                  <Button className="h-12 flex-[1.3] text-base" disabled={guardando} onClick={() => onHecha(tarea)}>
                    <Check className="size-5" /> Hecha
                  </Button>
                  <Button
                    variant="outline"
                    className="h-12 flex-1 text-base text-destructive hover:text-destructive"
                    onClick={() => onProblema(tarea)}
                  >
                    <CircleAlert className="size-5" /> Problema
                  </Button>
                </div>
              )}
              {puede && tarea.estado === "pendiente" && tarea.proceso_paso_id && (
                <Button className="h-12 text-base" onClick={() => onHecha(tarea)}>
                  <ClipboardList className="size-5" /> Completar el formulario
                </Button>
              )}
              {puede && tarea.estado === "problema" && (
                <Button className="h-12 text-base" disabled={guardando} onClick={() => onResuelto(tarea)}>
                  <Check className="size-5" /> Marcar como resuelto
                </Button>
              )}
              {puede && tarea.estado === "hecha" && !tarea.proceso_paso_id && (
                <Button variant="outline" className="h-12 text-base" disabled={guardando} onClick={() => onPendiente(tarea)}>
                  Volver a pendiente
                </Button>
              )}
              <Button variant="outline" asChild className="h-12 text-base">
                <Link href={`/chat?c=t:${tarea.id}`}>
                  <MessageCircle className="size-5" /> Comentarios
                </Link>
              </Button>
              <Button variant="ghost" className="h-11" onClick={onCerrar}>
                Cerrar
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
