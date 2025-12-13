import { createClient } from "@/lib/supabase/server"
import { StockManager } from "@/components/stock-manager"
import { ProductosManager } from "@/components/productos-manager"
import { Header } from "@/components/header"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export default async function StockPage() {
  const supabase = await createClient()
  const { data: geneticas } = await supabase.from("geneticas").select("*").order("nombre")
  const { data: productos } = await supabase.from("productos").select("*").order("nombre")

  return (
    <div className="min-h-screen bg-background">
      <Header title="Stock" showBack />

      <main className="container mx-auto px-4 py-8">
        <Tabs defaultValue="geneticas" className="space-y-6">
          <TabsList className="bg-muted">
            <TabsTrigger value="geneticas">Genéticas</TabsTrigger>
            <TabsTrigger value="productos">Productos</TabsTrigger>
          </TabsList>

          <TabsContent value="geneticas">
            <StockManager initialGeneticas={geneticas || []} />
          </TabsContent>

          <TabsContent value="productos">
            <ProductosManager initialProductos={productos || []} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}
