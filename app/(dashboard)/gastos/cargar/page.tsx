import { CargarGasto } from "@/components/cargar-gasto"

// Para quien anota gastos sin ver la lista ni los totales (permiso
// gastos-cargar.ver, scripts/092). El permiso lo controla components/app-shell.tsx.
export default function CargarGastoPage() {
  return (
    <main className="container mx-auto px-4 py-8">
      <CargarGasto />
    </main>
  )
}
