import { createClient } from "@/lib/supabase/server"
import { SociosManager } from "@/components/socios-manager"
import { Header } from "@/components/header"

export default async function SociosPage() {
  const supabase = await createClient()

  const [{ data: socios }, { data: sucursales }] = await Promise.all([
    supabase.from("socios").select("*, sucursal:sucursales(*)").order("apellido"),
    supabase.from("sucursales").select("*").eq("activo", true).order("nombre"),
  ])

  return (
    <div className="min-h-screen bg-background">
      <Header title="Socios" showBack />

      <main className="container mx-auto px-4 py-8">
        <SociosManager initialSocios={socios || []} sucursales={sucursales || []} />
      </main>
    </div>
  )
}
