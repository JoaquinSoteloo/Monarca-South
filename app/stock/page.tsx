import { createClient } from "@/lib/supabase/server"
import { StockManager } from "@/components/stock-manager"
import { Header } from "@/components/header"

export default async function StockPage() {
  const supabase = await createClient()
  const { data: geneticas } = await supabase.from("geneticas").select("*").order("nombre")

  return (
    <div className="min-h-screen bg-background">
      <Header title="Stock" showBack />

      <main className="container mx-auto px-4 py-8">
        <StockManager initialGeneticas={geneticas || []} />
      </main>
    </div>
  )
}
