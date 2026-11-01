import { HistorialVentas } from "@/components/historial-ventas"
import { getServerSession } from "@/lib/auth/session"

export default async function HistorialPage() {
  const session = await getServerSession()

  return (
    <main className="container mx-auto px-4 py-8">
      <HistorialVentas usuarioActual={{ nombre: session?.nombre ?? "", rol: session?.rol ?? "operador" }} />
    </main>
  )
}
