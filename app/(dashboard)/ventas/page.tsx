import { createClient } from "@/lib/supabase/server"
import { VentasManager } from "@/components/ventas-manager"

export default async function VentasPage() {
  const supabase = await createClient()

  // Calcular inicio del mes actual
  const inicioMes = new Date()
  inicioMes.setDate(1)
  inicioMes.setHours(0, 0, 0, 0)

  const [{ data: socios }, { data: geneticas }, { data: productos }, { data: ventas }, { data: ventasMes }] = await Promise.all([
    supabase.from("socios").select("*, membresia:membresias(*)").eq("activo", true).order("apellido"),
    supabase.from("geneticas").select("*").eq("activo", true).gt("gramos_disponibles", 0).order("nombre"),
    supabase.from("productos").select("*").eq("activo", true).order("nombre"),
    supabase
      .from("ventas")
      .select("*, socio:socios(nombre, apellido), genetica:geneticas(nombre)")
      .order("created_at", { ascending: false })
      .limit(50),
    supabase.from("ventas").select("socio_id, gramos").gte("created_at", inicioMes.toISOString()),
  ])

  // Calcular gramos consumidos por socio en el mes actual
  const consumoPorSocio: Record<string, number> = {}
  ventasMes?.forEach((venta) => {
    if (venta.socio_id) {
      consumoPorSocio[venta.socio_id] = (consumoPorSocio[venta.socio_id] || 0) + (venta.gramos || 0)
    }
  })

  // Agregar el consumo a cada socio
  const sociosConConsumo =
    socios?.map((socio) => ({
      ...socio,
      gramos_consumidos_mes: consumoPorSocio[socio.id] || 0,
    })) || []

  return (
          <main className="container mx-auto px-4 py-8">
        <VentasManager
          socios={sociosConConsumo}
          geneticas={geneticas || []}
          productos={productos || []}
          initialVentas={ventas || []}
        />
      </main>
  )
}
