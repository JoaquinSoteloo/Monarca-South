import { Header } from "@/components/header"
import { DeudasManager } from "@/components/deudas-manager"

export default function DeudasPage() {
  return (
    <div className="min-h-screen bg-background">
      <Header title="DEUDAS" showBack />
      <main className="container mx-auto px-4 py-8">
        <DeudasManager />
      </main>
    </div>
  )
}
