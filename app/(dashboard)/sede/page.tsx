import { createClient } from "@/lib/supabase/server"
import { getPerfilActual } from "@/lib/auth/perfil"
import { getServerSession } from "@/lib/auth/session"
import { getArgentinaDateString } from "@/lib/timezone"
import { cicloActual, type CicloSala } from "@/lib/ciclo"
import { estadoSala, ultimaPorSala, type LecturaSala } from "@/lib/sede"
import { SedeSalas, type SalaHoy } from "@/components/sede/sede-salas"
import { SedeEscritorio } from "@/components/sede/sede-escritorio"
import type { Perfil } from "@/lib/equipo"
import type { SalaCultivo } from "@/lib/types"

export const dynamic = "force-dynamic"

const haceHoras = (horas: number) => new Date(Date.now() - horas * 3600_000).toISOString()

// Sede (rediseño del 03/11/2026). En el celular: las salas con su ciclo y la
// última lectura de Pulse, en lista o sobre el plano. En la compu: el 3D de
// Facundo con esos mismos datos reales y sin controles de demo. El simulador
// tal cual estaba sigue en /sede/oficina.
export default async function SedePage() {
  const supabase = await createClient()
  const hoy = getArgentinaDateString()
  const [session, { perfil }] = await Promise.all([getServerSession(), getPerfilActual()])

  const [salas, ciclos, lecturas, perfiles] = await Promise.all([
    supabase.from("salas_cultivo").select("*").eq("activo", true).order("nombre"),
    supabase.from("ciclos_sala").select("*").eq("estado", "abierto"),
    supabase
      .from("lecturas_ambientales")
      .select("sala_id, temperatura_c, humedad_rh, vpd, leido_en")
      .gte("leido_en", haceHoras(2))
      .not("sala_id", "is", null)
      .order("leido_en", { ascending: false })
      .limit(600),
    supabase.from("equipo_perfiles").select("*"),
  ])

  const ultimas = ultimaPorSala((lecturas.data || []) as LecturaSala[])
  const abiertos = (ciclos.data || []) as CicloSala[]
  const salasCultivo = (salas.data || []) as SalaCultivo[]
  const lista: SalaHoy[] = salasCultivo.map((s) => ({
    id: s.id,
    nombre: s.nombre,
    descripcion: s.descripcion,
    estado: estadoSala(cicloActual(abiertos, s.id, hoy), hoy),
    lectura: ultimas.get(s.id) ?? null,
  }))

  return (
    <>
      <main className="container mx-auto px-4 py-6 lg:hidden">
        <SedeSalas salas={lista} />
      </main>
      <SedeEscritorio
        yo={perfil ? { id: perfil.id, nombre: perfil.nombre } : session ? { id: session.id, nombre: session.nombre } : null}
        perfiles={((perfiles.data || []) as Perfil[]).filter((p) => p.activo)}
        salas={salasCultivo}
        ciclos={abiertos}
      />
    </>
  )
}
