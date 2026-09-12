import { createClient } from "@/lib/supabase/server"
import { Header } from "@/components/header"
import { CultivoManager } from "@/components/cultivo-manager"

export default async function CultivoPage() {
  const supabase = await createClient()

  const [salasResult, geneticasResult] = await Promise.all([
    supabase
      .from("salas_cultivo")
      .select("*")
      .eq("activo", true)
      .order("id"),
    supabase
      .from("geneticas")
      .select("*")
      .eq("activo", true)
      .order("nombre"),
  ])

  const salas = salasResult.data || []
  const geneticas = geneticasResult.data || []

  // Fetch camas for each sala
  const salasWithCamas = await Promise.all(
    salas.map(async (sala) => {
      const { data: camas } = await supabase
        .from("camas_cultivo")
        .select("*")
        .eq("sala_id", sala.id)
        .order("id")
      return { ...sala, camas: camas || [] }
    })
  )

  return (
    <div className="min-h-screen bg-background">
      <Header title="Cultivo" showBack />
      <main className="container mx-auto px-4 py-8">
        <CultivoManager initialSalas={salasWithCamas} geneticas={geneticas} />
      </main>
    </div>
  )
}
