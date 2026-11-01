import { createClient } from "@/lib/supabase/server"
import { VentasManager } from "@/components/ventas-manager"
import { getServerSession } from "@/lib/auth/session"
import { obtenerResumenMes } from "@/lib/consumo"

export default async function VentasPage() {
  const supabase = await createClient()

  const [session, { data: socios }, { data: geneticas }, { data: productos }, { data: ventas }, resumenMes, { data: config }] =
    await Promise.all([
      getServerSession(),
      // El registro genérico "No socios" conserva su historial pero ya no
      // admite entregas nuevas (scripts/066): no se ofrece en la lista.
      supabase
        .from("socios")
        .select("*, membresia:membresias(*)")
        .eq("activo", true)
        .eq("es_generico", false)
        .order("apellido"),
      supabase.from("geneticas").select("*").eq("activo", true).or("gramos_disponibles.gt.0,gramos_enrolados.gt.0").order("nombre"),
      supabase.from("productos").select("*").eq("activo", true).order("nombre"),
      supabase
        .from("ventas")
        .select("*, socio:socios(nombre, apellido), genetica:geneticas(nombre)")
        .order("created_at", { ascending: false })
        .limit(50),
      obtenerResumenMes(supabase),
      supabase.from("config_entregas").select("max_entregas_externo_mes").maybeSingle(),
    ])

  // gramos_consumidos_mes = gramos SUELTOS del mes (los enrolados no cuentan
  // para el límite).
  const sociosConConsumo =
    socios?.map((socio) => ({
      ...socio,
      gramos_consumidos_mes: resumenMes.sueltosPorSocio[socio.id] || 0,
      entregas_mes: resumenMes.entregasPorSocio[socio.id] || 0,
    })) || []

  return (
    <main className="container mx-auto px-4 py-8">
      <VentasManager
        socios={sociosConConsumo}
        geneticas={geneticas || []}
        productos={productos || []}
        initialVentas={ventas || []}
        usuarioActual={{ nombre: session?.nombre ?? "", rol: session?.rol ?? "operador" }}
        maxEntregasExterno={config?.max_entregas_externo_mes ?? 3}
      />
    </main>
  )
}
