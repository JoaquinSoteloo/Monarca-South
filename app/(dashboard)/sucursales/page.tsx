import { createClient } from "@/lib/supabase/server"
import { SucursalesManager } from "@/components/sucursales-manager"

export default async function SucursalesPage() {
  const supabase = await createClient()
  const [{ data: sucursales }, { data: socios }] = await Promise.all([
    supabase.from("sucursales").select("*").eq("activo", true).order("nombre"),
    supabase.from("socios").select("sucursal_id").eq("activo", true).eq("tipo", "socio").eq("es_generico", false),
  ])
  // Socios activos por sucursal (sucursal_id -> cantidad).
  const activosPorSucursal: Record<string, number> = {}
  for (const s of socios ?? []) {
    if (s.sucursal_id) activosPorSucursal[s.sucursal_id] = (activosPorSucursal[s.sucursal_id] ?? 0) + 1
  }

  return (
          <main className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-emerald-900 mb-8">Gestión de Sucursales</h1>
        <SucursalesManager initialSucursales={sucursales || []} activosPorSucursal={activosPorSucursal} />
      </main>
  )
}
