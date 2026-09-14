"use client"

import type React from "react"
import { useCallback, useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import type { PulseDevice } from "@/lib/types"
import type { PulseDeviceConnectionStatus, PulseDeviceSnapshot } from "@/lib/pulse-grow/types"
import { formatMinutesAgo } from "@/lib/pulse-grow/format"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
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
  CircleDashed,
  Battery,
  Plug,
  LineChart,
  HelpCircle,
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
const AUTO_REFRESH_MIN = Math.round(AUTO_REFRESH_MS / 60000)

// Snapshot + un dato puramente de presentación: si la última consulta falló
// para este dispositivo pero ya teníamos una lectura previa en pantalla, la
// conservamos (en vez de reemplazarla por null) y marcamos que es una
// lectura vieja. `status`/`error` siguen siendo exactamente lo que devolvió
// el backend en el fetch más reciente — no se tocan los cálculos de umbral.
interface DeviceViewState extends PulseDeviceSnapshot {
  mostrandoLecturaAnterior?: boolean
}

function toInitialSnapshot(d: PulseDevice): DeviceViewState {
  return {
    id: d.id,
    name: d.name,
    sala: d.sala ? { id: d.sala.id, nombre: d.sala.nombre } : null,
    reading: null,
    status: "sin_datos",
    error: null,
  }
}

// Formato numérico argentino (coma decimal) con precisión fija por medición.
function formatNum(value: number, decimals: number): string {
  return value.toLocaleString("es-AR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

// Colores fijos por variable (no por sala, no por estado): identifican qué
// mide cada tile, nunca si el valor es "bueno" o "malo" — no definimos
// rangos ambientales. Se usan como color literal (no tokens del tema) porque
// deben verse igual en claro y oscuro sobre estas superficies pastel fijas.
const METRIC_TINTS = {
  temperatura: { bg: "#FBEEE7", icon: "#A45232" },
  humedad: { bg: "#EAF2F8", icon: "#356B8C" },
  luz: { bg: "#FAF2DA", icon: "#896719" },
} as const

// Carbón fijo para los valores sobre las superficies pastel de arriba: no
// puede depender del tema (claro/oscuro) porque esos fondos tampoco dependen.
const METRIC_TEXT_DARK = "#202923"

export function MonitoreoManager({ initialDevices, salas }: MonitoreoManagerProps) {
  const [devices, setDevices] = useState<DeviceViewState[]>(() => initialDevices.map(toInitialSnapshot))
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [syncMessage, setSyncMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(null)
  const [historialDeviceId, setHistorialDeviceId] = useState<number | null>(null)
  const [salaEditorDeviceId, setSalaEditorDeviceId] = useState<number | null>(null)

  const fetchReadings = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/pulse/devices", { cache: "no-store" })
      if (!res.ok) throw new Error("request_failed")
      const data: { devices: PulseDeviceSnapshot[] } = await res.json()
      setDevices((prev) => {
        const anteriores = new Map(prev.map((d) => [d.id, d]))
        return data.devices.map((next): DeviceViewState => {
          // Si esta consulta falló para el dispositivo y no trajo lectura,
          // pero había una lectura previa visible, la mantenemos: nunca se
          // reemplaza un dato bueno por ceros o por "nada" solo porque el
          // último fetch no respondió.
          if (next.error && !next.reading) {
            const anterior = anteriores.get(next.id)
            if (anterior?.reading) {
              return { ...next, reading: anterior.reading, mostrandoLecturaAnterior: true }
            }
          }
          return next
        })
      })
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
    setSalaEditorDeviceId(null)
  }

  const allFailed = !loading && devices.length > 0 && devices.every((d) => d.error)
  const hayLecturaPrevia = devices.some((d) => d.reading)
  const historialDevice = devices.find((d) => d.id === historialDeviceId) ?? null

  return (
    <div className="space-y-6">
      {/* Encabezado unificado: título, estado de la última consulta y acciones */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-[26px] font-semibold leading-tight text-foreground">Monitoreo ambiental</h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span>
              {lastFetchedAt
                ? `Última consulta: ${lastFetchedAt.toLocaleTimeString("es-AR", {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                    hour12: false,
                  })}`
                : "Consultando Pulse Grow..."}
            </span>
            <span className="text-xs text-muted-foreground/80">
              Actualización automática cada {AUTO_REFRESH_MIN} minutos
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleSync} disabled={syncing} className="bg-card">
            <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Sincronizando..." : "Sincronizar dispositivos"}
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label="Qué hace Sincronizar dispositivos"
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-primary/10 hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
              >
                <HelpCircle className="h-4 w-4" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="monarca-theme w-64 bg-card text-sm text-foreground" align="end">
              Sincronizar actualiza el catálogo de dispositivos de Pulse (altas y bajas); no actualiza las lecturas.
            </PopoverContent>
          </Popover>
          <Button onClick={fetchReadings} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            {loading ? "Actualizando..." : "Actualizar ahora"}
          </Button>
        </div>
      </div>

      {syncMessage && (
        <Alert
          variant={syncMessage.type === "error" ? "destructive" : "default"}
          className={syncMessage.type === "success" ? "border-primary/30 bg-primary/5 text-primary" : undefined}
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

      {!error && allFailed && hayLecturaPrevia && (
        <Alert className="border-destructive/20 bg-destructive/5 text-destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>No se pudieron actualizar las lecturas</AlertTitle>
          <AlertDescription className="text-destructive/90">Se muestran los últimos datos disponibles.</AlertDescription>
        </Alert>
      )}

      {!error && allFailed && !hayLecturaPrevia && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Pulse Grow no responde</AlertTitle>
          <AlertDescription>
            No se pudo obtener ninguna lectura en este momento (puede ser un corte temporal de Pulse Grow o un
            problema con la API key).
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
            <Button onClick={handleSync} disabled={syncing}>
              <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
              Sincronizar dispositivos
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-5 xl:grid-cols-2">
          {devices.map((device) => (
            <DeviceCard
              key={device.id}
              device={device}
              salas={salas}
              globalLoading={loading}
              isAssigningSala={salaEditorDeviceId === device.id}
              onToggleAssignSala={() =>
                setSalaEditorDeviceId((current) => (current === device.id ? null : device.id))
              }
              onAssignSala={(salaId) => handleAssignSala(device.id, salaId)}
              onVerHistorico={() => setHistorialDeviceId(device.id)}
            />
          ))}
        </div>
      )}

      <Dialog open={historialDeviceId !== null} onOpenChange={(open) => !open && setHistorialDeviceId(null)}>
        <DialogContent className="monarca-theme w-[calc(100%-2rem)] sm:max-w-[1040px] max-h-[90dvh] overflow-y-auto bg-card">
          <DialogHeader>
            <DialogTitle className="text-foreground">
              {historialDevice?.sala ? (
                <>
                  {historialDevice.sala.nombre}
                  <span className="font-normal text-muted-foreground"> · {historialDevice.name}</span>
                </>
              ) : (
                historialDevice?.name ?? "Histórico ambiental"
              )}
            </DialogTitle>
          </DialogHeader>
          {historialDeviceId !== null && <PulseHistoryChart pulseDeviceId={historialDeviceId} />}
        </DialogContent>
      </Dialog>
    </div>
  )
}

type DisplayState = "cargando" | "sin_lectura" | "reciente" | "demorada" | "sin_datos" | "error"

function getDisplayState(device: DeviceViewState, globalLoading: boolean): DisplayState {
  if (device.error) {
    if (device.error.code === "not_found" && !device.reading) return "sin_lectura"
    return "error"
  }
  if (!device.reading) {
    return globalLoading ? "cargando" : "sin_datos"
  }
  const status: PulseDeviceConnectionStatus = device.status
  if (status === "conectado") return "reciente"
  if (status === "atencion") return "demorada"
  return "sin_datos"
}

const DISPLAY_STATE_CONFIG: Record<
  DisplayState,
  { label: string; icon: React.ComponentType<{ className?: string }>; className: string }
> = {
  cargando: { label: "Consultando...", icon: RefreshCw, className: "border-border text-muted-foreground" },
  sin_lectura: { label: "Sin lectura", icon: CircleDashed, className: "border-border text-muted-foreground" },
  reciente: { label: "Lectura reciente", icon: CheckCircle2, className: "border-primary/30 text-primary bg-primary/5" },
  demorada: { label: "Lectura demorada", icon: CircleAlert, className: "border-amber-300 text-amber-700 bg-amber-50" },
  sin_datos: { label: "Sin datos recientes", icon: CircleAlert, className: "border-border text-muted-foreground" },
  error: { label: "Error al consultar", icon: AlertTriangle, className: "border-destructive/30 text-destructive bg-destructive/5" },
}

function StatusBadge({ state }: { state: DisplayState }) {
  const config = DISPLAY_STATE_CONFIG[state]
  const Icon = config.icon
  return (
    <Badge variant="outline" className={`shrink-0 ${config.className}`}>
      <Icon className={`h-3 w-3 ${state === "cargando" ? "animate-spin" : ""}`} />
      {config.label}
    </Badge>
  )
}

function DeviceCard({
  device,
  salas,
  globalLoading,
  isAssigningSala,
  onToggleAssignSala,
  onAssignSala,
  onVerHistorico,
}: {
  device: DeviceViewState
  salas: Sala[]
  globalLoading: boolean
  isAssigningSala: boolean
  onToggleAssignSala: () => void
  onAssignSala: (salaId: number | null) => void
  onVerHistorico: () => void
}) {
  const reading = device.reading
  const displayState = getDisplayState(device, globalLoading)

  return (
    <Card className="bg-card border-border border-t-2 border-t-primary">
      <CardContent className="space-y-3 p-4">
        {/* Título: sala + dispositivo (o dispositivo + "sin sala asignada"), con
            "Cambiar sala" como acción secundaria pegada al nombre. */}
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
            <div className="min-w-0">
              {device.sala ? (
                <>
                  <p className="truncate text-lg font-semibold leading-tight text-foreground">{device.sala.nombre}</p>
                  <p className="truncate text-xs text-muted-foreground">{device.name}</p>
                </>
              ) : (
                <>
                  <p className="truncate text-lg font-semibold leading-tight text-foreground">{device.name}</p>
                  <p className="truncate text-xs text-muted-foreground">Sin sala asignada</p>
                </>
              )}
            </div>
            <button
              type="button"
              onClick={onToggleAssignSala}
              className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 -mx-1.5 text-xs text-muted-foreground hover:bg-primary/5 hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
            >
              <MapPin className="h-3 w-3" />
              {device.sala ? "Cambiar sala" : "Asignar sala"}
            </button>
          </div>
          <StatusBadge state={displayState} />
        </div>

        {isAssigningSala && (
          <Select
            value={device.sala ? String(device.sala.id) : "none"}
            onValueChange={(value) => onAssignSala(value === "none" ? null : Number(value))}
          >
            <SelectTrigger className="h-8 text-xs bg-card border-border">
              <SelectValue placeholder="Sin asignar" />
            </SelectTrigger>
            <SelectContent className="monarca-theme">
              <SelectItem value="none">Sin asignar</SelectItem>
              {salas.map((sala) => (
                <SelectItem key={sala.id} value={String(sala.id)}>
                  {sala.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {reading ? (
          <>
            {device.mostrandoLecturaAnterior && (
              <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>No se pudo actualizar en la última consulta. Se muestra la última lectura conocida.</span>
              </div>
            )}

            {/* Mediciones principales: Temperatura, Humedad y Luz — cada una con
                una superficie suave propia (misma paleta en todas las salas,
                identifica la variable, no un estado de alarma). Valores en
                carbón fijo para que se lean bien sobre cualquier tono. */}
            <div className="grid grid-cols-3 divide-x divide-border overflow-hidden rounded-md border border-border">
              <PrimaryMetric
                icon={Thermometer}
                label="Temperatura"
                value={formatNum(reading.temperatureC, 1)}
                unit="°C"
                bg={METRIC_TINTS.temperatura.bg}
                iconColor={METRIC_TINTS.temperatura.icon}
              />
              <PrimaryMetric
                icon={Droplets}
                label="Humedad"
                value={formatNum(reading.humidityRh, 0)}
                unit="%"
                bg={METRIC_TINTS.humedad.bg}
                iconColor={METRIC_TINTS.humedad.icon}
              />
              <PrimaryMetric
                icon={Sun}
                label="Luz"
                value={formatNum(reading.lightLux, 0)}
                unit="lux"
                bg={METRIC_TINTS.luz.bg}
                iconColor={METRIC_TINTS.luz.icon}
              />
            </div>

            {/* Mediciones secundarias: VPD, Punto de rocío y Presión, franja compacta */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-muted-foreground">
              <SecondaryMetric icon={Gauge} label="VPD" value={`${formatNum(reading.vpd, 2)} kPa`} />
              <SecondaryMetric icon={CloudDrizzle} label="Punto de rocío" value={`${formatNum(reading.dewPointC, 1)} °C`} />
              <SecondaryMetric icon={Wind} label="Presión" value={`${formatNum(reading.airPressureHpa, 1)} hPa`} />
            </div>

            {/* Pie: antigüedad, alimentación y acceso al histórico */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2 text-xs text-muted-foreground">
              <div className="flex items-center gap-3">
                <span>{formatMinutesAgo(reading.createdAt)}</span>
                <span className="flex items-center gap-1">
                  {reading.pluggedIn ? (
                    <>
                      <Plug className="h-3.5 w-3.5" />
                      Conectado a corriente
                    </>
                  ) : (
                    <>
                      <Battery className="h-3.5 w-3.5" />
                      {reading.batteryV === null ? "Batería no disponible" : `Batería ${formatNum(reading.batteryV, 1)} V`}
                    </>
                  )}
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-7 border-primary/40 bg-card px-2 text-primary hover:bg-primary/5"
                onClick={onVerHistorico}
              >
                <LineChart className="h-3.5 w-3.5 mr-1.5" />
                Ver histórico
              </Button>
            </div>
          </>
        ) : (
          <div className="py-4 text-center">
            <p className="text-sm text-muted-foreground">
              {displayState === "sin_lectura"
                ? "Este dispositivo todavía no reportó datos a Pulse Grow."
                : displayState === "error"
                  ? "No se pudo obtener la lectura de este dispositivo."
                  : displayState === "cargando"
                    ? "Consultando la lectura..."
                    : "Sin datos recientes para este dispositivo."}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3 h-7 border-primary/40 bg-card px-2 text-primary hover:bg-primary/5"
              onClick={onVerHistorico}
            >
              <LineChart className="h-3.5 w-3.5 mr-1.5" />
              Ver histórico
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function PrimaryMetric({
  icon: Icon,
  label,
  value,
  unit,
  bg,
  iconColor,
}: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>
  label: string
  value: string
  unit: string
  bg: string
  iconColor: string
}) {
  return (
    <div className="flex flex-col items-center gap-1 px-2 py-2.5 text-center" style={{ backgroundColor: bg }}>
      <span className="flex items-center gap-1 text-[11px]" style={{ color: `${METRIC_TEXT_DARK}b3` }}>
        <Icon className="h-3.5 w-3.5" style={{ color: iconColor }} />
        {label}
      </span>
      <span className="tabular-nums text-2xl font-semibold leading-none" style={{ color: METRIC_TEXT_DARK }}>
        {value}
        <span className="ml-1 text-xs font-normal" style={{ color: `${METRIC_TEXT_DARK}b3` }}>
          {unit}
        </span>
      </span>
    </div>
  )
}

function SecondaryMetric({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
}) {
  return (
    <span className="flex items-center gap-1.5">
      <Icon className="h-3.5 w-3.5" />
      <span className="text-muted-foreground/80">{label}:</span>
      <span className="tabular-nums font-medium text-foreground">{value}</span>
    </span>
  )
}
