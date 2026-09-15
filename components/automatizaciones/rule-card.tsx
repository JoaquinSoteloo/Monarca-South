"use client"

import type { Automatizacion, DispositivoControlable } from "@/lib/types"
import type { AlertaOperativa } from "@/lib/automations/alerts"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { formatDetalleAccion } from "@/lib/automations/format"
import { resumirCondicion, condicionApagadoTexto, failSafeLabel } from "./rule-format"
import { History, Pencil, MoreVertical, Trash2, CircleAlert, AlertTriangle } from "lucide-react"

interface RuleCardProps {
  regla: Automatizacion
  dispositivo: DispositivoControlable | undefined
  pulseDeviceName: string | undefined
  alertaAsociada: AlertaOperativa | undefined
  onToggleActiva: () => void
  onHistorial: () => void
  onEditar: () => void
  onEliminar: () => void
}

export function RuleCard({
  regla: r,
  dispositivo,
  pulseDeviceName,
  alertaAsociada,
  onToggleActiva,
  onHistorial,
  onEditar,
  onEliminar,
}: RuleCardProps) {
  const detalleAccion = dispositivo ? formatDetalleAccion(dispositivo.tipo, r.accion_encendido) : ""

  return (
    <Card id={`regla-${r.id}`} className="scroll-mt-24 overflow-hidden">
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="font-semibold break-words text-foreground">{r.nombre}</span>
            <Badge
              variant="outline"
              className={r.activa ? "border-primary/30 bg-primary/5 text-primary" : "border-border bg-muted text-muted-foreground"}
            >
              {r.activa ? "Activa" : "Pausada"}
            </Badge>
            {alertaAsociada && (
              <Badge
                variant="outline"
                className={
                  alertaAsociada.nivel === "error" ? "border-red-300 bg-red-50 text-red-700" : "border-amber-300 bg-amber-50 text-amber-700"
                }
              >
                {alertaAsociada.nivel === "error" ? <CircleAlert className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                Aviso
              </Badge>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <Switch
              checked={r.activa}
              onCheckedChange={onToggleActiva}
              aria-label={r.activa ? `Pausar la regla ${r.nombre}` : `Activar la regla ${r.nombre}`}
            />
            <Button variant="ghost" size="icon-sm" onClick={onHistorial} aria-label={`Ver historial de ${r.nombre}`}>
              <History className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={onEditar} aria-label={`Editar ${r.nombre}`}>
              <Pencil className="h-4 w-4" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label={`Más acciones para ${r.nombre}`}>
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem variant="destructive" onClick={onEliminar}>
                  <Trash2 className="h-4 w-4" />
                  Eliminar
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-3">
          <div className="space-y-1 rounded-md bg-secondary/50 p-3">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Encender cuando</p>
            <p className="text-sm text-foreground">
              {resumirCondicion(r.variable, r.operador, r.valor_objetivo, Math.round(r.duracion_minima_segundos / 60))}
            </p>
          </div>
          <div className="space-y-1 rounded-md bg-secondary/50 p-3">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Acción</p>
            <p className="text-sm text-foreground">{dispositivo?.nombre ?? "Dispositivo eliminado"}</p>
            {detalleAccion && <p className="text-xs text-muted-foreground">{detalleAccion}</p>}
          </div>
          <div className="space-y-1 rounded-md bg-secondary/50 p-3">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Apagar cuando</p>
            <p className="text-sm text-foreground">{condicionApagadoTexto(r)}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
          <span>Sensor: {pulseDeviceName ?? "eliminado"}</span>
          <span>Tiempo mínimo entre acciones: {Math.round(r.cooldown_segundos / 60)} min</span>
          <span>Si faltan lecturas: {failSafeLabel(r.accion_fail_safe)}</span>
        </div>
      </CardContent>
    </Card>
  )
}
