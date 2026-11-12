import { DeudasManager } from "@/components/deudas-manager"
import { getServerSession } from "@/lib/auth/session"
import { tienePermiso } from "@/lib/permisos"

export default async function DeudasPage() {
  const session = await getServerSession()
  return (
    <main className="container mx-auto px-4 py-8">
      <DeudasManager puedeCorregir={tienePermiso(session?.permisos, "deudas.corregir")} />
    </main>
  )
}
