import { createClient } from "@/lib/supabase/server"
import { getPerfilActual } from "@/lib/auth/perfil"
import { getServerSession } from "@/lib/auth/session"
import { getArgentinaDateString } from "@/lib/timezone"
import { cicloActual, type CicloSala } from "@/lib/ciclo"
import {
  esSalaVege,
  estadoSala,
  filasMedicion,
  objetivosSala,
  proximosHitos,
  resumenCiclo,
  resumenDia,
  ultimaPorSala,
  type LecturaSala,
  type RiegoSala,
} from "@/lib/sede"
import { SedeSalas, type SalaHoy } from "@/components/sede/sede-salas"
import { SedeEscritorio } from "@/components/sede/sede-escritorio"
import type { Perfil } from "@/lib/equipo"
import type { SalaCultivo } from "@/lib/types"

export const dynamic = "force-dynamic"

const haceHoras = (horas: number) => new Date(Date.now() - horas * 3600_000).toISOString()

// Sede (rediseño del 03/11/2026). En el celular: las salas con su ciclo y la
// última lectura de Pulse, en lista o sobre el plano, y la ficha de cada una
// (objetivo y medición del día, ciclo y lo que viene). En la compu: el 3D de
// Facundo con esos mismos datos reales y sin controles de demo. El simulador
// tal cual estaba sigue en /sede/oficina.
export default async function SedePage() {
  const supabase = await createClient()
  const hoy = getArgentinaDateString()
  const medianoche = new Date(`${hoy}T00:00:00-03:00`).toISOString()
  const hace2horas = haceHoras(2)
  const [session, { perfil }] = await Promise.all([getServerSession(), getPerfilActual()])

  const [salas, ciclos, lecturas, riegos, perfiles] = await Promise.all([
    supabase.from("salas_cultivo").select("*").eq("activo", true).order("nombre"),
    supabase.from("ciclos_sala").select("*").eq("estado", "abierto"),
    supabase
      .from("lecturas_ambientales")
      .select("sala_id, temperatura_c, humedad_rh, vpd, luz_lux, leido_en")
      .gte("leido_en", medianoche < hace2horas ? medianoche : hace2horas)
      .not("sala_id", "is", null)
      .order("leido_en", { ascending: false })
      .limit(4000),
    supabase
      .from("registros_riego")
      .select("id, sala_id, fecha, ec_entrada, ph_entrada, drenaje_pct")
      .order("fecha", { ascending: false })
      .order("id", { ascending: false })
      .limit(200),
    supabase.from("equipo_perfiles").select("*"),
  ])

  const filas = (lecturas.data || []) as LecturaSala[]
  // «Ahora» solo si la lectura tiene menos de 2 horas: si no, el sensor está sin conexión.
  const ultimas = ultimaPorSala(filas.filter((l) => l.leido_en >= hace2horas))
  const ultimoRiego = new Map<number, RiegoSala>()
  for (const r of (riegos.data || []) as (RiegoSala & { sala_id: number })[]) if (!ultimoRiego.has(r.sala_id)) ultimoRiego.set(r.sala_id, r)
  const abiertos = (ciclos.data || []) as CicloSala[]
  const salasCultivo = (salas.data || []) as SalaCultivo[]

  const lista: SalaHoy[] = salasCultivo.map((s) => {
    const ciclo = cicloActual(abiertos, s.id, hoy)
    const lectura = ultimas.get(s.id) ?? null
    const delDia = filas.filter((l) => l.sala_id === s.id && l.leido_en >= medianoche)
    const dia = delDia.length
      ? {
          t: resumenDia(delDia.map((l) => l.temperatura_c)),
          h: resumenDia(delDia.map((l) => l.humedad_rh)),
          vpd: resumenDia(delDia.map((l) => l.vpd)),
        }
      : null
    return {
      id: s.id,
      nombre: s.nombre,
      descripcion: s.descripcion,
      estado: estadoSala(ciclo, hoy),
      lectura,
      ciclo: ciclo ? resumenCiclo(ciclo, hoy) : null,
      medicion: filasMedicion(objetivosSala(ciclo, hoy, esSalaVege(s.nombre)), lectura, dia, ultimoRiego.get(s.id) ?? null),
      hitos: ciclo ? proximosHitos(ciclo, s.nombre, hoy) : [],
    }
  })

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
