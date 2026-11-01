import { createClient } from "@/lib/supabase/server"
import { getPerfilActual } from "@/lib/auth/perfil"
import { ProcesosManager } from "@/components/procesos-manager"
import type { Perfil } from "@/lib/equipo"
import type { Proceso, ProcesoPaso, ProcesoPlantilla } from "@/lib/procesos"
import type { SalaCultivo } from "@/lib/types"

export const dynamic = "force-dynamic"

export default async function ProcesosPage() {
  const { perfil, tablaFaltante } = await getPerfilActual()
  const supabase = await createClient()

  const [plantillasR, enCursoR, terminadosR, salasR, perfilesR] = await Promise.all([
    supabase.from("procesos_plantilla").select("*").eq("activo", true).order("orden"),
    supabase.from("procesos").select("*").eq("estado", "en_curso").order("created_at", { ascending: false }),
    supabase.from("procesos").select("*").neq("estado", "en_curso").order("created_at", { ascending: false }).limit(15),
    supabase.from("salas_cultivo").select("*").eq("activo", true).order("id"),
    supabase.from("equipo_perfiles").select("*").order("nombre"),
  ])

  if (tablaFaltante || plantillasR.error || !perfil) {
    return (
      <main className="container mx-auto px-4 py-8">
        <div className="mx-auto max-w-xl rounded-lg border p-6 text-sm">
          <h1 className="mb-2 text-lg font-semibold">Procedimientos</h1>
          {plantillasR.error || tablaFaltante ? (
            <p>
              Falta crear las tablas. Correr en Supabase, en orden, los scripts <code>069</code> a <code>073</code> y después{" "}
              <code>074_create_procesos.sql</code> y <code>075_seed_procesos.sql</code>.
            </p>
          ) : (
            <p>Cada persona tiene que entrar con su propio usuario para iniciar y completar procedimientos.</p>
          )}
        </div>
      </main>
    )
  }

  const procesos = [...((enCursoR.data || []) as Proceso[]), ...((terminadosR.data || []) as Proceso[])]
  const { data: pasos } = procesos.length
    ? await supabase.from("procesos_pasos").select("*").in("proceso_id", procesos.map((p) => p.id))
    : { data: [] }

  return (
    <main className="container mx-auto px-4 py-8">
      <ProcesosManager
        yo={perfil}
        perfiles={(perfilesR.data || []) as Perfil[]}
        salas={(salasR.data || []) as SalaCultivo[]}
        plantillas={(plantillasR.data || []) as ProcesoPlantilla[]}
        procesos={procesos}
        pasos={(pasos || []) as ProcesoPaso[]}
      />
    </main>
  )
}
