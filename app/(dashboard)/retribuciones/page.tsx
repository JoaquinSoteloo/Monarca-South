import { getServerSession } from "@/lib/auth/session"
import { tienePermiso } from "@/lib/permisos"
import { RetribucionesManager } from "@/components/retribuciones-manager"

// Ver la pantalla lo controla el layout (retribuciones.ver); cargar personas,
// liquidar y anular necesita retribuciones.liquidar.
export default async function RetribucionesPage() {
  const session = await getServerSession()
  return (
    <main className="container mx-auto px-4 py-8">
      <RetribucionesManager puedeLiquidar={tienePermiso(session?.permisos, "retribuciones.liquidar")} />
    </main>
  )
}
