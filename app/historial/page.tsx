import { Header } from "@/components/header"
import { HistorialVentas } from "@/components/historial-ventas"

export default function HistorialPage() {
  return (
    <div className="min-h-screen bg-background">
      <Header title="Historial" showBack />

      <main className="container mx-auto px-4 py-8">
        <HistorialVentas />
      </main>
    </div>
  )
}
