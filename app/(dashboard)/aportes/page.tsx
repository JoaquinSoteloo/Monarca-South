import { AportesManager } from "@/components/aportes-manager"
import { getServerSession } from "@/lib/auth/session"
import { tienePermiso } from "@/lib/permisos"

export default async function AportesPage() {
  const session = await getServerSession()
  return (
    <main className="container mx-auto px-4 py-8">
      <AportesManager puedeEditar={tienePermiso(session?.permisos, "aportes.editar")} />
    </main>
  )
}
