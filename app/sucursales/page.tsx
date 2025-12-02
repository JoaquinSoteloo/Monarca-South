import { createClient } from "@/lib/supabase/server"
import { Header } from "@/components/header"
import { SucursalesManager } from "@/components/sucursales-manager"

export default async function SucursalesPage() {
  const supabase = await createClient()
  const { data: sucursales } = await supabase.from("sucursales").select("*").eq("activo", true).order("nombre")

  return (
    <div className="min-h-screen bg-background">
      <Header title="Sucursales" showBack />
      <main className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-emerald-900 mb-8">Gestión de Sucursales</h1>
        <SucursalesManager initialSucursales={sucursales || []} />
      </main>
    </div>
  )
}
