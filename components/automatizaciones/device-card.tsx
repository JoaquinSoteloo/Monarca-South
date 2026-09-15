"use client"

import { cn } from "@/lib/utils"
import type { DispositivoControlable, ModoDispositivo } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { formatComandoDispositivo } from "@/lib/automations/format"
import { tipoDispositivoConfig, comandoEstadoConfig, origenComandoLabels, formatMinutesAgo } from "@/lib/device-ui-config"
import { Pencil, MoreVertical, Trash2, Power, PowerOff, Clock } from "lucide-react"

interface DeviceCardProps {
  dispositivo: DispositivoControlable
  onEditar: () => void
  onEliminar: () => void
  onSetModo: (modo: ModoDispositivo) => void
  onComando: (accion: "encender" | "apagar") => void
}

function ModoSegmented({ modo, onChange }: { modo: ModoDispositivo; onChange: (m: ModoDispositivo) => void }) {
  const opciones: { value: ModoDispositivo; label: string }[] = [
    { value: "automatico", label: "Automático" },
    { value: "manual", label: "Manual" },
  ]
  return (
    <div className="inline-flex rounded-md border border-border bg-muted p-0.5" role="group" aria-label="Modo del dispositivo">
      {opciones.map((op) => (
        <button
          key={op.value}
          type="button"
          aria-pressed={modo === op.value}
          onClick={() => {
            if (modo !== op.value) onChange(op.value)
          }}
          className={cn(
            "min-h-9 rounded-sm px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            modo === op.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {op.label}
        </button>
      ))}
    </div>
  )
}

export function DeviceCard({ dispositivo: d, onEditar, onEliminar, onSetModo, onComando }: DeviceCardProps) {
  const TipoIcon = tipoDispositivoConfig[d.tipo].icon
  const estadoCfg = d.ultimo_comando_estado ? comandoEstadoConfig[d.ultimo_comando_estado] : null
  const EstadoIcon = estadoCfg?.icon ?? Clock
  const esSimulacion = d.proveedor === "manual_noop"

  return (
    <Card id={`dispositivo-${d.id}`} className="scroll-mt-24 overflow-hidden">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-start gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-emerald-50 text-primary">
              <TipoIcon className="h-4.5 w-4.5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <p className="font-medium break-words text-foreground">{d.nombre}</p>
                {esSimulacion && (
                  <Badge variant="outline" className="border-accent/40 bg-accent/10 text-[10px] text-accent-foreground">
                    Simulación
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{tipoDispositivoConfig[d.tipo].label}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button variant="ghost" size="icon-sm" onClick={onEditar} aria-label={`Editar ${d.nombre}`}>
              <Pencil className="h-4 w-4" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label={`Más acciones para ${d.nombre}`}>
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

        <ModoSegmented modo={d.modo} onChange={onSetModo} />

        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="space-y-0.5">
            <p className="text-xs text-muted-foreground">Estado esperado</p>
            <p className="font-medium text-foreground">
              {d.ultimo_comando_payload ? formatComandoDispositivo(d.tipo, d.ultimo_comando_payload) : "Sin comandos todavía"}
            </p>
          </div>
          <div className="space-y-0.5">
            <p className="text-xs text-muted-foreground">Último comando</p>
            {d.ultimo_comando_en ? (
              <div className="flex flex-wrap items-center gap-1.5">
                {estadoCfg && (
                  <Badge variant="outline" className={estadoCfg.color}>
                    <EstadoIcon className="h-3 w-3" />
                    {estadoCfg.label}
                  </Badge>
                )}
                <span className="text-xs text-muted-foreground">
                  {formatMinutesAgo(d.ultimo_comando_en)}
                  {d.ultimo_comando_origen ? ` · ${origenComandoLabels[d.ultimo_comando_origen]}` : ""}
                </span>
              </div>
            ) : (
              <p className="text-muted-foreground">Sin comandos todavía</p>
            )}
          </div>
        </div>

        <div className="rounded-md border border-dashed border-border p-2.5">
          <p className="text-xs text-muted-foreground">Estado confirmado</p>
          {d.soporta_feedback && d.ultimo_estado_confirmado_payload ? (
            <p className="text-sm font-medium text-foreground">
              {formatComandoDispositivo(d.tipo, d.ultimo_estado_confirmado_payload)} · {formatMinutesAgo(d.ultimo_estado_confirmado_en)}
            </p>
          ) : (
            <>
              <p className="text-sm font-medium text-muted-foreground">Estado real no disponible</p>
              <p className="text-xs text-muted-foreground">
                {d.soporta_feedback
                  ? "Todavía no llegó ninguna confirmación del equipo."
                  : esSimulacion
                    ? "Simulación: no controla hardware real, no hay estado que confirmar."
                    : "Control unidireccional: este proveedor no puede confirmar si el equipo cambió de verdad."}
              </p>
            </>
          )}
        </div>

        {d.modo === "manual" && (
          <div className="flex gap-2 border-t border-border pt-3">
            <Button size="sm" variant="outline" className="min-h-9 flex-1" onClick={() => onComando("encender")}>
              <Power className="h-3.5 w-3.5" />
              Encender
            </Button>
            <Button size="sm" variant="outline" className="min-h-9 flex-1" onClick={() => onComando("apagar")}>
              <PowerOff className="h-3.5 w-3.5" />
              Apagar
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
