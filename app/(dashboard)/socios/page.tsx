import { createClient } from "@/lib/supabase/server"
import { SociosManager } from "@/components/socios-manager"
import { obtenerResumenMes } from "@/lib/consumo"

export default async function SociosPage() {
  const supabase = await createClient()

  const [{ data: socios }, { data: sucursales }, resumenMes] = await Promise.all([
    // Los externos tienen su propia pantalla (/externos).
    supabase.from("socios").select("*, sucursal:sucursales(*)").eq("tipo", "socio").order("apellido"),
    supabase.from("sucursales").select("*").eq("activo", true).order("nombre"),
    obtenerResumenMes(supabase),
  ])

  // Consumo del mes = gramos SUELTOS (los enrolados no cuentan para el límite).
  const sociosConConsumo =
    socios?.map((socio) => ({
      ...socio,
      gramos_consumidos_mes: resumenMes.sueltosPorSocio[socio.id] || 0,
    })) || []

  return (
    <main className="container mx-auto px-4 py-8">
      <SociosManager initialSocios={sociosConConsumo} sucursales={sucursales || []} />
    </main>
  )
}
