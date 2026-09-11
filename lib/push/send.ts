import { getWebPush } from "@/lib/push/config"
import { listActiveSubscriptions, disableSubscription, type PushSubscriptionRow } from "@/lib/push/subscriptions"

export interface PushPayload {
  title: string
  body: string
  /** Ruta a enfocar/abrir al clickear la notificación (ej: "/automatizaciones"). */
  url?: string
  /** Agrupa notificaciones del mismo dispositivo bajo un mismo tag. */
  tag?: string
}

export interface SendPushResult {
  sent: number
  removed: number
  failed: number
}

// Capa reutilizable: cualquier alerta o automatización futura solo necesita
// importar esta función. Hoy no está conectada a ninguna regla real — queda
// disponible para cuando se decida disparar notificaciones desde
// lib/automations/**.
export async function sendPushNotification(payload: PushPayload): Promise<SendPushResult> {
  const webpush = getWebPush()
  const subscriptions = await listActiveSubscriptions()

  const results = await Promise.allSettled(
    subscriptions.map((subscription) => sendToOne(webpush, subscription, payload)),
  )

  let sent = 0
  let removed = 0
  let failed = 0

  for (const result of results) {
    if (result.status === "fulfilled") {
      if (result.value === "sent") sent++
      else removed++
    } else {
      failed++
      console.error("No se pudo enviar la notificación push:", result.reason)
    }
  }

  return { sent, removed, failed }
}

async function sendToOne(
  webpush: ReturnType<typeof getWebPush>,
  subscription: PushSubscriptionRow,
  payload: PushPayload,
): Promise<"sent" | "removed"> {
  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      },
      JSON.stringify(payload),
    )
    return "sent"
  } catch (error: any) {
    // 404/410: la suscripción ya no existe del lado del navegador/push
    // service (permiso revocado, browser desinstalado, etc.) — se
    // auto-limpia para no acumular filas muertas indefinidamente.
    if (error?.statusCode === 404 || error?.statusCode === 410) {
      await disableSubscription(subscription.endpoint)
      return "removed"
    }
    throw error
  }
}
