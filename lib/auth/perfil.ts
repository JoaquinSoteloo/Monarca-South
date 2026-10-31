// Perfil del usuario logueado (tabla `perfiles`, script 067). La cuenta admin
// compartida no tiene perfil: en ese caso devuelve null y las pantallas del
// equipo muestran cómo crear usuarios. No reemplaza a lib/auth/session.ts.
import { createClient } from "@/lib/supabase/server"
import type { Perfil } from "@/lib/equipo"

export async function getPerfilActual(): Promise<{ userId: string | null; perfil: Perfil | null; tablaFaltante: boolean }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { userId: null, perfil: null, tablaFaltante: false }

  const { data, error } = await supabase.from("perfiles").select("*").eq("id", user.id).maybeSingle()
  if (error) return { userId: user.id, perfil: null, tablaFaltante: true }
  return { userId: user.id, perfil: (data as Perfil | null) ?? null, tablaFaltante: false }
}
