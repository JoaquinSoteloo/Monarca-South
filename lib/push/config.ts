import webpush from "web-push"

// web-push usa el módulo `crypto` de Node — este archivo (y todo lo que lo
// importe) debe correr en runtime Node, no Edge.
let configured = false

export function getWebPush() {
  if (!configured) {
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    const privateKey = process.env.VAPID_PRIVATE_KEY
    const subject = process.env.VAPID_SUBJECT

    if (!publicKey || !privateKey || !subject) {
      throw new Error("Faltan las variables de entorno VAPID (NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT).")
    }

    webpush.setVapidDetails(subject, publicKey, privateKey)
    configured = true
  }

  return webpush
}
