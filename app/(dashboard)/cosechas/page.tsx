import { CosechasManager } from "@/components/cosechas-manager"
import { getServerSession } from "@/lib/auth/session"
import { tienePermiso } from "@/lib/permisos"

export default async function CosechasPage() {
  const session = await getServerSession()
  return (
    <main className="container mx-auto px-4 py-8">
      <CosechasManager puedeBorrar={tienePermiso(session?.permisos, "cosechas.borrar")} />
    </main>
  )
}
