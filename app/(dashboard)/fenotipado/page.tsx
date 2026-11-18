import { createClient } from "@/lib/supabase/server"
import { getServerSession } from "@/lib/auth/session"
import { tienePermiso } from "@/lib/permisos"
import { getArgentinaDateString } from "@/lib/timezone"
import { FenotipadoManager } from "@/components/fenotipado-manager"
import type { ObservacionFeno, PlantaFeno } from "@/lib/fenotipado"

// Fenotipado de semillas (pedido de Facundo, 18/11/2026; script 104).
export default async function FenotipadoPage() {
  const supabase = await createClient()
  const session = await getServerSession()
  const [plantas, observaciones, usuario] = await Promise.all([
    supabase.from("fenotipado_plantas").select("*").order("codigo"),
    supabase.from("fenotipado_observaciones").select("*").order("fecha").order("id"),
    supabase.auth.getUser(),
  ])

  return (
    <main className="container mx-auto px-4 py-8">
      <FenotipadoManager
        initialPlantas={(plantas.data ?? []) as PlantaFeno[]}
        initialObservaciones={(observaciones.data ?? []) as ObservacionFeno[]}
        tablaFaltante={Boolean(plantas.error)}
        puedeEditar={tienePermiso(session?.permisos, "fenotipado.editar")}
        puedeUsarAsistente={tienePermiso(session?.permisos, "sede.ver")}
        userId={usuario.data.user?.id ?? null}
        hoy={getArgentinaDateString()}
      />
    </main>
  )
}
