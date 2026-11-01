// Perfil de equipo del usuario logueado (vista `equipo_perfiles`, script 070:
// nombre de public.perfiles + área y supervisión de public.equipo). Un usuario
// que todavía no está en `equipo` devuelve null y las pantallas del equipo
// explican cómo sumarlo. No reemplaza a lib/auth/session.ts.
import { createClient } from "@/lib/supabase/server"
import type { Perfil } from "@/lib/equipo"

export async function getPerfilActual(): Promise<{ userId: string | null; perfil: Perfil | null; tablaFaltante: boolean }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { userId: null, perfil: null, tablaFaltante: false }

  const { data, error } = await supabase.from("equipo_perfiles").select("*").eq("id", user.id).maybeSingle()
  if (error) return { userId: user.id, perfil: null, tablaFaltante: true }
  return { userId: user.id, perfil: (data as Perfil | null) ?? null, tablaFaltante: false }
}
