"use client"

import { Bell, BellOff, BellRing } from "lucide-react"
import { Button } from "@/components/ui/button"
import { usePushSubscription } from "@/hooks/use-push-subscription"
import { cn } from "@/lib/utils"

// Ícono de campana: estado + atajo para activar/desactivar notificaciones
// push desde cualquier pantalla. El detalle completo (lista de
// dispositivos, prueba manual) vive en /automatizaciones.
// `variant="dark"` es para usarla sobre el sidebar verde bosque; el default
// ("light") es para superficies claras (topbar móvil).
export function PushNotificationsBell({ variant = "light" }: { variant?: "dark" | "light" }) {
  const { isSupported, requiresStandalone, isSubscribed, isLoading, subscribe, unsubscribe } = usePushSubscription()
  const onDark = variant === "dark"

  if (!isSupported && !requiresStandalone) return null

  if (requiresStandalone) {
    return (
      <Button
        variant="ghost"
        size="icon"
        disabled
        title="Para recibir notificaciones en iPhone, agregá la app a la pantalla de inicio primero"
        className={onDark ? "text-primary-foreground/30" : "text-muted-foreground/40"}
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
      className={cn(
        onDark
          ? "text-primary-foreground/70 hover:bg-white/10 hover:text-white"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {isSubscribed ? <BellRing className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
    </Button>
  )
}
