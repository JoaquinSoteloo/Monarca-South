import { Header } from "@/components/header"
import { CitasManager } from "@/components/citas-manager"

export default function CitasPage() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-6">
        <CitasManager />
      </main>
    </div>
  )
}
