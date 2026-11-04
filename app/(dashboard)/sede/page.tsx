import { createClient } from "@/lib/supabase/server"
import { getPerfilActual } from "@/lib/auth/perfil"
import { getServerSession } from "@/lib/auth/session"
import { SedeSimulador } from "@/components/sede-simulador"
import type { Perfil } from "@/lib/equipo"
import type { CicloSala } from "@/lib/ciclo"
import type { SalaCultivo } from "@/lib/types"

export const dynamic = "force-dynamic"

// Sede (rediseño del 03/11/2026): el 3D de Facundo en «modo sistema», en la
// compu y en el celular (pedido de Facundo: nada de plano 2D). Sin controles
// de demo; clima, ciclos, tareas, luz y último riego reales, y la ficha de cada
// sala con objetivo y medición del día. El simulador tal cual estaba sigue en
// /sede/oficina.
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
      modo="sistema"
    />
  )
}
