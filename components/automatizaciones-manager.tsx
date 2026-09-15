"use client"

import type React from "react"
import { useMemo, useRef, useState } from "react"
import type { Automatizacion, DispositivoControlable, ModoDispositivo } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { computeAlertasOperativas, type AlertaOperativa, type UltimaLecturaResumen } from "@/lib/automations/alerts"
import type { EjecucionConComando } from "@/lib/automations/history-format"
import { Plus, RefreshCw, CheckCircle2, AlertTriangle, Bell } from "lucide-react"

import { SummaryStrip, AlertList } from "@/components/automatizaciones/overview"
import { RoomTabs } from "@/components/automatizaciones/room-tabs"
import { RuleCard } from "@/components/automatizaciones/rule-card"
import { DeviceCard } from "@/components/automatizaciones/device-card"
import { DeviceDialog } from "@/components/automatizaciones/device-dialog"
import { RuleDialog } from "@/components/automatizaciones/rule-dialog"
import { HistoryDialog } from "@/components/automatizaciones/history-dialog"
import { NotificationsDialog } from "@/components/automatizaciones/notifications-dialog"
import { initialDeviceForm, initialReglaForm, type DeviceFormState, type RuleFormState } from "@/components/automatizaciones/form-types"

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

const modoEjecucionPorProveedor: Record<DeviceFormState["proveedor"], "servidor_directo" | "bridge_polling"> = {
  manual_noop: "servidor_directo",
  broadlink_ir: "bridge_polling",
  shelly_local: "bridge_polling",
  shelly_cloud: "servidor_directo",
  http_directo: "servidor_directo",
}

// A qué sala pertenece una alerta operativa, para el indicador del selector
// y para poder cambiar de sala al navegar desde un aviso ajeno a la actual.
function resolveSalaAlerta(
  alerta: AlertaOperativa,
  automatizaciones: Automatizacion[],
  dispositivos: DispositivoControlable[],
): number | null {
  if (alerta.automatizacionId) {
    const a = automatizaciones.find((x) => x.id === alerta.automatizacionId)
    if (a) return a.sala_id
  }
  if (alerta.dispositivoId) {
    const d = dispositivos.find((x) => x.id === alerta.dispositivoId)
    if (d) return d.sala_id
  }
  return null
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
  const [deviceForm, setDeviceForm] = useState<DeviceFormState>(initialDeviceForm)

  const [isReglaDialogOpen, setIsReglaDialogOpen] = useState(false)
  const [editingReglaId, setEditingReglaId] = useState<number | null>(null)
  const [reglaForm, setReglaForm] = useState<RuleFormState>(initialReglaForm)

  const [historialReglaId, setHistorialReglaId] = useState<number | null>(null)
  const [historial, setHistorial] = useState<EjecucionConComando[]>([])
  const [loadingHistorial, setLoadingHistorial] = useState(false)
  const [historialError, setHistorialError] = useState<string | null>(null)
  const historialRequestId = useRef(0)

  const [isNotificacionesOpen, setIsNotificacionesOpen] = useState(false)

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

  const avisosPorSala = useMemo(() => {
    const mapa: Record<number, number> = {}
    for (const a of alertas) {
      const salaId = resolveSalaAlerta(a, automatizaciones, dispositivos)
      if (salaId !== null) mapa[salaId] = (mapa[salaId] ?? 0) + 1
    }
    return mapa
  }, [alertas, automatizaciones, dispositivos])

  const { alertasSala, alertasGenerales } = useMemo(() => {
    const sala: AlertaOperativa[] = []
    const generales: AlertaOperativa[] = []
    for (const a of alertas) {
      const salaId = resolveSalaAlerta(a, automatizaciones, dispositivos)
      if (salaId === salaActivaId && salaId !== null) sala.push(a)
      else if (salaId === null) generales.push(a)
    }
    return { alertasSala: sala, alertasGenerales: generales }
  }, [alertas, automatizaciones, dispositivos, salaActivaId])

  const handleNavigateAlerta = (alerta: AlertaOperativa) => {
    const targetSalaId = resolveSalaAlerta(alerta, automatizaciones, dispositivos)
    if (targetSalaId !== null && targetSalaId !== salaActivaId) setSalaActivaId(targetSalaId)
    const targetId = alerta.automatizacionId
      ? `regla-${alerta.automatizacionId}`
      : alerta.dispositivoId
        ? `dispositivo-${alerta.dispositivoId}`
        : null
    if (!targetId) return
    requestAnimationFrame(() => {
      document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "center" })
    })
  }

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

  const handleSetModoDispositivo = async (d: DispositivoControlable, nuevoModo: ModoDispositivo) => {
    if (d.modo === nuevoModo) return
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
    const requestId = ++historialRequestId.current
    setHistorialReglaId(reglaId)
    setHistorial([])
    setHistorialError(null)
    setLoadingHistorial(true)
    try {
      const res = await fetch(`/api/automations/${reglaId}/executions`, { cache: "no-store" })
      if (requestId !== historialRequestId.current) return
      if (res.ok) {
        const data = await res.json()
        setHistorial(data.ejecuciones ?? [])
      } else {
        setHistorialError("No se pudo cargar el historial de esta regla.")
      }
    } catch {
      if (requestId === historialRequestId.current) setHistorialError("No se pudo cargar el historial de esta regla.")
    } finally {
      if (requestId === historialRequestId.current) setLoadingHistorial(false)
    }
  }

  const reglasActivas = automatizaciones.filter((a) => a.activa).length
  const dispositivosManual = dispositivos.filter((d) => d.modo === "manual").length

  const salaActiva = salas.find((s) => s.id === salaActivaId)
  const dispositivosSala = dispositivos.filter((d) => d.sala_id === salaActivaId)
  const reglasSala = automatizaciones.filter((r) => r.sala_id === salaActivaId)
  const historialAutomatizacion = automatizaciones.find((a) => a.id === historialReglaId) ?? null
  const historialDispositivo = historialAutomatizacion
    ? (dispositivos.find((d) => d.id === historialAutomatizacion.dispositivo_id) ?? null)
    : null

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Automatizaciones</h1>
          <p className="text-muted-foreground">Configurá reglas y revisá los equipos de cada sala</p>
        </div>
        <div className="flex flex-col items-stretch gap-1.5 sm:items-end">
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setIsNotificacionesOpen(true)}>
              <Bell className="h-4 w-4" />
              Notificaciones
            </Button>
            <Button onClick={handleEvaluarAhora} disabled={evaluando}>
              <RefreshCw className={`h-4 w-4 ${evaluando ? "animate-spin" : ""}`} />
              {evaluando ? "Evaluando..." : "Evaluar ahora"}
            </Button>
          </div>
          <p className="max-w-xs text-xs text-muted-foreground sm:text-right">
            Ejecuta el motor de reglas ahora mismo: puede generar comandos según las reglas activas de todas las salas.
          </p>
        </div>
      </div>

      {mensaje && (
        <Alert
          variant={mensaje.type === "error" ? "destructive" : "default"}
          className={mensaje.type === "success" ? "border-primary/30 bg-primary/5 text-primary" : undefined}
        >
          {mensaje.type === "success" ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          <AlertTitle>{mensaje.type === "success" ? "Evaluación completa" : "Atención"}</AlertTitle>
          <AlertDescription>{mensaje.text}</AlertDescription>
        </Alert>
      )}

      <SummaryStrip reglasActivas={reglasActivas} dispositivosManual={dispositivosManual} avisos={alertas.length} />

      {alertasGenerales.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Avisos generales</p>
          <AlertList alertas={alertasGenerales} />
        </div>
      )}

      <RoomTabs salas={salas} salaActivaId={salaActivaId} avisosPorSala={avisosPorSala} onSelect={setSalaActivaId} />

      {salaActiva && (
        <div className="space-y-8">
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-foreground">Avisos de {salaActiva.nombre}</h2>
            <AlertList alertas={alertasSala} onNavigate={handleNavigateAlerta} />
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">
                Reglas de la sala <span className="font-normal text-muted-foreground">({reglasSala.length})</span>
              </h2>
              <Button size="sm" variant="outline" onClick={abrirNuevaRegla} disabled={dispositivosSala.length === 0}>
                <Plus className="h-4 w-4" />
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
                  const pulseDeviceName = pulseDevices.find((pd) => pd.id === r.pulse_device_id)?.name
                  const alertaAsociada = alertas.find((a) => a.automatizacionId === r.id)
                  return (
                    <RuleCard
                      key={r.id}
                      regla={r}
                      dispositivo={dispositivo}
                      pulseDeviceName={pulseDeviceName}
                      alertaAsociada={alertaAsociada}
                      onToggleActiva={() => handleToggleActivaRegla(r)}
                      onHistorial={() => abrirHistorial(r.id)}
                      onEditar={() => abrirEditarRegla(r)}
                      onEliminar={() => handleDeleteRegla(r.id)}
                    />
                  )
                })}
              </div>
            )}
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">
                Dispositivos <span className="font-normal text-muted-foreground">({dispositivosSala.length})</span>
              </h2>
              <Button size="sm" variant="outline" onClick={abrirNuevoDispositivo}>
                <Plus className="h-4 w-4" />
                Nuevo dispositivo
              </Button>
            </div>

            {dispositivosSala.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">No hay dispositivos en esta sala todavía.</CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {dispositivosSala.map((d) => (
                  <DeviceCard
                    key={d.id}
                    dispositivo={d}
                    onEditar={() => abrirEditarDispositivo(d)}
                    onEliminar={() => handleDeleteDispositivo(d.id)}
                    onSetModo={(modo) => handleSetModoDispositivo(d, modo)}
                    onComando={(accion) => handleComandoManual(d, accion)}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      <DeviceDialog
        open={isDeviceDialogOpen}
        onOpenChange={setIsDeviceDialogOpen}
        editingDeviceId={editingDeviceId}
        salaNombre={salaActiva?.nombre}
        form={deviceForm}
        setForm={setDeviceForm}
        loading={loading}
        onSubmit={handleSaveDispositivo}
      />

      <RuleDialog
        open={isReglaDialogOpen}
        onOpenChange={setIsReglaDialogOpen}
        editingReglaId={editingReglaId}
        form={reglaForm}
        setForm={setReglaForm}
        pulseDevices={pulseDevices.filter((pd) => pd.sala_id === salaActivaId)}
        dispositivos={dispositivosSala}
        loading={loading}
        onSubmit={handleSaveRegla}
      />

      <HistoryDialog
        reglaId={historialReglaId}
        reglaNombre={historialAutomatizacion?.nombre}
        onOpenChange={(open) => !open && setHistorialReglaId(null)}
        loading={loadingHistorial}
        error={historialError}
        historial={historial}
        automatizacion={historialAutomatizacion}
        dispositivo={historialDispositivo}
      />

      <NotificationsDialog open={isNotificacionesOpen} onOpenChange={setIsNotificacionesOpen} />
    </div>
  )
}
