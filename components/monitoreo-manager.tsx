"use client"

import type React from "react"
import { useCallback, useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import type { PulseDevice } from "@/lib/types"
import type { PulseDeviceSnapshot } from "@/lib/pulse-grow/types"
import { formatMinutesAgo } from "@/lib/pulse-grow/format"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { PulseHistoryChart } from "@/components/pulse-history-chart"
import {
  Thermometer,
  Droplets,
  Gauge,
  Sun,
  CloudDrizzle,
  Wind,
  RefreshCw,
  MapPin,
  AlertTriangle,
  CheckCircle2,
  CircleAlert,
  Battery,
  Plug,
  LineChart,
} from "lucide-react"

interface Sala {
  id: number
  nombre: string
}

interface MonitoreoManagerProps {
  initialDevices: PulseDevice[]
  salas: Sala[]
}

// Este componente NUNCA llama a Pulse Grow directamente: toda lectura pasa
// por nuestro propio backend (/api/pulse/*), que es el único lugar que
// conoce PULSE_GROW_API_KEY.
//
// `devices` (el JSON de GET /api/pulse/devices) es la ÚNICA fuente de verdad
// para lo que se renderiza. `initialDevices` (prop del Server Component) solo
// se usa para pintar algo mientras se resuelve el primer fetch — nunca se
// vuelve a leer después del mount, así que no hace falta mantenerla en sync
// con router.refresh().

// Refresco automático conservador: con pocos dispositivos y este intervalo
// se consumen muy pocos datapoints/día del cupo de Pulse, dejando margen
// para refrescos manuales y sincronizaciones de catálogo.
const AUTO_REFRESH_MS = 5 * 60 * 1000

function toInitialSnapshot(d: PulseDevice): PulseDeviceSnapshot {
  return {
    id: d.id,
    name: d.name,
    sala: d.sala ? { id: d.sala.id, nombre: d.sala.nombre } : null,
    reading: null,
    status: "sin_datos",
    error: null,
  }
}

export function MonitoreoManager({ initialDevices, salas }: MonitoreoManagerProps) {
  const [devices, setDevices] = useState<PulseDeviceSnapshot[]>(() => initialDevices.map(toInitialSnapshot))
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [syncMessage, setSyncMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(null)
  const [historialDeviceId, setHistorialDeviceId] = useState<number | null>(null)

  const fetchReadings = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/pulse/devices", { cache: "no-store" })
      if (!res.ok) throw new Error("request_failed")
      const data: { devices: PulseDeviceSnapshot[] } = await res.json()
      setDevices(data.devices)
      setLastFetchedAt(new Date())
    } catch (err) {
      console.error("[monitoreo] Error obteniendo lecturas:", err)
      setError("No se pudo cargar el monitoreo ambiental. Reintentá en unos minutos.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchReadings()
    const interval = setInterval(fetchReadings, AUTO_REFRESH_MS)
    return () => clearInterval(interval)
  }, [fetchReadings])

  const handleSync = async () => {
    setSyncing(true)
    setSyncMessage(null)
    try {
      const res = await fetch("/api/pulse/sync", { method: "POST" })
      if (!res.ok) throw new Error("sync_failed")
      const data: { success: boolean; count: number } = await res.json()
      await fetchReadings()
      setSyncMessage({
        type: "success",
        text: `${data.count} dispositivo${data.count === 1 ? "" : "s"} sincronizado${data.count === 1 ? "" : "s"}`,
      })
    } catch (err) {
      console.error("[monitoreo] Error sincronizando con Pulse:", err)
      setSyncMessage({
        type: "error",
        text: "No se pudo sincronizar con Pulse Grow. Intentá de nuevo en unos minutos.",
      })
    } finally {
      setSyncing(false)
    }
  }

  const handleAssignSala = async (deviceId: number, salaId: number | null) => {
    const supabase = createClient()
    const { error: updateError } = await supabase
      .from("pulse_devices")
      .update({ sala_id: salaId, updated_at: new Date().toISOString() })
      .eq("id", deviceId)

    if (updateError) {
      console.error("[monitoreo] Error asignando sala:", updateError)
      return
    }

    const sala = salaId ? salas.find((s) => s.id === salaId) ?? null : null
    setDevices((prev) => prev.map((d) => (d.id === deviceId ? { ...d, sala } : d)))
  }

  const allFailed = !loading && devices.length > 0 && devices.every((d) => d.error)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {lastFetchedAt
            ? `Actualizado a las ${lastFetchedAt.toLocaleTimeString("es-AR", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}`
            : "Cargando..."}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleSync} disabled={syncing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Sincronizando..." : "Sincronizar con Pulse"}
          </Button>
          <Button onClick={fetchReadings} disabled={loading} className="bg-emerald-600 hover:bg-emerald-700">
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            {loading ? "Actualizando..." : "Actualizar ahora"}
          </Button>
        </div>
      </div>

      {syncMessage && (
        <Alert
          variant={syncMessage.type === "error" ? "destructive" : "default"}
          className={syncMessage.type === "success" ? "border-emerald-300 bg-emerald-50 text-emerald-800" : undefined}
        >
          {syncMessage.type === "success" ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          <AlertTitle>{syncMessage.type === "success" ? "Sincronización completa" : "Error"}</AlertTitle>
          <AlertDescription>{syncMessage.text}</AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!error && allFailed && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Pulse Grow no responde</AlertTitle>
          <AlertDescription>
            No se pudo obtener ninguna lectura en este momento (puede ser un corte temporal de Pulse Grow o un
            problema con la API key). Se muestra el último estado conocido de cada dispositivo.
          </AlertDescription>
        </Alert>
      )}

      {loading && devices.length === 0 ? (
        <Card className="bg-card border-border">
          <CardContent className="py-10 text-center text-muted-foreground">Cargando dispositivos...</CardContent>
        </Card>
      ) : !loading && devices.length === 0 ? (
        <Card className="bg-card border-border">
          <CardContent className="py-10 text-center space-y-4">
            <p className="text-muted-foreground">Todavía no hay dispositivos Pulse sincronizados en el sistema.</p>
            <Button onClick={handleSync} disabled={syncing} className="bg-emerald-600 hover:bg-emerald-700">
              <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
              Sincronizar con Pulse
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {devices.map((device) => {
            const reading = device.reading

            return (
              <Card key={device.id} className="bg-card border-border">
                <CardHeader className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-foreground text-lg">{device.sala?.nombre || device.name}</CardTitle>
                      {device.sala && <p className="text-xs text-muted-foreground">{device.name}</p>}
                    </div>
                    <StatusBadge status={device.status} />
                  </div>

                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                    <Select
                      value={device.sala ? String(device.sala.id) : "none"}
                      onValueChange={(value) => handleAssignSala(device.id, value === "none" ? null : Number(value))}
                    >
                      <SelectTrigger className="h-8 text-xs bg-background border-border">
                        <SelectValue placeholder="Sin asignar" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sin asignar</SelectItem>
                        {salas.map((sala) => (
                          <SelectItem key={sala.id} value={String(sala.id)}>
                            {sala.nombre}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  {reading ? (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <MetricTile
                          icon={Thermometer}
                          label="Temperatura"
                          value={`${reading.temperatureC.toFixed(1)}°C`}
                          color="text-red-500"
                        />
                        <MetricTile
                          icon={Droplets}
                          label="Humedad"
                          value={`${reading.humidityRh.toFixed(0)}%`}
                          color="text-blue-500"
                        />
                        <MetricTile
                          icon={Gauge}
                          label="VPD"
                          value={`${reading.vpd.toFixed(2)} kPa`}
                          color="text-purple-500"
                        />
                        <MetricTile
                          icon={Sun}
                          label="Luz"
                          value={`${reading.lightLux.toFixed(0)} lux`}
                          color="text-amber-500"
                        />
                        <MetricTile
                          icon={CloudDrizzle}
                          label="Dew Point"
                          value={`${reading.dewPointC.toFixed(1)}°C`}
                          color="text-cyan-500"
                        />
                        <MetricTile
                          icon={Wind}
                          label="Presión"
                          value={`${reading.airPressureHpa.toFixed(1)} hPa`}
                          color="text-slate-500"
                        />
                      </div>

                      <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-border">
                        <span className="flex items-center gap-1">
                          {reading.pluggedIn ? <Plug className="h-3.5 w-3.5" /> : <Battery className="h-3.5 w-3.5" />}
                          {reading.pluggedIn ? "Conectado a corriente" : `Batería ${reading.batteryV.toFixed(1)}V`}
                        </span>
                        <span>{formatMinutesAgo(reading.createdAt)}</span>
                      </div>

                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={() => setHistorialDeviceId(device.id)}
                      >
                        <LineChart className="h-3.5 w-3.5 mr-2" />
                        Ver histórico
                      </Button>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground py-6 text-center">
                      {device.error ? "No se pudo obtener la lectura de este dispositivo." : "Cargando lectura..."}
                    </p>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <Dialog open={historialDeviceId !== null} onOpenChange={(open) => !open && setHistorialDeviceId(null)}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {devices.find((d) => d.id === historialDeviceId)?.sala?.nombre ??
                devices.find((d) => d.id === historialDeviceId)?.name ??
                "Histórico ambiental"}
            </DialogTitle>
          </DialogHeader>
          {historialDeviceId !== null && <PulseHistoryChart pulseDeviceId={historialDeviceId} />}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function StatusBadge({ status }: { status: PulseDeviceSnapshot["status"] }) {
  if (status === "conectado") {
    return (
      <Badge variant="outline" className="border-emerald-300 text-emerald-700 bg-emerald-50">
        <CheckCircle2 className="h-3 w-3" />
        Conectado
      </Badge>
    )
  }
  if (status === "atencion") {
    return (
      <Badge variant="outline" className="border-amber-300 text-amber-700 bg-amber-50">
        <CircleAlert className="h-3 w-3" />
        Dato con demora
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="border-red-300 text-red-700 bg-red-50">
      <CircleAlert className="h-3 w-3" />
      Sin datos recientes
    </Badge>
  )
}

function MetricTile({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  color: string
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-background/50 px-3 py-2">
      <Icon className={`h-4 w-4 shrink-0 ${color}`} />
      <div className="min-w-0">
        <p className="text-[11px] text-muted-foreground leading-none">{label}</p>
        <p className="text-sm font-semibold text-foreground leading-tight">{value}</p>
      </div>
    </div>
  )
}
