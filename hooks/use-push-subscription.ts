"use client"

import { useCallback, useEffect, useState } from "react"

export type PushPermissionState = "default" | "granted" | "denied" | "unsupported"

interface UsePushSubscriptionResult {
  isSupported: boolean
  // iOS solo expone Push API cuando la PWA está instalada a la pantalla de
  // inicio (iOS 16.4+) — en un tab normal de Safari, PushManager no existe.
  requiresStandalone: boolean
  permission: PushPermissionState
  isSubscribed: boolean
  isLoading: boolean
  error: string | null
  subscribe: () => Promise<void>
  unsubscribe: () => Promise<void>
}

function isIOS() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent)
}

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || (window.navigator as any).standalone === true
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")
  const rawData = window.atob(base64)
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)))
}

// Guarda la suscripción en el servidor, a nombre de quien está logueado.
async function guardarEnServidor(subscription: PushSubscription) {
  const response = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      subscription: subscription.toJSON(),
      deviceLabel: `${navigator.platform || "Dispositivo"}`,
    }),
  })

  if (!response.ok) {
    throw new Error("No se pudo guardar la suscripción en el servidor")
  }
}

// La suscripción que ya se volvió a guardar en esta carga de la página: la
// campana se monta dos veces (barra lateral y barra del celular).
let sincronizada: string | null = null

export function usePushSubscription(): UsePushSubscriptionResult {
  const [isSupported, setIsSupported] = useState(false)
  const [requiresStandalone, setRequiresStandalone] = useState(false)
  const [permission, setPermission] = useState<PushPermissionState>("unsupported")
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function init() {
      const hasApis = "serviceWorker" in navigator && "PushManager" in window
      const iosNeedsInstall = isIOS() && !isStandalone()

      if (!hasApis || iosNeedsInstall) {
        if (cancelled) return
        setIsSupported(hasApis)
        setRequiresStandalone(iosNeedsInstall)
        setPermission(hasApis ? Notification.permission : "unsupported")
        setIsLoading(false)
        return
      }

      setIsSupported(true)
      setRequiresStandalone(false)
      setPermission(Notification.permission as PushPermissionState)

      try {
        const registration = await navigator.serviceWorker.ready
        const subscription = await registration.pushManager.getSubscription()
        if (!cancelled) setIsSubscribed(!!subscription)
        // Un aparato que ya tenía las notificaciones activadas se vuelve a
        // guardar a nombre de quien entró (script 090: los push del Chat van a
        // cada persona). No pide permiso ni crea una suscripción nueva.
        if (subscription && Notification.permission === "granted" && sincronizada !== subscription.endpoint) {
          sincronizada = subscription.endpoint
          guardarEnServidor(subscription).catch(() => {
            sincronizada = null
          })
        }
      } catch {
        // sin service worker listo todavía, se considera no suscripto
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    init()
    return () => {
      cancelled = true
    }
  }, [])

  const subscribe = useCallback(async () => {
    setError(null)
    setIsLoading(true)
    try {
      const permissionResult = await Notification.requestPermission()
      setPermission(permissionResult as PushPermissionState)
      if (permissionResult !== "granted") {
        throw new Error("Permiso de notificaciones denegado")
      }

      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      if (!publicKey) {
        throw new Error("Falta configurar NEXT_PUBLIC_VAPID_PUBLIC_KEY")
      }

      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      })

      await guardarEnServidor(subscription)
      sincronizada = subscription.endpoint

      setIsSubscribed(true)
    } catch (err: any) {
      setError(err?.message || "No se pudo activar las notificaciones")
    } finally {
      setIsLoading(false)
    }
  }, [])

  const unsubscribe = useCallback(async () => {
    setError(null)
    setIsLoading(true)
    try {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()

      if (subscription) {
        const endpoint = subscription.endpoint
        await subscription.unsubscribe()
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint }),
        })
      }

      setIsSubscribed(false)
    } catch (err: any) {
      setError(err?.message || "No se pudo desactivar las notificaciones")
    } finally {
      setIsLoading(false)
    }
  }, [])

  return { isSupported, requiresStandalone, permission, isSubscribed, isLoading, error, subscribe, unsubscribe }
}
