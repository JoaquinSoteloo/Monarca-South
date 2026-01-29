import { createClient } from "@/lib/supabase/server"
import { SociosManager } from "@/components/socios-manager"
import { Header } from "@/components/header"

export default async function SociosPage() {
  const supabase = await createClient()

  const inicioMes = new Date()
  inicioMes.setDate(1)
  inicioMes.setHours(0, 0, 0, 0)

  const [{ data: socios }, { data: sucursales }, { data: ventasMes }] = await Promise.all([
    supabase.from("socios").select("*, sucursal:sucursales(*)").order("apellido"),
    supabase.from("sucursales").select("*").eq("activo", true).order("nombre"),
    supabase.from("ventas").select("socio_id, gramos").gte("created_at", inicioMes.toISOString()),
  ])

  // Calcular gramos consumidos por socio en el mes actual
  const consumoPorSocio: Record<string, number> = {}
  ventasMes?.forEach((venta) => {
    if (venta.socio_id) {
      consumoPorSocio[venta.socio_id] = (consumoPorSocio[venta.socio_id] || 0) + venta.gramos
    }
  })

  // Agregar el consumo a cada socio
  const sociosConConsumo =
    socios?.map((socio) => ({
      ...socio,
      gramos_consumidos_mes: consumoPorSocio[socio.id] || 0,
    })) || []

  return (
    <div className="min-h-screen bg-background">
      <Header title="Socios" showBack />

      <main className="container mx-auto px-4 py-8">
        <SociosManager initialSocios={sociosConConsumo} sucursales={sucursales || []} />
      </main>
    </div>
  )
}
