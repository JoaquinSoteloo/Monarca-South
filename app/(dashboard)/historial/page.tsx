import { HistorialVentas } from "@/components/historial-ventas"
import { RankingGeneticas } from "@/components/ranking-geneticas"
import { getServerSession } from "@/lib/auth/session"

export default async function HistorialPage() {
  const session = await getServerSession()

  return (
    <main className="container mx-auto px-4 py-8">
      <RankingGeneticas />
      <HistorialVentas usuarioActual={{ nombre: session?.nombre ?? "", rol: session?.rol ?? "operador" }} />
    </main>
  )
}
