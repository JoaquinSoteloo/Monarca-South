"use client"

import { useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Plus, Scan } from "lucide-react"
import { StockManager } from "@/components/stock-manager"
import { ProductosManager } from "@/components/productos-manager"
import type { Genetica, Producto } from "@/lib/types"

interface StockTabsProps {
  geneticas: Genetica[]
  productos: Producto[]
}

// Wrapper cliente: sólo existe para que las acciones de cada pestaña
// compartan la fila con las pestañas mismas (Radix Tabs necesita `value`
// controlado para saber cuál está activa). La lógica de alta/edición de
// genéticas y productos sigue 100% en sus managers — acá sólo se controla
// el abrir/cerrar de sus diálogos y del escáner.
export function StockTabs({ geneticas, productos }: StockTabsProps) {
  const [tab, setTab] = useState("geneticas")
  const [geneticaDialogOpen, setGeneticaDialogOpen] = useState(false)
  const [productoDialogOpen, setProductoDialogOpen] = useState(false)
  const [scannerOpen, setScannerOpen] = useState(false)

  return (
    <Tabs value={tab} onValueChange={setTab} className="gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <TabsList className="bg-muted">
          <TabsTrigger
            value="geneticas"
            className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
          >
            Genéticas
          </TabsTrigger>
          <TabsTrigger
            value="productos"
            className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
          >
            Productos
          </TabsTrigger>
        </TabsList>

        {tab === "geneticas" && (
          <Button onClick={() => setGeneticaDialogOpen(true)} className="w-full sm:w-auto">
            <Plus className="h-4 w-4 mr-2" />
            Agregar genética
          </Button>
        )}

        {tab === "productos" && (
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            <Button
              onClick={() => setScannerOpen(true)}
              variant="outline"
              className="flex-1 bg-card sm:flex-none"
            >
              <Scan className="h-4 w-4 mr-2" />
              Escanear código
            </Button>
            <Button onClick={() => setProductoDialogOpen(true)} className="flex-1 sm:flex-none">
              <Plus className="h-4 w-4 mr-2" />
              Agregar producto
            </Button>
          </div>
        )}
      </div>

      <TabsContent value="geneticas">
        <StockManager
          initialGeneticas={geneticas}
          dialogOpen={geneticaDialogOpen}
          onDialogOpenChange={setGeneticaDialogOpen}
        />
      </TabsContent>

      <TabsContent value="productos">
        <ProductosManager
          initialProductos={productos}
          dialogOpen={productoDialogOpen}
          onDialogOpenChange={setProductoDialogOpen}
          scannerOpen={scannerOpen}
          onScannerOpenChange={setScannerOpen}
        />
      </TabsContent>
    </Tabs>
  )
}
