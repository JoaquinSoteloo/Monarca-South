// Única fuente de sesión server-side de Monarca: Supabase Auth, validada en
// cada request vía cookies SSR (@supabase/ssr). Hay una sola cuenta admin
// compartida, así que `usuario` queda fijo en "admin" — no pasa a ser el
// email — porque push_subscriptions ya tiene filas guardadas con
// usuario = "admin" como clave (lib/push/subscriptions.ts) y modo-ausente
// registra "quién" activó/desactivó con ese mismo valor.
import { createClient } from "@/lib/supabase/server"

export interface AuthSession {
  id: string
  usuario: string
  nombre: string
}

export async function getServerSession(): Promise<AuthSession | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  return { id: user.id, usuario: "admin", nombre: user.email ?? "admin" }
}
