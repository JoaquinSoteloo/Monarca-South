import type React from "react"
import { AppSidebar, AppMobileNav } from "@/components/app-nav"

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="monarca-theme flex min-h-screen w-full bg-background text-foreground">
      <AppSidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <AppMobileNav />
        {/* Cada pantalla trae su propio <main> con el padding/container que ya
            tenía; este div sólo aporta el espacio disponible al lado del
            sidebar, para no anidar dos <main> ni duplicar el padding. */}
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  )
}
