"use client"

import type React from "react"
import type { Automatizacion, DispositivoControlable } from "@/lib/types"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { formatEjecucionHumana, type EjecucionConComando } from "@/lib/automations/history-format"
import { CheckCircle2, CircleAlert, AlertTriangle, PowerOff } from "lucide-react"

const tipoEjecucionConfig: Record<string, { label: string; color: string; icon: React.ComponentType<{ className?: string }> }> = {
  encendido: { label: "Encendido", color: "border-emerald-300 text-emerald-700 bg-emerald-50", icon: CheckCircle2 },
  apagado: { label: "Apagado", color: "border-gray-300 text-gray-700 bg-gray-50", icon: PowerOff },
  fail_safe: { label: "Fail-safe", color: "border-amber-300 text-amber-700 bg-amber-50", icon: AlertTriangle },
  error: { label: "Error", color: "border-red-300 text-red-700 bg-red-50", icon: CircleAlert },
}

interface HistoryDialogProps {
  reglaId: number | null
  reglaNombre: string | undefined
  onOpenChange: (open: boolean) => void
  loading: boolean
  error: string | null
  historial: EjecucionConComando[]
  automatizacion: Automatizacion | null
  dispositivo: DispositivoControlable | null
}

export function HistoryDialog({ reglaId, reglaNombre, onOpenChange, loading, error, historial, automatizacion, dispositivo }: HistoryDialogProps) {
  return (
    <Dialog open={reglaId !== null} onOpenChange={(open) => !open && onOpenChange(false)}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 p-0 sm:max-w-[840px]">
        <div className="border-b border-border p-6 pb-4">
          <DialogHeader>
            <DialogTitle>Historial de ejecuciones</DialogTitle>
          </DialogHeader>
          {reglaNombre && <p className="mt-1 text-sm text-muted-foreground">Regla: {reglaNombre}</p>}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <p className="py-6 text-center text-muted-foreground">Cargando...</p>
          ) : error ? (
            <p className="py-6 text-center text-red-700">{error}</p>
          ) : historial.length === 0 ? (
            <p className="py-6 text-center text-muted-foreground">Todavía no hay ejecuciones registradas para esta regla.</p>
          ) : (
            <div className="space-y-3">
              {historial.map((h) => {
                const cfg = tipoEjecucionConfig[h.tipo]
                const Icon = cfg.icon
                const comandoRaw = h.comando as unknown
                const comando = Array.isArray(comandoRaw) ? (comandoRaw[0] ?? null) : (comandoRaw ?? null)
                const evento = formatEjecucionHumana({ ...h, comando }, automatizacion, dispositivo)

                return (
                  <div key={h.id} className="border-b border-border pb-3 text-sm last:border-0">
                    <div className="flex items-center justify-between gap-3">
                      <Badge variant="outline" className={cfg.color}>
                        <Icon className="h-3 w-3" />
                        {cfg.label}
                      </Badge>
                      <span className="text-xs whitespace-nowrap text-muted-foreground">
                        {new Date(h.creado_en).toLocaleString("es-AR", { hour12: false })}
                      </span>
                    </div>
                    <ul className="mt-1.5 space-y-0.5 text-foreground">
                      {evento.lineas.map((linea, i) => (
                        <li key={i}>{linea}</li>
                      ))}
                    </ul>
                    {evento.tecnico && (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-xs text-muted-foreground">Detalle técnico</summary>
                        <p className="mt-1 text-xs text-muted-foreground italic">{evento.tecnico}</p>
                      </details>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
