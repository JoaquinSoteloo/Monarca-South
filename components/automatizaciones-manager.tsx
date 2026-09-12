"use client"

import type React from "react"
import { useMemo, useState } from "react"
import type {
  Automatizacion,
  DispositivoControlable,
  OperadorComparacion,
  ProveedorDispositivo,
  TipoDispositivoControlable,
  VariableAmbiental,
} from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { VARIABLE_CONFIG as variableConfig, formatComandoDispositivo, AC_MODO_OPTIONS, AC_FAN_OPTIONS } from "@/lib/automations/format"
import { computeAlertasOperativas, type AlertaOperativa, type UltimaLecturaResumen } from "@/lib/automations/alerts"
import { formatEjecucionHumana, type EjecucionConComando } from "@/lib/automations/history-format"
import { tipoDispositivoConfig, comandoEstadoConfig, origenComandoLabels, formatMinutesAgo } from "@/lib/device-ui-config"
import {
  Plus,
  Trash2,
  Pencil,
  History,
  RefreshCw,
  CheckCircle2,
  CircleAlert,
  Clock,
  AlertTriangle,
  Power,
  PowerOff,
} from "lucide-react"

interface Sala {
  id: number
  nombre: string
}

interface PulseDeviceOption {
  id: number
  name: string
  sala_id: number | null
}

interface AutomatizacionesManagerProps {
  salas: Sala[]
  pulseDevices: PulseDeviceOption[]
  initialDispositivos: DispositivoControlable[]
  initialAutomatizaciones: Automatizacion[]
  ultimaLecturaPorPulseDevice: Record<number, UltimaLecturaResumen | undefined>
  ultimoTipoLogPorAutomatizacion: Record<number, string | undefined>
}

// Este componente nunca conoce BroadLink ni ningún hardware concreto: solo
// arma comandos abstractos (`accion_encendido`/`accion_apagado`) y los manda
// a nuestro propio backend (/api/devices, /api/automations). Todo dato de
// hardware real vive detrás de esos endpoints.

const proveedorOpciones: { value: ProveedorDispositivo; label: string; disponible: boolean }[] = [
  { value: "manual_noop", label: "Simulación (manual_noop) — sin hardware", disponible: true },
  { value: "broadlink_ir", label: "BroadLink IR — próximamente", disponible: false },
  { value: "shelly_local", label: "Shelly local — próximamente", disponible: false },
  { value: "shelly_cloud", label: "Shelly Cloud — próximamente", disponible: false },
  { value: "http_directo", label: "HTTP directo — próximamente", disponible: false },
]

const modoEjecucionPorProveedor: Record<ProveedorDispositivo, "servidor_directo" | "bridge_polling"> = {
  manual_noop: "servidor_directo",
  broadlink_ir: "bridge_polling",
  shelly_local: "bridge_polling",
  shelly_cloud: "servidor_directo",
  http_directo: "servidor_directo",
}

const tipoEjecucionConfig: Record<string, { label: string; color: string; icon: React.ComponentType<{ className?: string }> }> = {
  encendido: { label: "Encendido", color: "border-emerald-300 text-emerald-700 bg-emerald-50", icon: CheckCircle2 },
  apagado: { label: "Apagado", color: "border-gray-300 text-gray-700 bg-gray-50", icon: PowerOff },
  fail_safe: { label: "Fail-safe", color: "border-amber-300 text-amber-700 bg-amber-50", icon: AlertTriangle },
  error: { label: "Error", color: "border-red-300 text-red-700 bg-red-50", icon: CircleAlert },
}

function resumirCondicion(variable: VariableAmbiental, operador: OperadorComparacion, valor: number, minutos: number) {
  const cfg = variableConfig[variable]
  const sostenido = minutos > 0 ? ` por ${minutos} min` : ""
  return `${cfg.label} ${operador} ${valor}${cfg.unidad}${sostenido}`
}

const initialDeviceForm = {
  nombre: "",
  tipo: "aire_acondicionado" as TipoDispositivoControlable,
  proveedor: "manual_noop" as ProveedorDispositivo,
  soporta_feedback: false,
  simular_falla: false,
  latencia_ms: "",
  // "" = no es crítico para Modo Ausente (ver app/modo-ausente).
  requisito_ausente: "" as "" | "encendido" | "apagado",
}

const initialReglaForm = {
  nombre: "",
  pulse_device_id: "",
  variable: "temperatura_c" as VariableAmbiental,
  operador: ">" as OperadorComparacion,
  valor_objetivo: "",
  duracion_minima_minutos: "3",
  usar_histeresis: false,
  operador_apagado: "<" as OperadorComparacion,
  valor_apagado: "",
  duracion_apagado_minutos: "3",
  cooldown_minutos: "5",
  dispositivo_id: "",
  accion_modo: "frio",
  accion_setpoint: "23",
  accion_fan: "auto",
  accion_fail_safe: "mantener" as "mantener" | "apagar",
}

export function AutomatizacionesManager({
  salas,
  pulseDevices,
  initialDispositivos,
  initialAutomatizaciones,
  ultimaLecturaPorPulseDevice,
  ultimoTipoLogPorAutomatizacion,
}: AutomatizacionesManagerProps) {
  const [dispositivos, setDispositivos] = useState<DispositivoControlable[]>(initialDispositivos)
  const [automatizaciones, setAutomatizaciones] = useState<Automatizacion[]>(initialAutomatizaciones)
  const [alertasContext, setAlertasContext] = useState({
    ultimaLecturaPorPulseDevice,
    ultimoTipoLogPorAutomatizacion,
  })

  const [salaActivaId, setSalaActivaId] = useState<number | null>(salas[0]?.id ?? null)

  const [isDeviceDialogOpen, setIsDeviceDialogOpen] = useState(false)
  const [editingDeviceId, setEditingDeviceId] = useState<number | null>(null)
  const [deviceForm, setDeviceForm] = useState(initialDeviceForm)

  const [isReglaDialogOpen, setIsReglaDialogOpen] = useState(false)
  const [editingReglaId, setEditingReglaId] = useState<number | null>(null)
  const [reglaForm, setReglaForm] = useState(initialReglaForm)

  const [historialReglaId, setHistorialReglaId] = useState<number | null>(null)
  const [historial, setHistorial] = useState<EjecucionConComando[]>([])
  const [loadingHistorial, setLoadingHistorial] = useState(false)

  const [loading, setLoading] = useState(false)
  const [evaluando, setEvaluando] = useState(false)
  const [mensaje, setMensaje] = useState<{ type: "success" | "error"; text: string } | null>(null)

  const alertas: AlertaOperativa[] = useMemo(
    () =>
      computeAlertasOperativas(
        automatizaciones,
        dispositivos,
        alertasContext.ultimaLecturaPorPulseDevice,
        alertasContext.ultimoTipoLogPorAutomatizacion,
      ),
    [automatizaciones, dispositivos, alertasContext],
  )

  const refreshAlertasContext = async (automs: Automatizacion[]) => {
    const pulseIds = [...new Set(automs.map((a) => a.pulse_device_id))]
    const autoIds = automs.map((a) => a.id)
    if (pulseIds.length === 0 && autoIds.length === 0) {
      setAlertasContext({ ultimaLecturaPorPulseDevice: {}, ultimoTipoLogPorAutomatizacion: {} })
      return
    }
    const params = new URLSearchParams({
      pulse_device_ids: pulseIds.join(","),
      automatizacion_ids: autoIds.join(","),
    })
    const res = await fetch(`/api/automations/alerts-context?${params.toString()}`, { cache: "no-store" })
    if (res.ok) {
      setAlertasContext(await res.json())
    }
  }

  const handleEvaluarAhora = async () => {
    setEvaluando(true)
    setMensaje(null)
    try {
      const res = await fetch("/api/automations/evaluate/manual", { method: "POST" })
      if (res.status === 401) throw new Error("unauthorized")
      if (!res.ok) throw new Error("evaluate_failed")
      const data: {
        skipped: boolean
        motivo?: string
        lecturasInsertadas?: number
        reglasEvaluadas?: number
        comandosEncolados?: number
        errores?: unknown[]
      } = await res.json()

      if (data.skipped) {
        // El pinger externo (cada 1 minuto) ya estaba corriendo una
        // evaluación cuando se apretó el botón — no es un error, se omite
        // esta corrida y la próxima que consiga el lock evalúa igual.
        setMensaje({ type: "success", text: "Ya había una evaluación en curso (probablemente el pinger automático). No se omitió nada importante." })
      } else {
        const errores = data.errores ?? []
        setMensaje({
          type: errores.length > 0 ? "error" : "success",
          text: `${data.reglasEvaluadas} regla(s) evaluada(s), ${data.comandosEncolados} comando(s) encolado(s)${
            errores.length > 0 ? `, ${errores.length} error(es)` : ""
          }.`,
        })
      }
      await recargarTodo()
    } catch (err) {
      console.error("[automatizaciones] Error evaluando:", err)
      const esUnauthorized = err instanceof Error && err.message === "unauthorized"
      setMensaje({
        type: "error",
        text: esUnauthorized ? "Tu sesión expiró. Volvé a iniciar sesión para evaluar automatizaciones." : "No se pudo evaluar las automatizaciones.",
      })
    } finally {
      setEvaluando(false)
    }
  }

  const recargarTodo = async () => {
    const [devRes, reglasRes] = await Promise.all([fetch("/api/devices", { cache: "no-store" }), fetch("/api/automations", { cache: "no-store" })])
    if (devRes.ok) {
      const data = await devRes.json()
      setDispositivos(data.dispositivos ?? [])
    }
    let nuevasAutomatizaciones = automatizaciones
    if (reglasRes.ok) {
      const data = await reglasRes.json()
      nuevasAutomatizaciones = data.automatizaciones ?? []
      setAutomatizaciones(nuevasAutomatizaciones)
    }
    await refreshAlertasContext(nuevasAutomatizaciones)
  }

  // --- Dispositivos ---

  const abrirNuevoDispositivo = () => {
    setEditingDeviceId(null)
    setDeviceForm(initialDeviceForm)
    setIsDeviceDialogOpen(true)
  }

  const abrirEditarDispositivo = (d: DispositivoControlable) => {
    setEditingDeviceId(d.id)
    setDeviceForm({
      nombre: d.nombre,
      tipo: d.tipo,
      proveedor: d.proveedor,
      soporta_feedback: d.soporta_feedback,
      simular_falla: Boolean((d.proveedor_config as any)?.fallarSiempre),
      latencia_ms: (d.proveedor_config as any)?.latenciaMs ? String((d.proveedor_config as any).latenciaMs) : "",
      requisito_ausente: d.requisito_ausente ?? "",
    })
    setIsDeviceDialogOpen(true)
  }

  const handleSaveDispositivo = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!salaActivaId) return
    setLoading(true)

    const proveedorConfig: Record<string, unknown> = {}
    if (deviceForm.proveedor === "manual_noop") {
      if (deviceForm.simular_falla) proveedorConfig.fallarSiempre = true
      if (deviceForm.latencia_ms) proveedorConfig.latenciaMs = Number(deviceForm.latencia_ms)
    }

    const body = {
      nombre: deviceForm.nombre,
      sala_id: salaActivaId,
      tipo: deviceForm.tipo,
      proveedor: deviceForm.proveedor,
      modo_ejecucion: modoEjecucionPorProveedor[deviceForm.proveedor],
      proveedor_config: proveedorConfig,
      soporta_feedback: deviceForm.soporta_feedback,
      requisito_ausente: deviceForm.requisito_ausente || null,
    }

    const res = editingDeviceId
      ? await fetch(`/api/devices/${editingDeviceId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
      : await fetch("/api/devices", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })

    if (res.ok) {
      await recargarTodo()
      setIsDeviceDialogOpen(false)
    } else {
      setMensaje({ type: "error", text: "No se pudo guardar el dispositivo." })
    }
    setLoading(false)
  }

  const handleDeleteDispositivo = async (id: number) => {
    if (!confirm("¿Eliminar este dispositivo? Las reglas que lo usan dejarán de tener a quién comandar.")) return
    const res = await fetch(`/api/devices/${id}`, { method: "DELETE" })
    if (res.ok) await recargarTodo()
  }

  const handleToggleModoDispositivo = async (d: DispositivoControlable) => {
    const nuevoModo = d.modo === "automatico" ? "manual" : "automatico"
    const res = await fetch(`/api/devices/${d.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modo: nuevoModo }),
    })
    if (res.ok) await recargarTodo()
  }

  const handleComandoManual = async (d: DispositivoControlable, accion: "encender" | "apagar") => {
    const payload = accion === "encender" ? { accion: "encender" } : { accion: "apagar" }
    const res = await fetch(`/api/devices/${d.id}/command`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload }),
    })
    if (res.ok) await recargarTodo()
  }

  // --- Reglas ---

  const abrirNuevaRegla = () => {
    setEditingReglaId(null)
    setReglaForm(initialReglaForm)
    setIsReglaDialogOpen(true)
  }

  const abrirEditarRegla = (r: Automatizacion) => {
    setEditingReglaId(r.id)
    const accionEncendido = r.accion_encendido as any
    setReglaForm({
      nombre: r.nombre,
      pulse_device_id: String(r.pulse_device_id),
      variable: r.variable,
      operador: r.operador,
      valor_objetivo: String(r.valor_objetivo),
      duracion_minima_minutos: String(Math.round(r.duracion_minima_segundos / 60)),
      usar_histeresis: r.operador_apagado !== null,
      operador_apagado: r.operador_apagado ?? "<",
      valor_apagado: r.valor_apagado !== null ? String(r.valor_apagado) : "",
      duracion_apagado_minutos: r.duracion_apagado_segundos !== null ? String(Math.round(r.duracion_apagado_segundos / 60)) : "3",
      cooldown_minutos: String(Math.round(r.cooldown_segundos / 60)),
      dispositivo_id: String(r.dispositivo_id),
      accion_modo: accionEncendido?.modo ?? "frio",
      accion_setpoint: accionEncendido?.setpoint !== undefined ? String(accionEncendido.setpoint) : "23",
      accion_fan: accionEncendido?.fan ?? "auto",
      accion_fail_safe: r.accion_fail_safe,
    })
    setIsReglaDialogOpen(true)
  }

  const dispositivoSeleccionado = dispositivos.find((d) => d.id === Number(reglaForm.dispositivo_id))

  const handleSaveRegla = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!salaActivaId) return
    setLoading(true)

    const esAireAcondicionado = dispositivoSeleccionado?.tipo === "aire_acondicionado"
    const accionEncendido: Record<string, unknown> = { accion: "encender" }
    if (esAireAcondicionado) {
      accionEncendido.modo = reglaForm.accion_modo
      accionEncendido.setpoint = Number(reglaForm.accion_setpoint)
      accionEncendido.fan = reglaForm.accion_fan
    }

    const body = {
      nombre: reglaForm.nombre,
      sala_id: salaActivaId,
      pulse_device_id: Number(reglaForm.pulse_device_id),
      variable: reglaForm.variable,
      operador: reglaForm.operador,
      valor_objetivo: Number(reglaForm.valor_objetivo),
      duracion_minima_segundos: Number(reglaForm.duracion_minima_minutos) * 60,
      operador_apagado: reglaForm.usar_histeresis ? reglaForm.operador_apagado : null,
      valor_apagado: reglaForm.usar_histeresis ? Number(reglaForm.valor_apagado) : null,
      duracion_apagado_segundos: reglaForm.usar_histeresis ? Number(reglaForm.duracion_apagado_minutos) * 60 : null,
      cooldown_segundos: Number(reglaForm.cooldown_minutos) * 60,
      dispositivo_id: Number(reglaForm.dispositivo_id),
      accion_encendido: accionEncendido,
      accion_apagado: { accion: "apagar" },
      accion_fail_safe: reglaForm.accion_fail_safe,
    }

    const res = editingReglaId
      ? await fetch(`/api/automations/${editingReglaId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
      : await fetch("/api/automations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })

    if (res.ok) {
      await recargarTodo()
      setIsReglaDialogOpen(false)
    } else {
      setMensaje({ type: "error", text: "No se pudo guardar la regla." })
    }
    setLoading(false)
  }

  const handleDeleteRegla = async (id: number) => {
    if (!confirm("¿Eliminar esta regla de automatización?")) return
    const res = await fetch(`/api/automations/${id}`, { method: "DELETE" })
    if (res.ok) await recargarTodo()
  }

  const handleToggleActivaRegla = async (r: Automatizacion) => {
    const res = await fetch(`/api/automations/${r.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activa: !r.activa }),
    })
    if (res.ok) await recargarTodo()
  }

  const abrirHistorial = async (reglaId: number) => {
    setHistorialReglaId(reglaId)
    setLoadingHistorial(true)
    try {
      const res = await fetch(`/api/automations/${reglaId}/executions`, { cache: "no-store" })
      if (res.ok) {
        const data = await res.json()
        setHistorial(data.ejecuciones ?? [])
      }
    } finally {
      setLoadingHistorial(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-emerald-900">Automatizaciones</h2>
          <p className="text-muted-foreground">Reglas ambientales por sala, dispositivos abstractos y su historial de ejecución</p>
        </div>
        <Button onClick={handleEvaluarAhora} disabled={evaluando} variant="outline">
          <RefreshCw className={`h-4 w-4 mr-2 ${evaluando ? "animate-spin" : ""}`} />
          {evaluando ? "Evaluando..." : "Evaluar ahora"}
        </Button>
      </div>

      {mensaje && (
        <Alert
          variant={mensaje.type === "error" ? "destructive" : "default"}
          className={mensaje.type === "success" ? "border-emerald-300 bg-emerald-50 text-emerald-800" : undefined}
        >
          {mensaje.type === "success" ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          <AlertTitle>{mensaje.type === "success" ? "Evaluación completa" : "Atención"}</AlertTitle>
          <AlertDescription>{mensaje.text}</AlertDescription>
        </Alert>
      )}

      {alertas.length > 0 && (
        <Card className="border-amber-300/70 bg-amber-50/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-amber-900">
              <AlertTriangle className="h-4 w-4" />
              Estado operativo ({alertas.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {alertas.map((a) => (
              <div key={a.id} className="flex items-start gap-2 text-sm">
                {a.nivel === "error" ? (
                  <CircleAlert className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                )}
                <span className={a.nivel === "error" ? "text-red-800" : "text-amber-800"}>{a.mensaje}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Tabs value={salaActivaId?.toString()} onValueChange={(v) => setSalaActivaId(Number(v))} className="w-full">
        <TabsList className="flex flex-wrap h-auto gap-2 bg-emerald-100/50">
          {salas.map((sala) => (
            <TabsTrigger key={sala.id} value={sala.id.toString()} className="data-[state=active]:bg-emerald-700 data-[state=active]:text-white">
              {sala.nombre}
            </TabsTrigger>
          ))}
        </TabsList>

        {salas.map((sala) => {
          const dispositivosSala = dispositivos.filter((d) => d.sala_id === sala.id)
          const reglasSala = automatizaciones.filter((r) => r.sala_id === sala.id)

          return (
            <TabsContent key={sala.id} value={sala.id.toString()} className="mt-6 space-y-8">
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-emerald-800">Dispositivos</h3>
                  <Button size="sm" variant="outline" onClick={abrirNuevoDispositivo}>
                    <Plus className="h-4 w-4 mr-1" />
                    Nuevo dispositivo
                  </Button>
                </div>

                {dispositivosSala.length === 0 ? (
                  <Card>
                    <CardContent className="py-8 text-center text-muted-foreground">No hay dispositivos en esta sala todavía.</CardContent>
                  </Card>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {dispositivosSala.map((d) => {
                      const TipoIcon = tipoDispositivoConfig[d.tipo].icon
                      const estadoCfg = d.ultimo_comando_estado ? comandoEstadoConfig[d.ultimo_comando_estado] : null
                      const EstadoIcon = estadoCfg?.icon ?? Clock

                      return (
                        <Card key={d.id}>
                          <CardHeader className="space-y-2">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <TipoIcon className="h-5 w-5 text-emerald-700" />
                                <div>
                                  <CardTitle className="text-base">{d.nombre}</CardTitle>
                                  <p className="text-xs text-muted-foreground">{tipoDispositivoConfig[d.tipo].label}</p>
                                </div>
                              </div>
                              <div className="flex gap-1">
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => abrirEditarDispositivo(d)}>
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-red-600" onClick={() => handleDeleteDispositivo(d.id)}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground">{d.modo === "manual" ? "Manual" : "Automático"}</span>
                              <Switch checked={d.modo === "manual"} onCheckedChange={() => handleToggleModoDispositivo(d)} />
                            </div>
                          </CardHeader>
                          <CardContent className="space-y-3">
                            {/* Estado esperado: lo que Monarca pidió por última vez (independiente de
                                si el adapter pudo ejecutarlo). Último comando: metadata de esa
                                ejecución. Estado real: SOLO si el proveedor puede confirmarlo — nunca
                                se infiere "ejecutado" como "el equipo cambió de verdad". */}
                            <div className="text-sm space-y-0.5">
                              <p className="text-xs text-muted-foreground">Estado esperado</p>
                              <p className="font-medium">
                                {d.ultimo_comando_payload ? formatComandoDispositivo(d.tipo, d.ultimo_comando_payload) : "Sin comandos todavía"}
                              </p>
                            </div>

                            <div className="text-sm space-y-1">
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

                            <div className="text-sm space-y-0.5">
                              <p className="text-xs text-muted-foreground">Estado real</p>
                              {!d.soporta_feedback ? (
                                <p className="text-muted-foreground italic">No disponible — control unidireccional, sin confirmación del equipo.</p>
                              ) : d.ultimo_estado_confirmado_payload ? (
                                <p className="font-medium">
                                  {formatComandoDispositivo(d.tipo, d.ultimo_estado_confirmado_payload)} ·{" "}
                                  {formatMinutesAgo(d.ultimo_estado_confirmado_en)}
                                </p>
                              ) : (
                                <p className="text-muted-foreground">Esperando confirmación del equipo</p>
                              )}
                            </div>

                            {d.modo === "manual" && (
                              <div className="flex gap-2 pt-2 border-t border-border">
                                <Button size="sm" variant="outline" className="flex-1" onClick={() => handleComandoManual(d, "encender")}>
                                  <Power className="h-3.5 w-3.5 mr-1" />
                                  Encender
                                </Button>
                                <Button size="sm" variant="outline" className="flex-1" onClick={() => handleComandoManual(d, "apagar")}>
                                  <PowerOff className="h-3.5 w-3.5 mr-1" />
                                  Apagar
                                </Button>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      )
                    })}
                  </div>
                )}
              </section>

              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-emerald-800">Reglas</h3>
                  <Button size="sm" variant="outline" onClick={abrirNuevaRegla} disabled={dispositivosSala.length === 0}>
                    <Plus className="h-4 w-4 mr-1" />
                    Nueva regla
                  </Button>
                </div>

                {reglasSala.length === 0 ? (
                  <Card>
                    <CardContent className="py-8 text-center text-muted-foreground">
                      {dispositivosSala.length === 0
                        ? "Creá primero un dispositivo en esta sala para poder armar reglas."
                        : "No hay reglas en esta sala todavía."}
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-3">
                    {reglasSala.map((r) => {
                      const dispositivo = dispositivos.find((d) => d.id === r.dispositivo_id)
                      return (
                        <Card key={r.id}>
                          <CardContent className="py-4 flex flex-wrap items-center justify-between gap-3">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold">{r.nombre}</span>
                                {!r.activa && (
                                  <Badge variant="outline" className="border-gray-300 text-gray-500 bg-gray-50">
                                    Inactiva
                                  </Badge>
                                )}
                              </div>
                              <p className="text-sm text-muted-foreground">
                                Encender: {resumirCondicion(r.variable, r.operador, r.valor_objetivo, Math.round(r.duracion_minima_segundos / 60))}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                Apagar:{" "}
                                {r.operador_apagado
                                  ? resumirCondicion(
                                      r.variable,
                                      r.operador_apagado,
                                      r.valor_apagado ?? r.valor_objetivo,
                                      Math.round((r.duracion_apagado_segundos ?? r.duracion_minima_segundos) / 60),
                                    )
                                  : "negación de la condición de encendido"}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {dispositivo?.nombre ?? "Dispositivo eliminado"} · cooldown {Math.round(r.cooldown_segundos / 60)} min · fail-safe:{" "}
                                {r.accion_fail_safe}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Switch checked={r.activa} onCheckedChange={() => handleToggleActivaRegla(r)} />
                              <Button variant="ghost" size="icon" onClick={() => abrirHistorial(r.id)}>
                                <History className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => abrirEditarRegla(r)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="text-red-600" onClick={() => handleDeleteRegla(r.id)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      )
                    })}
                  </div>
                )}
              </section>
            </TabsContent>
          )
        })}
      </Tabs>

      {/* Dialog: nuevo/editar dispositivo */}
      <Dialog open={isDeviceDialogOpen} onOpenChange={setIsDeviceDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingDeviceId ? "Editar dispositivo" : "Nuevo dispositivo"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveDispositivo} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="dev_nombre">Nombre</Label>
              <Input
                id="dev_nombre"
                value={deviceForm.nombre}
                onChange={(e) => setDeviceForm({ ...deviceForm, nombre: e.target.value })}
                placeholder="Ej: Aire acondicionado Sala 1"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={deviceForm.tipo} onValueChange={(v) => setDeviceForm({ ...deviceForm, tipo: v as TipoDispositivoControlable })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(tipoDispositivoConfig).map(([key, cfg]) => (
                    <SelectItem key={key} value={key}>
                      {cfg.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Proveedor</Label>
              <Select value={deviceForm.proveedor} onValueChange={(v) => setDeviceForm({ ...deviceForm, proveedor: v as ProveedorDispositivo })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {proveedorOpciones.map((op) => (
                    <SelectItem key={op.value} value={op.value} disabled={!op.disponible}>
                      {op.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {deviceForm.proveedor === "manual_noop" && (
              <div className="space-y-3 rounded-md border border-border p-3">
                <p className="text-xs text-muted-foreground">
                  Opciones de simulación — permiten probar los caminos de error de la cola de comandos sin hardware real.
                </p>
                <div className="flex items-center justify-between">
                  <Label htmlFor="dev_fallar" className="text-sm">
                    Simular falla siempre
                  </Label>
                  <Switch
                    id="dev_fallar"
                    checked={deviceForm.simular_falla}
                    onCheckedChange={(checked) => setDeviceForm({ ...deviceForm, simular_falla: checked })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dev_latencia">Latencia simulada (ms, opcional)</Label>
                  <Input
                    id="dev_latencia"
                    type="number"
                    value={deviceForm.latencia_ms}
                    onChange={(e) => setDeviceForm({ ...deviceForm, latencia_ms: e.target.value })}
                    placeholder="0"
                  />
                </div>
              </div>
            )}

            <div className="flex items-center justify-between">
              <Label htmlFor="dev_feedback" className="text-sm">
                El proveedor puede confirmar estado real
              </Label>
              <Switch
                id="dev_feedback"
                checked={deviceForm.soporta_feedback}
                onCheckedChange={(checked) => setDeviceForm({ ...deviceForm, soporta_feedback: checked })}
              />
            </div>

            <div className="space-y-2">
              <Label>Modo Ausente</Label>
              <Select
                value={deviceForm.requisito_ausente || "ninguno"}
                onValueChange={(v) => setDeviceForm({ ...deviceForm, requisito_ausente: v === "ninguno" ? "" : (v as "encendido" | "apagado") })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ninguno">No es crítico</SelectItem>
                  <SelectItem value="encendido">Debe quedar encendido</SelectItem>
                  <SelectItem value="apagado">Debe quedar apagado</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Si se marca, este dispositivo aparece en el checklist de /modo-ausente y se sigue vigilando mientras esté activo.
              </p>
            </div>

            <Button type="submit" className="w-full bg-emerald-700 hover:bg-emerald-800" disabled={loading}>
              {loading ? "Guardando..." : "Guardar"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog: nueva/editar regla */}
      <Dialog open={isReglaDialogOpen} onOpenChange={setIsReglaDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingReglaId ? "Editar regla" : "Nueva regla"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveRegla} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="regla_nombre">Nombre</Label>
              <Input
                id="regla_nombre"
                value={reglaForm.nombre}
                onChange={(e) => setReglaForm({ ...reglaForm, nombre: e.target.value })}
                placeholder="Ej: Enfriar Sala 1"
                required
              />
            </div>

            <div className="space-y-2">
              <Label>Sensor Pulse</Label>
              <Select value={reglaForm.pulse_device_id} onValueChange={(v) => setReglaForm({ ...reglaForm, pulse_device_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar sensor" />
                </SelectTrigger>
                <SelectContent>
                  {pulseDevices
                    .filter((pd) => pd.sala_id === salaActivaId)
                    .map((pd) => (
                      <SelectItem key={pd.id} value={String(pd.id)}>
                        {pd.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <p className="text-sm font-medium text-emerald-800 pt-2">Condición de encendido</p>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-2 col-span-1">
                <Label>Variable</Label>
                <Select value={reglaForm.variable} onValueChange={(v) => setReglaForm({ ...reglaForm, variable: v as VariableAmbiental })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(variableConfig).map(([key, cfg]) => (
                      <SelectItem key={key} value={key}>
                        {cfg.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Operador</Label>
                <Select value={reglaForm.operador} onValueChange={(v) => setReglaForm({ ...reglaForm, operador: v as OperadorComparacion })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[">", "<", ">=", "<="].map((op) => (
                      <SelectItem key={op} value={op}>
                        {op}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Valor</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={reglaForm.valor_objetivo}
                  onChange={(e) => setReglaForm({ ...reglaForm, valor_objetivo: e.target.value })}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Durante (minutos sostenido, 0 = instantáneo)</Label>
              <Input
                type="number"
                min="0"
                value={reglaForm.duracion_minima_minutos}
                onChange={(e) => setReglaForm({ ...reglaForm, duracion_minima_minutos: e.target.value })}
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              <Label htmlFor="regla_histeresis" className="text-sm font-medium text-emerald-800">
                Condición de apagado distinta (histéresis)
              </Label>
              <Switch
                id="regla_histeresis"
                checked={reglaForm.usar_histeresis}
                onCheckedChange={(checked) => setReglaForm({ ...reglaForm, usar_histeresis: checked })}
              />
            </div>
            {reglaForm.usar_histeresis ? (
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-2">
                  <Label>Operador</Label>
                  <Select
                    value={reglaForm.operador_apagado}
                    onValueChange={(v) => setReglaForm({ ...reglaForm, operador_apagado: v as OperadorComparacion })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[">", "<", ">=", "<="].map((op) => (
                        <SelectItem key={op} value={op}>
                          {op}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Valor</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={reglaForm.valor_apagado}
                    onChange={(e) => setReglaForm({ ...reglaForm, valor_apagado: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Minutos</Label>
                  <Input
                    type="number"
                    min="0"
                    value={reglaForm.duracion_apagado_minutos}
                    onChange={(e) => setReglaForm({ ...reglaForm, duracion_apagado_minutos: e.target.value })}
                  />
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Sin histéresis configurada: se apaga apenas deja de cumplirse la condición de encendido.
              </p>
            )}

            <div className="space-y-2">
              <Label>Cooldown (minutos mínimos entre disparos)</Label>
              <Input
                type="number"
                min="0"
                value={reglaForm.cooldown_minutos}
                onChange={(e) => setReglaForm({ ...reglaForm, cooldown_minutos: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>Dispositivo a controlar</Label>
              <Select value={reglaForm.dispositivo_id} onValueChange={(v) => setReglaForm({ ...reglaForm, dispositivo_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar dispositivo" />
                </SelectTrigger>
                <SelectContent>
                  {dispositivos
                    .filter((d) => d.sala_id === salaActivaId)
                    .map((d) => (
                      <SelectItem key={d.id} value={String(d.id)}>
                        {d.nombre}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            {dispositivoSeleccionado?.tipo === "aire_acondicionado" && (
              <div className="grid grid-cols-3 gap-2 rounded-md border border-border p-3">
                <div className="space-y-2">
                  <Label>Modo</Label>
                  <Select value={reglaForm.accion_modo} onValueChange={(v) => setReglaForm({ ...reglaForm, accion_modo: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {AC_MODO_OPTIONS.map((op) => (
                        <SelectItem key={op.value} value={op.value}>
                          {op.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Setpoint (°C)</Label>
                  <Input
                    type="number"
                    value={reglaForm.accion_setpoint}
                    onChange={(e) => setReglaForm({ ...reglaForm, accion_setpoint: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Fan</Label>
                  <Select value={reglaForm.accion_fan} onValueChange={(v) => setReglaForm({ ...reglaForm, accion_fan: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {AC_FAN_OPTIONS.map((op) => (
                        <SelectItem key={op.value} value={op.value}>
                          {op.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
            {dispositivoSeleccionado && dispositivoSeleccionado.tipo !== "aire_acondicionado" && (
              <p className="text-xs text-muted-foreground">Este equipo se enciende/apaga sin parámetros adicionales.</p>
            )}

            <div className="space-y-2">
              <Label>Si Pulse deja de reportar (fail-safe)</Label>
              <Select
                value={reglaForm.accion_fail_safe}
                onValueChange={(v) => setReglaForm({ ...reglaForm, accion_fail_safe: v as "mantener" | "apagar" })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mantener">Mantener último comando (recomendado)</SelectItem>
                  <SelectItem value="apagar">Apagar automáticamente</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button type="submit" className="w-full bg-emerald-700 hover:bg-emerald-800" disabled={loading}>
              {loading ? "Guardando..." : "Guardar regla"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog: historial de ejecuciones */}
      <Dialog open={historialReglaId !== null} onOpenChange={(open) => !open && setHistorialReglaId(null)}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Historial de ejecuciones</DialogTitle>
          </DialogHeader>
          {loadingHistorial ? (
            <p className="text-center text-muted-foreground py-6">Cargando...</p>
          ) : historial.length === 0 ? (
            <p className="text-center text-muted-foreground py-6">Todavía no hay ejecuciones registradas para esta regla.</p>
          ) : (
            <div className="space-y-3">
              {historial.map((h) => {
                const cfg = tipoEjecucionConfig[h.tipo]
                const Icon = cfg.icon
                const automatizacionCtx = automatizaciones.find((a) => a.id === historialReglaId) ?? null
                const dispositivoCtx = automatizacionCtx ? (dispositivos.find((d) => d.id === automatizacionCtx.dispositivo_id) ?? null) : null
                const comandoRaw = h.comando as unknown
                const comando = Array.isArray(comandoRaw) ? (comandoRaw[0] ?? null) : (comandoRaw ?? null)
                const evento = formatEjecucionHumana({ ...h, comando }, automatizacionCtx, dispositivoCtx)

                return (
                  <div key={h.id} className="border-b border-border pb-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <Badge variant="outline" className={cfg.color}>
                        <Icon className="h-3 w-3" />
                        {cfg.label}
                      </Badge>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">{new Date(h.creado_en).toLocaleString("es-AR")}</span>
                    </div>
                    <ul className="mt-1.5 space-y-0.5 text-foreground">
                      {evento.lineas.map((linea, i) => (
                        <li key={i}>{linea}</li>
                      ))}
                    </ul>
                    {evento.tecnico && <p className="text-xs text-muted-foreground italic mt-1">Detalle técnico: {evento.tecnico}</p>}
                  </div>
                )
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
