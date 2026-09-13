import { PreviewShell } from "@/components/preview/preview-shell"
import { VentasPreview } from "@/components/preview/ventas-preview"

export default function PreviewVentasPage() {
  return (
    <PreviewShell title="Ventas">
      <div className="mx-auto max-w-5xl">
        <h1 className="mb-6 text-[26px] font-semibold leading-tight text-foreground">Registrar venta</h1>
        <VentasPreview />
      </div>
    </PreviewShell>
  )
}
