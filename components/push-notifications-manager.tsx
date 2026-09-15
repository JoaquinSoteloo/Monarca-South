"use client"

import { useCallback, useEffect, useState } from "react"
import { Bell, BellOff, Loader2, Send, Smartphone, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { usePushSubscription } from "@/hooks/use-push-subscription"

interface PushDevice {
  id: number
  endpoint: string
  deviceLabel: string | null
  userAgent: string | null
  createdAt: string
  lastSeenAt: string
}

// Contenido de detalle de Web Push, pensado para vivir dentro de un diálogo
// (ver components/automatizaciones/notifications-dialog.tsx): activar/
// desactivar este dispositivo, disparar una notificación de prueba, y
// ver/dar de baja otros dispositivos suscriptos con la misma sesión admin.
// No dispara notificaciones reales de alertas ni automatizaciones — eso
// queda para más adelante, esto solo verifica que el circuito funcione de
// punta a punta. No solicita permisos ni se suscribe automáticamente: todo
// pasa por acción explícita del usuario (subscribe()/unsubscribe() en el
// hook solo se llaman desde un click).
export function PushNotificationsManager() {
  const { isSupported, requiresStandalone, isSubscribed, isLoading, error, subscribe, unsubscribe } =
    usePushSubscription()
  const [devices, setDevices] = useState<PushDevice[]>([])
  const [devicesLoading, setDevicesLoading] = useState(true)
  const [testStatus, setTestStatus] = useState<string | null>(null)
  const [testLoading, setTestLoading] = useState(false)

  const loadDevices = useCallback(async () => {
    setDevicesLoading(true)
    try {
      const response = await fetch("/api/push/devices")
      if (response.ok) {
        const data = await response.json()
        setDevices(data.devices || [])
      }
    } finally {
      setDevicesLoading(false)
    }
  }, [])

  useEffect(() => {
    loadDevices()
  }, [loadDevices, isSubscribed])

  const handleSendTest = async () => {
    setTestLoading(true)
    setTestStatus(null)
    try {
      const response = await fetch("/api/push/test", { method: "POST" })
      const data = await response.json()
      if (!response.ok) throw new Error(data?.error || "Error al enviar")
      setTestStatus(`Enviada a ${data.sent} dispositivo(s)${data.removed ? `, ${data.removed} baja(s) por estar vencidos` : ""}.`)
    } catch (err: any) {
      setTestStatus(err?.message || "No se pudo enviar la notificación de prueba")
    } finally {
      setTestLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      {requiresStandalone && (
        <Alert>
          <BellOff className="h-4 w-4" />
          <AlertTitle>Instalá la app primero</AlertTitle>
          <AlertDescription>
            En iPhone, para recibir notificaciones agregá esta página a la pantalla de inicio (Compartir → Agregar a
            pantalla de inicio) y abrila desde ahí — Safari en una pestaña normal no puede suscribirse.
          </AlertDescription>
        </Alert>
      )}

      {!isSupported && !requiresStandalone && (
        <Alert>
          <BellOff className="h-4 w-4" />
          <AlertTitle>No disponible</AlertTitle>
          <AlertDescription>Este navegador no soporta notificaciones push.</AlertDescription>
        </Alert>
      )}

      {isSupported && (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant={isSubscribed ? "outline" : "default"}
            onClick={() => (isSubscribed ? unsubscribe() : subscribe())}
            disabled={isLoading}
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
            {isSubscribed ? "Desactivar en este dispositivo" : "Activar en este dispositivo"}
          </Button>
          {isSubscribed && (
            <Button variant="outline" onClick={handleSendTest} disabled={testLoading}>
              {testLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Enviar notificación de prueba
            </Button>
          )}
        </div>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {testStatus && (
        <Alert>
          <AlertDescription>{testStatus}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <h3 className="text-sm font-medium text-muted-foreground">Dispositivos suscriptos</h3>
        {devicesLoading ? (
          <p className="text-sm text-muted-foreground">Cargando...</p>
        ) : devices.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay dispositivos suscriptos.</p>
        ) : (
          <ul className="space-y-1.5">
            {devices.map((device) => (
              <li key={device.id} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm">
                <div className="flex min-w-0 items-center gap-2">
                  <Smartphone className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="truncate font-medium">{device.deviceLabel || "Dispositivo"}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      Último uso: {new Date(device.lastSeenAt).toLocaleString("es-AR", { hour12: false })}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Eliminar suscripción de ${device.deviceLabel || "dispositivo"}`}
                  onClick={async () => {
                    await fetch("/api/push/unsubscribe", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ endpoint: device.endpoint }),
                    })
                    loadDevices()
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
