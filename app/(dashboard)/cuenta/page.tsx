import { redirect } from "next/navigation"
import { getServerSession } from "@/lib/auth/session"
import { CambiarContrasena } from "@/components/cuenta/cambiar-contrasena"

export const dynamic = "force-dynamic"

// Mi cuenta: cada persona cambia su propia contraseña. No tiene permiso propio
// (lib/permisos.ts): la usa cualquiera que haya iniciado sesión.
export default async function CuentaPage() {
  const session = await getServerSession()
  if (!session) redirect("/login")

  return (
    <main className="container mx-auto px-4 py-6">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">Mi cuenta</h1>
          <p className="text-sm text-muted-foreground">
            {session.nombre} · {session.rolNombre}
          </p>
        </header>
        <CambiarContrasena />
      </div>
    </main>
  )
}
