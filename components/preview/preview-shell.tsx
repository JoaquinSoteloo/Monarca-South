import type React from "react"
import { Info } from "lucide-react"
import { MonarcaSidebar, MonarcaMobileNav } from "@/components/preview/monarca-nav"

export function PreviewShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="monarca-preview flex min-h-screen w-full bg-background text-foreground">
      <MonarcaSidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <MonarcaMobileNav title={title} />

        <div className="border-b border-border bg-muted px-4 py-2 lg:px-6">
          <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Info className="h-3.5 w-3.5 shrink-0" />
            Vista previa de diseño — los datos son ficticios y ninguna acción se guarda de verdad.
          </p>
        </div>

        <main className="min-w-0 flex-1 px-4 py-6 lg:px-6 lg:py-8">{children}</main>
      </div>
    </div>
  )
}
