"use client"

import { useEffect, useState } from "react"
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { LineChart as LineChartIcon } from "lucide-react"
import type { PuntoHistorialAmbiental, RangoHistorial } from "@/lib/pulse-grow/history"

// Gráficos de histórico ambiental para Monitoreo. Lee SIEMPRE de
// /api/pulse/history (lecturas_ambientales ya persistidas) — nunca dispara
// un polling histórico contra Pulse Grow en vivo.

interface PulseHistoryChartProps {
  pulseDeviceId: number
}

const MIN_PUNTOS_PARA_GRAFICAR = 2

const SERIES: { key: "temperatura_c" | "humedad_rh" | "vpd"; label: string; unidad: string; color: string }[] = [
  { key: "temperatura_c", label: "Temperatura", unidad: "°C", color: "#ef4444" },
  { key: "humedad_rh", label: "Humedad", unidad: "%", color: "#3b82f6" },
  { key: "vpd", label: "VPD", unidad: "kPa", color: "#a855f7" },
]

function formatTick(iso: string, rango: RangoHistorial): string {
  const d = new Date(iso)
  if (rango === "24h") {
    return d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })
  }
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" })
}

export function PulseHistoryChart({ pulseDeviceId }: PulseHistoryChartProps) {
  const [rango, setRango] = useState<RangoHistorial>("24h")
  const [puntos, setPuntos] = useState<PuntoHistorialAmbiental[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelado = false
    setLoading(true)
    setError(false)
    fetch(`/api/pulse/history?pulse_device_id=${pulseDeviceId}&rango=${rango}`, { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error("request_failed")
        return res.json()
      })
      .then((data: { puntos: PuntoHistorialAmbiental[] }) => {
        if (!cancelado) setPuntos(data.puntos ?? [])
      })
      .catch(() => {
        if (!cancelado) setError(true)
      })
      .finally(() => {
        if (!cancelado) setLoading(false)
      })
    return () => {
      cancelado = true
    }
  }, [pulseDeviceId, rango])

  const datosGrafico = puntos.map((p) => ({ ...p, bucketLabel: formatTick(p.bucket, rango) }))
  const hayDatosSuficientes = datosGrafico.length >= MIN_PUNTOS_PARA_GRAFICAR

  return (
    <div className="space-y-4">
      <Tabs value={rango} onValueChange={(v) => setRango(v as RangoHistorial)}>
        <TabsList className="bg-emerald-100/50">
          <TabsTrigger value="24h" className="data-[state=active]:bg-emerald-700 data-[state=active]:text-white">
            Últimas 24 horas
          </TabsTrigger>
          <TabsTrigger value="7d" className="data-[state=active]:bg-emerald-700 data-[state=active]:text-white">
            Últimos 7 días
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {loading ? (
        <div className="py-10 text-center text-sm text-muted-foreground">Cargando histórico...</div>
      ) : error ? (
        <div className="py-10 text-center text-sm text-muted-foreground">No se pudo cargar el histórico ambiental.</div>
      ) : !hayDatosSuficientes ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
          <LineChartIcon className="h-6 w-6 opacity-40" />
          <p>Todavía no hay suficientes lecturas guardadas para graficar este período.</p>
          <p className="text-xs">Las lecturas se acumulan en cada corrida del motor de automatizaciones.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {SERIES.map((serie) => (
            <div key={serie.key} className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">
                {serie.label} ({serie.unidad})
              </p>
              <ResponsiveContainer width="100%" height={140}>
                <LineChart data={datosGrafico} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                  <XAxis
                    dataKey="bucketLabel"
                    tick={{ fontSize: 10 }}
                    interval="preserveStartEnd"
                    minTickGap={30}
                    stroke="currentColor"
                    className="text-muted-foreground"
                  />
                  <YAxis
                    tick={{ fontSize: 10 }}
                    width={36}
                    domain={["auto", "auto"]}
                    stroke="currentColor"
                    className="text-muted-foreground"
                  />
                  <Tooltip
                    formatter={(value: number) => [`${Number(value).toFixed(2)} ${serie.unidad}`, serie.label]}
                    labelFormatter={(label) => label}
                    contentStyle={{
                      backgroundColor: "var(--card)",
                      borderColor: "var(--border)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey={serie.key}
                    stroke={serie.color}
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
