import { Header } from "@/components/header"
import { GastosManager } from "@/components/gastos-manager"

export default function GastosPage() {
  return (
    <div className="min-h-screen bg-background">
      <Header title="Gastos" showBack />
      <main className="container mx-auto px-4 py-8">
        <GastosManager />
      </main>
    </div>
  )
}
