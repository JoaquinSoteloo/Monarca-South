import { Header } from "@/components/header"
import { Caja } from "@/components/caja"

export default function CajaPage() {
  return (
    <div className="min-h-screen bg-background">
      <Header title="Caja" showBack />
      <main className="container mx-auto px-4 py-8">
        <Caja />
      </main>
    </div>
  )
}
