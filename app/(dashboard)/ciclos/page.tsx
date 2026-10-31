import { createClient } from "@/lib/supabase/server"
import { getPerfilActual } from "@/lib/auth/perfil"
import { getArgentinaDateString } from "@/lib/timezone"
import { CiclosManager } from "@/components/ciclos-manager"
import { filasTareasCiclo, type CicloSala } from "@/lib/ciclo"
import type { Perfil } from "@/lib/equipo"
import type { SalaCultivo } from "@/lib/types"

export const dynamic = "force-dynamic"

export default async function CiclosPage() {
  const supabase = await createClient()
  const hoy = getArgentinaDateString()
  const { perfil } = await getPerfilActual()

  const [salasR, ciclosR, perfilesR] = await Promise.all([
    supabase.from("salas_cultivo").select("*").eq("activo", true).order("id"),
    supabase.from("ciclos_sala").select("*").order("fecha_inicio"),
    supabase.from("perfiles").select("*"),
  ])

  if (ciclosR.error) {
    return (
      <main className="container mx-auto px-4 py-8">
        <div className="mx-auto max-w-xl rounded-lg border p-6 text-sm">
          <h1 className="mb-2 text-lg font-semibold">Ciclos</h1>
          <p>
            Falta crear las tablas. Correr en Supabase, en orden: <code>066</code>, <code>067</code>, <code>068</code>,{" "}
            <code>069_create_ciclos_sala.sql</code> y <code>070_seed_ciclos_actuales.sql</code>.
          </p>
        </div>
      </main>
    )
  }

  const salas = (salasR.data || []) as SalaCultivo[]
  const ciclos = (ciclosR.data || []) as CicloSala[]
  const perfiles = (perfilesR.data || []) as Perfil[]

  // Ciclos abiertos que todavía no tienen tareas (por ejemplo, los cargados
  // con el script 070): se les genera el protocolo desde hoy.
  const abiertos = ciclos.filter((c) => c.estado === "abierto")
  if (abiertos.length > 0 && perfiles.length > 0) {
    const { data: conTareas } = await supabase
      .from("tareas")
      .select("ciclo_id")
      .in("ciclo_id", abiertos.map((c) => c.id))
    const ya = new Set((conTareas || []).map((t) => t.ciclo_id as number))
    const filas = abiertos
      .filter((c) => !ya.has(c.id))
      .flatMap((c) => filasTareasCiclo(c, salas.find((s) => s.id === c.sala_id)?.nombre ?? `Sala ${c.sala_id}`, perfiles, hoy))
    if (filas.length > 0) {
      await supabase.from("tareas").upsert(filas, { onConflict: "ciclo_id,clave", ignoreDuplicates: true })
    }
  }

  return (
    <main className="container mx-auto px-4 py-8">
      <CiclosManager hoy={hoy} salas={salas} initialCiclos={ciclos} perfiles={perfiles} yo={perfil} />
    </main>
  )
}
