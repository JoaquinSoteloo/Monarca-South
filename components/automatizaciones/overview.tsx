"use client"

import { cn } from "@/lib/utils"
import type { AlertaOperativa } from "@/lib/automations/alerts"
import { CircleAlert, AlertTriangle } from "lucide-react"

interface SummaryStripProps {
  reglasActivas: number
  dispositivosManual: number
  avisos: number
}

// Franja compacta de estado operativo — solo conteos derivados de datos ya
// cargados (nunca métricas inventadas). Corresponde siempre a todas las salas.
export function SummaryStrip({ reglasActivas, dispositivosManual, avisos }: SummaryStripProps) {
  const stats = [
    { label: "Reglas activas", value: reglasActivas },
    { label: "Dispositivos en manual", value: dispositivosManual },
    { label: "Avisos operativos", value: avisos, warn: avisos > 0 },
  ]
  return (
    <div>
      <div className="grid grid-cols-3 divide-x divide-border rounded-lg border border-border bg-card">
        {stats.map((s) => (
          <div key={s.label} className="px-3 py-2.5 text-center sm:px-4">
            <p className={cn("text-lg font-semibold", s.warn ? "text-amber-700" : "text-foreground")}>{s.value}</p>
            <p className="text-[11px] leading-tight text-muted-foreground sm:text-xs">{s.label}</p>
          </div>
        ))}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Corresponde a todas las salas. La ausencia de avisos no confirma que el hardware esté conectado o funcionando.
      </p>
    </div>
  )
}

interface AlertRowProps {
  alerta: AlertaOperativa
  onNavigate?: () => void
}

export function AlertRow({ alerta, onNavigate }: AlertRowProps) {
  const Icon = alerta.nivel === "error" ? CircleAlert : AlertTriangle
  const tono = alerta.nivel === "error" ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-800"

  if (!onNavigate) {
    return (
      <div className={cn("flex items-start gap-2 rounded-md px-3 py-2 text-sm", tono)}>
        <Icon className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{alerta.mensaje}</span>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={onNavigate}
      className={cn("flex w-full items-start gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors hover:brightness-95", tono)}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{alerta.mensaje}</span>
    </button>
  )
}

export function AlertList({ alertas, onNavigate }: { alertas: AlertaOperativa[]; onNavigate?: (a: AlertaOperativa) => void }) {
  if (alertas.length === 0) {
    return <p className="text-sm text-muted-foreground">Sin avisos operativos en esta sala.</p>
  }
  return (
    <div className="space-y-1.5">
      {alertas.map((a) => (
        <AlertRow key={a.id} alerta={a} onNavigate={onNavigate ? () => onNavigate(a) : undefined} />
      ))}
    </div>
  )
}
