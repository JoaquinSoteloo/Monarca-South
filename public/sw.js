// Service worker mínimo: solo habilita la instalación de la PWA.
// No cachea nada ni intercepta requests (sin fetch handler, sin offline).

self.addEventListener("install", () => {
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim())
})
