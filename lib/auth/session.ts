// Única fuente de sesión server-side de Monarca: Supabase Auth, validada en
// cada request vía cookies SSR (@supabase/ssr). Cada persona tiene su propia
// cuenta y un perfil con rol (public.perfiles, scripts/066). `usuario` queda
// fijo en "admin" a propósito: push_subscriptions usa ese valor como clave
// (lib/push/subscriptions.ts) y las notificaciones son del club, no de una
// persona. Para registrar "quién" hizo algo se usa `nombre`.
import { createClient } from "@/lib/supabase/server"
import type { RolUsuario } from "@/lib/types"
import { ROL_COMISION, TODOS_LOS_PERMISOS } from "@/lib/permisos"

export interface AuthSession {
  id: string
  usuario: string
  nombre: string
  rol: RolUsuario
  /** Nombre del rol para mostrar (public.roles). */
  rolNombre: string
  /** Permisos del rol (lib/permisos.ts); la comisión los tiene todos. */
  permisos: string[]
}

export async function getServerSession(): Promise<AuthSession | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const { data: perfil } = await supabase.from("perfiles").select("nombre, rol, activo").eq("user_id", user.id).maybeSingle()

  // Un usuario dado de baja también queda bloqueado en Supabase Auth (ban),
  // esto cubre la sesión que ya tenía abierta.
  if (perfil && !perfil.activo) return null

  // Sin perfil (cuenta creada a mano fuera de la pantalla Usuarios): el
  // permiso más bajo.
  const rol = (perfil?.rol as RolUsuario | undefined) ?? "operador"

  let permisos: string[] = TODOS_LOS_PERMISOS
  let rolNombre = "Comisión directiva"
  if (rol !== ROL_COMISION) {
    const [{ data: rolFila }, { data: filas }] = await Promise.all([
      supabase.from("roles").select("nombre").eq("clave", rol).maybeSingle(),
      supabase.from("rol_permisos").select("permiso").eq("rol", rol),
    ])
    rolNombre = rolFila?.nombre ?? rol
    permisos = (filas ?? []).map((f) => f.permiso)
  }

  return {
    id: user.id,
    usuario: "admin",
    nombre: perfil?.nombre ?? user.email ?? "admin",
    rol,
    rolNombre,
    permisos,
  }
}
