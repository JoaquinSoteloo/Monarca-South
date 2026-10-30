import type React from "react"
import { AppSidebar, AppMobileNav } from "@/components/app-nav"
import { getServerSession } from "@/lib/auth/session"

export async function AppShell({ children }: { children: React.ReactNode }) {
  const session = await getServerSession()
  const usuario = session ? { nombre: session.nombre, rol: session.rol } : null

  return (
    <div className="monarca-theme flex min-h-screen w-full bg-background text-foreground">
      <AppSidebar usuario={usuario} />

      <div className="flex min-w-0 flex-1 flex-col">
        <AppMobileNav usuario={usuario} />
        {/* Cada pantalla trae su propio <main> con el padding/container que ya
            tenía; este div sólo aporta el espacio disponible al lado del
            sidebar, para no anidar dos <main> ni duplicar el padding. */}
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  )
}
