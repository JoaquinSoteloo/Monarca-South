import { getServerSession } from "@/lib/auth/session"
import { EquipoManager } from "@/components/equipo-manager"

export default async function EquipoPage() {
  const session = await getServerSession()

  if (session?.rol !== "comision") {
    return (
      <main className="container mx-auto px-4 py-8">
        <h1 className="text-[26px] font-semibold leading-tight text-foreground">Retribuciones del equipo</h1>
        <p className="mt-2 text-sm text-muted-foreground">Esta sección es sólo para la comisión directiva.</p>
      </main>
    )
  }

  return (
    <main className="container mx-auto px-4 py-8">
      <EquipoManager />
    </main>
  )
}
