import { createClient } from "@/lib/supabase/server"
import { VentasManager } from "@/components/ventas-manager"
import { Header } from "@/components/header"

export default async function VentasPage() {
  const supabase = await createClient()

  const [{ data: socios }, { data: geneticas }, { data: ventas }] = await Promise.all([
    supabase.from("socios").select("*, membresia:membresias(*)").eq("activo", true).order("apellido"),
    supabase.from("geneticas").select("*").eq("activo", true).gt("gramos_disponibles", 0).order("nombre"),
    supabase
      .from("ventas")
      .select("*, socio:socios(nombre, apellido), genetica:geneticas(nombre)")
      .order("created_at", { ascending: false })
      .limit(50),
  ])

  return (
    <div className="min-h-screen bg-background">
      <Header title="Ventas" showBack />

      <main className="container mx-auto px-4 py-8">
        <VentasManager socios={socios || []} geneticas={geneticas || []} initialVentas={ventas || []} />
      </main>
    </div>
  )
}
