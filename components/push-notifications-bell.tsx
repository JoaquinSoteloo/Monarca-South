"use client"

import { Bell, BellOff, BellRing } from "lucide-react"
import { Button } from "@/components/ui/button"
import { usePushSubscription } from "@/hooks/use-push-subscription"

// Ícono de campana para el Header: estado + atajo para activar/desactivar
// notificaciones push desde cualquier pantalla. El detalle completo (lista de
// dispositivos, prueba manual) vive en /automatizaciones.
export function PushNotificationsBell() {
  const { isSupported, requiresStandalone, isSubscribed, isLoading, subscribe, unsubscribe } = usePushSubscription()

  if (!isSupported && !requiresStandalone) return null

  if (requiresStandalone) {
    return (
      <Button
        variant="ghost"
        size="icon"
        disabled
        title="Para recibir notificaciones en iPhone, agregá la app a la pantalla de inicio primero"
        className="text-amber-200/40"
      >
        <BellOff className="h-4 w-4" />
      </Button>
    )
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      disabled={isLoading}
      onClick={() => (isSubscribed ? unsubscribe() : subscribe())}
      title={isSubscribed ? "Desactivar notificaciones" : "Activar notificaciones"}
      className="text-amber-200/70 hover:text-amber-200 hover:bg-emerald-800/50"
    >
      {isSubscribed ? <BellRing className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
    </Button>
  )
}
