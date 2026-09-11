// Config visual compartida entre el panel de Automatizaciones
// (components/automatizaciones-manager.tsx) y el de Control manual
// (components/control-manual.tsx) — mismo ícono/etiqueta por tipo de
// dispositivo y misma lectura de estado de comando en los dos lados, para
// que "Estado esperado" / "Último comando" / "Estado real" nunca diverjan
// entre pantallas.
import type React from "react"
import { Snowflake, Fan, Droplets, Zap, Clock, RefreshCw, CheckCircle2, CircleAlert } from "lucide-react"
import type { TipoDispositivoControlable } from "@/lib/types"

export const tipoDispositivoConfig: Record<
  TipoDispositivoControlable,
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  aire_acondicionado: { label: "Aire acondicionado", icon: Snowflake },
  extractor: { label: "Extractor", icon: Fan },
  humidificador: { label: "Humidificador", icon: Droplets },
  deshumidificador: { label: "Deshumidificador", icon: Droplets },
  otro: { label: "Otro", icon: Zap },
}

export const comandoEstadoConfig: Record<
  string,
  { label: string; color: string; icon: React.ComponentType<{ className?: string }> }
> = {
  pendiente: { label: "Pendiente", color: "border-amber-300 text-amber-700 bg-amber-50", icon: Clock },
  en_proceso: { label: "En proceso", color: "border-amber-300 text-amber-700 bg-amber-50", icon: RefreshCw },
  ejecutado: { label: "Ejecutado", color: "border-emerald-300 text-emerald-700 bg-emerald-50", icon: CheckCircle2 },
  fallido: { label: "Fallido", color: "border-red-300 text-red-700 bg-red-50", icon: CircleAlert },
  timeout: { label: "Timeout", color: "border-red-300 text-red-700 bg-red-50", icon: CircleAlert },
  cancelado: { label: "Cancelado", color: "border-gray-300 text-gray-700 bg-gray-50", icon: CircleAlert },
}

export const origenComandoLabels: Record<string, string> = {
  automatizacion: "por automatización",
  manual: "manual",
  sistema: "sistema",
}

export function formatMinutesAgo(iso: string | null): string {
  if (!iso) return "nunca"
  const minutes = (Date.now() - new Date(iso).getTime()) / 60000
  if (minutes < 1) return "hace instantes"
  if (minutes < 60) return `hace ${Math.round(minutes)} min`
  return `hace ${Math.round(minutes / 60)} h`
}
