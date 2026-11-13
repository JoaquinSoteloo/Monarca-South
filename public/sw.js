// Service worker mínimo: habilita la instalación de la PWA y Web Push.
// No cachea nada ni intercepta requests (sin fetch handler, sin offline).

self.addEventListener("install", () => {
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener("push", (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: "Monarca South", body: event.data ? event.data.text() : "" }
  }

  event.waitUntil(
    self.registration.showNotification(data.title || "Monarca South", {
      body: data.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: data.tag,
      // Con el mismo tag (ej.: una conversación del Chat) la nueva reemplaza
      // a la anterior, pero vuelve a sonar.
      renotify: Boolean(data.tag),
      // Propuestas de Nubi: botones "Mandar" / "No" y queda a la vista hasta contestar.
      actions: Array.isArray(data.acciones) ? data.acciones : [],
      requireInteraction: Array.isArray(data.acciones) && data.acciones.length > 0,
      data: { url: data.url || "/", ...(data.datos || {}) },
    }),
  )
})

// Botón "Mandar" o "No" de una propuesta de Nubi: contesta sin abrir la app.
// Usa la sesión del navegador (cookies). Si falla, abre la app en la propuesta.
async function contestarPropuesta(id, decision, url) {
  try {
    const r = await fetch(`/api/nubi/propuestas/${id}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision }),
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(j.error || "No se pudo contestar")
    await self.registration.showNotification(decision === "mandar" ? "Orden enviada ✓" : "Propuesta descartada", {
      body: j.mensaje || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: `nubi-${id}`,
      data: { url },
    })
  } catch (err) {
    await self.registration.showNotification("No se pudo contestar a Nubi", {
      body: `${err && err.message ? err.message : err}. Tocá para verlo en la app.`,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: `nubi-${id}`,
      data: { url },
    })
  }
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const url = event.notification.data?.url || "/"
  const propuestaId = event.notification.data?.propuestaId
  if (propuestaId && (event.action === "mandar" || event.action === "no")) {
    event.waitUntil(contestarPropuesta(propuestaId, event.action, url))
    return
  }

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      const existing = list.find((client) => client.url.includes(url))
      if (existing) return existing.focus()
      return self.clients.openWindow(url)
    }),
  )
})
