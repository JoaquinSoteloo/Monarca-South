import { createClient } from "@/lib/supabase/server"
import { getPerfilActual } from "@/lib/auth/perfil"
import { getServerSession } from "@/lib/auth/session"
import { SedeSimulador } from "@/components/sede-simulador"
import type { Perfil } from "@/lib/equipo"
import type { CicloSala } from "@/lib/ciclo"
import type { SalaCultivo } from "@/lib/types"

// Pantalla Sede: el simulador 3D de la sede (public/sede/index.html) con el
// usuario de cada uno. Chat por canales, riegos a la base y asistente de
// cultivo con IA (pedido de Facundo, 02/11/2026).
export default async function SedePage() {
  const supabase = await createClient()
  const [session, { perfil }] = await Promise.all([getServerSession(), getPerfilActual()])

  const [perfilesResult, salasResult, ciclosResult] = await Promise.all([
    supabase.from("equipo_perfiles").select("*"),
    supabase.from("salas_cultivo").select("*").eq("activo", true).order("id"),
    supabase.from("ciclos_sala").select("*").eq("estado", "abierto"),
  ])

  return (
    <SedeSimulador
      yo={perfil ? { id: perfil.id, nombre: perfil.nombre } : session ? { id: session.id, nombre: session.nombre } : null}
      perfiles={((perfilesResult.data || []) as Perfil[]).filter((p) => p.activo)}
      salas={(salasResult.data || []) as SalaCultivo[]}
      ciclos={(ciclosResult.data || []) as CicloSala[]}
    />
  )
}
