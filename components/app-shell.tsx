import type React from "react"
import { Suspense } from "react"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { ShieldX } from "lucide-react"
import { AppSidebar, AppMobileNav } from "@/components/app-nav"
import { AppBottomNav } from "@/components/app-bottom-nav"
import { getServerSession } from "@/lib/auth/session"
import { permisoDeRuta, primeraPantalla, tienePermiso } from "@/lib/permisos"
import { cn } from "@/lib/utils"

export async function AppShell({ children }: { children: React.ReactNode }) {
  const session = await getServerSession()
  const usuario = session
    ? { nombre: session.nombre, rol: session.rol, rolNombre: session.rolNombre, permisos: session.permisos }
    : null

  // Pantalla sin permiso para el rol: en lugar del contenido, un aviso.
  const pathname = (await headers()).get("x-pathname") ?? "/"
  const permiso = permisoDeRuta(pathname)
  const sinPermiso = !!session && !!permiso && !tienePermiso(session.permisos, permiso)
  // Quien no ve Inicio (ej.: el rol de Vilela y Pato) entra directo a su
  // primera pantalla en lugar de encontrarse con «Sin permiso».
  if (sinPermiso && pathname === "/") {
    const destino = primeraPantalla(session?.permisos)
    if (destino) redirect(destino)
  }
  // Barra de abajo en el celular para quien usa Equipo o Sede.
  const conBarra = !!session && (tienePermiso(session.permisos, "equipo.ver") || tienePermiso(session.permisos, "sede.ver"))

  return (
    <div className="monarca-theme flex min-h-screen w-full bg-background text-foreground">
      <AppSidebar usuario={usuario} />

      <div className="flex min-w-0 flex-1 flex-col">
        <AppMobileNav usuario={usuario} />
        {/* Cada pantalla trae su propio <main> con el padding/container que ya
            tenía; este div sólo aporta el espacio disponible al lado del
            sidebar, para no anidar dos <main> ni duplicar el padding. */}
        <div className={cn("min-w-0 flex-1", conBarra && "pb-24 lg:pb-0")}>
          {sinPermiso ? (
            <main className="container mx-auto px-4 py-16">
              <div className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-lg border bg-card p-8 text-center">
                <ShieldX className="h-10 w-10 text-muted-foreground" />
                <h1 className="text-lg font-semibold">Sin permiso</h1>
                <p className="text-sm text-muted-foreground">
                  Tu rol ({session?.rolNombre}) no tiene acceso a esta pantalla. Si lo necesitás, pedíselo a la comisión
                  directiva.
                </p>
              </div>
            </main>
          ) : (
            children
          )}
        </div>
      </div>

      {conBarra && session && (
        <Suspense>
          <AppBottomNav permisos={session.permisos} yoId={session.id} />
        </Suspense>
      )}
    </div>
  )
}
