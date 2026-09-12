"use client"

import { useState } from "react"
import type { ModoAusenteEstado } from "@/lib/types"
import type { ChecklistAusente, ChecklistItemAusente, NivelCumplimientoAusente } from "@/lib/modo-ausente/checklist"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { tipoDispositivoConfig, formatMinutesAgo } from "@/lib/device-ui-config"
import { CheckCircle2, CircleAlert, Clock3, DoorClosed, DoorOpen, Power, PowerOff, RefreshCw } from "lucide-react"

interface ModoAusenteManagerProps {
  initialEstado: ModoAusenteEstado
  initialChecklist: ChecklistAusente
}

const nivelConfig: Record<NivelCumplimientoAusente, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  confirmado: { label: "Confirmado", color: "border-emerald-300 text-emerald-700 bg-emerald-50", icon: CheckCircle2 },
  no_confirmado: { label: "Solicitado · sin confirmación física", color: "border-amber-300 text-amber-700 bg-amber-50", icon: Clock3 },
  incumplimiento: { label: "Requiere atención", color: "border-red-300 text-red-700 bg-red-50", icon: CircleAlert },
}

export function ModoAusenteManager({ initialEstado, initialChecklist }: ModoAusenteManagerProps) {
  const [estado, setEstado] = useState<ModoAusenteEstado>(initialEstado)
  const [checklist, setChecklist] = useState<ChecklistAusente>(initialChecklist)
  const [verificando, setVerificando] = useState(false)
  const [activando, setActivando] = useState(false)
  const [desactivando, setDesactivando] = useState(false)
  const [enviandoComandoId, setEnviandoComandoId] = useState<number | null>(null)
  const [mensaje, setMensaje] = useState<{ type: "success" | "error"; text: string } | null>(null)

  const verificar = async () => {
    setVerificando(true)
    setMensaje(null)
    try {
      const res = await fetch("/api/modo-ausente/checklist", { cache: "no-store" })
      if (res.status === 401) throw new Error("unauthorized")
      if (!res.ok) throw new Error("checklist_failed")
      const data = await res.json()
      setEstado({
        activo: data.activo,
        activado_en: data.activado_en,
        activado_por: data.activado_por,
        activado_desde: data.activado_desde,
        desactivado_en: data.desactivado_en,
        desactivado_por: data.desactivado_por,
      })
      setChecklist({ items: data.items, todoOk: data.todoOk, sinConfirmacionFisica: data.sinConfirmacionFisica, resumen: data.resumen })
    } catch (err) {
      const esUnauthorized = err instanceof Error && err.message === "unauthorized"
      setMensaje({
        type: "error",
        text: esUnauthorized ? "Tu sesión expiró. Volvé a iniciar sesión." : "No se pudo verificar el estado de Monarca.",
      })
    } finally {
      setVerificando(false)
    }
  }

  const activar = async () => {
    setActivando(true)
    setMensaje(null)
    try {
      const res = await fetch("/api/modo-ausente/activate", { method: "POST" })
      if (res.status === 401) throw new Error("unauthorized")
      const data = await res.json()
      if (res.status === 409) {
        // El checklist cambió entre el último "Verificar" y este "Activar":
        // el backend ya revalidó todo y acá vuelve el detalle actualizado.
        setChecklist({ items: data.items, todoOk: data.todoOk, sinConfirmacionFisica: data.sinConfirmacionFisica, resumen: data.resumen })
        setMensaje({ type: "error", text: "Algo cambió justo ahora — revisá el checklist actualizado antes de reintentar." })
        return
      }
      if (!res.ok) throw new Error("activate_failed")
      setEstado((prev) => ({ ...prev, activo: true }))
      setChecklist({ items: data.items, todoOk: data.todoOk, sinConfirmacionFisica: data.sinConfirmacionFisica, resumen: data.resumen })
      await verificar()
    } catch (err) {
      const esUnauthorized = err instanceof Error && err.message === "unauthorized"
      setMensaje({
        type: "error",
        text: esUnauthorized ? "Tu sesión expiró. Volvé a iniciar sesión." : "No se pudo activar Modo Ausente.",
      })
    } finally {
      setActivando(false)
    }
  }

  const desactivar = async () => {
    setDesactivando(true)
    setMensaje(null)
    try {
      const res = await fetch("/api/modo-ausente/deactivate", { method: "POST" })
      if (res.status === 401) throw new Error("unauthorized")
      if (!res.ok) throw new Error("deactivate_failed")
      await verificar()
      setMensaje({ type: "success", text: "Modo Ausente desactivado. ¡Bienvenido de vuelta!" })
    } catch (err) {
      const esUnauthorized = err instanceof Error && err.message === "unauthorized"
      setMensaje({
        type: "error",
        text: esUnauthorized ? "Tu sesión expiró. Volvé a iniciar sesión." : "No se pudo desactivar Modo Ausente.",
      })
    } finally {
      setDesactivando(false)
    }
  }

  const corregirDispositivo = async (item: ChecklistItemAusente) => {
    setEnviandoComandoId(item.dispositivoId)
    try {
      const accion = item.requisito === "encendido" ? "encender" : "apagar"
      const res = await fetch(`/api/devices/${item.dispositivoId}/command`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload: { accion } }),
      })
      if (res.ok) await verificar()
    } finally {
      setEnviandoComandoId(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-emerald-900">Modo Ausente / Cierre</h2>
          <p className="text-muted-foreground">Verificá que los dispositivos críticos queden en el estado correcto antes de retirarte.</p>
        </div>
        <Button onClick={verificar} disabled={verificando} variant="outline">
          <RefreshCw className={`h-4 w-4 mr-2 ${verificando ? "animate-spin" : ""}`} />
          {verificando ? "Verificando..." : "Verificar Monarca"}
        </Button>
      </div>

      <Card className={estado.activo ? "border-emerald-300 bg-emerald-50/40" : undefined}>
        <CardContent className="py-4 flex items-center gap-3">
          {estado.activo ? <DoorClosed className="h-6 w-6 text-emerald-700" /> : <DoorOpen className="h-6 w-6 text-muted-foreground" />}
          <div>
            <p className="font-semibold">{estado.activo ? "Modo Ausente activo" : "Modo Ausente inactivo"}</p>
            {estado.activo && estado.activado_en && (
              <p className="text-sm text-muted-foreground">
                Activado {formatMinutesAgo(estado.activado_en)}
                {estado.activado_por ? ` por ${estado.activado_por}` : ""}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {mensaje && (
        <Alert
          variant={mensaje.type === "error" ? "destructive" : "default"}
          className={mensaje.type === "success" ? "border-emerald-300 bg-emerald-50 text-emerald-800" : undefined}
        >
          {mensaje.type === "success" ? <CheckCircle2 className="h-4 w-4" /> : <CircleAlert className="h-4 w-4" />}
          <AlertTitle>{mensaje.type === "success" ? "Listo" : "Atención"}</AlertTitle>
          <AlertDescription>{mensaje.text}</AlertDescription>
        </Alert>
      )}

      <Alert
        variant={checklist.todoOk ? "default" : "destructive"}
        className={checklist.todoOk ? "border-emerald-300 bg-emerald-50 text-emerald-800" : undefined}
      >
        {checklist.todoOk ? <CheckCircle2 className="h-4 w-4" /> : <CircleAlert className="h-4 w-4" />}
        <AlertTitle>{checklist.todoOk ? "Listo para activar" : "Atención requerida"}</AlertTitle>
        <AlertDescription>{checklist.resumen}</AlertDescription>
      </Alert>

      {checklist.items.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No hay dispositivos marcados como críticos todavía. Marcalos desde la edición de dispositivo en Automatizaciones.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {checklist.items.map((item) => {
            const TipoIcon = tipoDispositivoConfig[item.tipo].icon
            const cfg = nivelConfig[item.nivel]
            const NivelIcon = cfg.icon
            return (
              <Card key={item.dispositivoId}>
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <TipoIcon className="h-5 w-5 text-emerald-700" />
                    <CardTitle className="text-base flex-1">{item.nombre}</CardTitle>
                  </div>
                  <p className="text-xs text-muted-foreground">Requiere quedar {item.requisito}</p>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Badge variant="outline" className={cfg.color}>
                    <NivelIcon className="h-3 w-3" />
                    {cfg.label}
                  </Badge>
                  {item.motivo && <p className="text-sm text-muted-foreground">{item.motivo}</p>}
                  {item.nivel === "incumplimiento" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full"
                      disabled={enviandoComandoId === item.dispositivoId}
                      onClick={() => corregirDispositivo(item)}
                    >
                      {item.requisito === "encendido" ? <Power className="h-3.5 w-3.5 mr-1" /> : <PowerOff className="h-3.5 w-3.5 mr-1" />}
                      {item.requisito === "encendido" ? "Encender" : "Apagar"} ahora
                    </Button>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        {!estado.activo ? (
          <Button
            onClick={activar}
            disabled={!checklist.todoOk || activando}
            className="bg-emerald-700 hover:bg-emerald-800"
          >
            <DoorClosed className="h-4 w-4 mr-2" />
            {activando ? "Activando..." : "Activar Modo Ausente"}
          </Button>
        ) : (
          <Button onClick={desactivar} disabled={desactivando} variant="outline">
            <DoorOpen className="h-4 w-4 mr-2" />
            {desactivando ? "Desactivando..." : "Desactivar (volví)"}
          </Button>
        )}
      </div>
    </div>
  )
}
