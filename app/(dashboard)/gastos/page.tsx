import { GastosManager } from "@/components/gastos-manager"
import { getServerSession } from "@/lib/auth/session"
import { tienePermiso } from "@/lib/permisos"

export default async function GastosPage() {
  const session = await getServerSession()
  return (
    <main className="container mx-auto px-4 py-8">
      <GastosManager puedeEditarCategorias={tienePermiso(session?.permisos, "gastos.categorias")} />
    </main>
  )
}
