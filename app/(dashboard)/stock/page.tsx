import { createClient } from "@/lib/supabase/server"
import { StockTabs } from "@/components/stock-tabs"

export default async function StockPage() {
  const supabase = await createClient()
  const { data: geneticas } = await supabase.from("geneticas").select("*").order("nombre")
  const { data: productos } = await supabase.from("productos").select("*").order("nombre")

  return (
    <main className="container mx-auto flex flex-col gap-6 px-4 py-8">
      <div>
        <h1 className="text-[26px] font-semibold leading-tight text-foreground">Stock</h1>
        <p className="text-sm text-muted-foreground">Inventario de genéticas y productos del club</p>
      </div>

      <StockTabs geneticas={geneticas || []} productos={productos || []} />
    </main>
  )
}
