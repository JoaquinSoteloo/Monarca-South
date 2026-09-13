"use client"

import type React from "react"
import { useState } from "react"
import { createClient } from "@/lib/supabase/client"
import type { Producto } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Pencil, Trash2, PackageX, PackageSearch, PackageCheck } from "lucide-react"
import { useRouter } from "next/navigation"
import { BarcodeScanner } from "./barcode-scanner"
import { cn } from "@/lib/utils"
import { formatCurrency, formatNumero } from "@/lib/format"

interface ProductosManagerProps {
  initialProductos: Producto[]
  // El diálogo de alta/edición y el escáner se abren desde botones que ahora
  // viven junto a las pestañas (ver components/stock-tabs.tsx), para
  // compartir la misma fila. El estado de apertura lo controla ese padre;
  // acá sigue toda la lógica de guardado y de escaneo, sin cambios.
  dialogOpen: boolean
  onDialogOpenChange: (open: boolean) => void
  scannerOpen: boolean
  onScannerOpenChange: (open: boolean) => void
}

// Mismo umbral de "stock bajo" que ya usaba esta tabla (cantidad < 5) —
// distinto del de Genéticas (gramos < 100), no se mezclan. Sólo se subdivide
// en 0 para diferenciar "sin stock" de "stock bajo", igual que en Genéticas.
function getDisponibilidadProducto(cantidad: number) {
  if (cantidad <= 0) {
    return {
      label: "Sin stock",
      Icon: PackageX,
      textClass: "text-muted-foreground",
      bgClass: "bg-muted text-muted-foreground",
    }
  }
  if (cantidad < 5) {
    return {
      label: "Stock bajo",
      Icon: PackageSearch,
      textClass: "text-amber-700",
      bgClass: "bg-amber-50 text-amber-700",
    }
  }
  return {
    label: "Disponible",
    Icon: PackageCheck,
    textClass: "text-primary",
    bgClass: "bg-primary/10 text-primary",
  }
}

export function ProductosManager({
  initialProductos,
  dialogOpen,
  onDialogOpenChange,
  scannerOpen,
  onScannerOpenChange,
}: ProductosManagerProps) {
  const [productos, setProductos] = useState(initialProductos)
  const [editingProducto, setEditingProducto] = useState<Producto | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const [formData, setFormData] = useState({
    codigo_barras: "",
    nombre: "",
    descripcion: "",
    precio: "",
    cantidad: "",
  })

  const resetForm = () => {
    setFormData({
      codigo_barras: "",
      nombre: "",
      descripcion: "",
      precio: "",
      cantidad: "",
    })
    setEditingProducto(null)
  }

  const closeAndReset = () => {
    onDialogOpenChange(false)
    resetForm()
  }

  const handleScan = async (barcode: string) => {
    const supabase = createClient()

    // Buscar si el producto ya existe
    const { data: existing } = await supabase.from("productos").select("*").eq("codigo_barras", barcode).single()

    if (existing) {
      // Si existe, cargar para editar
      handleEdit(existing)
    } else {
      // Si no existe, pre-cargar el código de barras
      setFormData({
        codigo_barras: barcode,
        nombre: "",
        descripcion: "",
        precio: "",
        cantidad: "",
      })
      onDialogOpenChange(true)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    const supabase = createClient()

    const data = {
      codigo_barras: formData.codigo_barras || null,
      nombre: formData.nombre,
      descripcion: formData.descripcion || null,
      precio: Number.parseFloat(formData.precio),
      cantidad: Number.parseInt(formData.cantidad),
    }

    if (editingProducto) {
      const { error } = await supabase
        .from("productos")
        .update({ ...data, updated_at: new Date().toISOString() })
        .eq("id", editingProducto.id)

      if (!error) {
        setProductos(productos.map((p) => (p.id === editingProducto.id ? { ...p, ...data } : p)))
      }
    } else {
      const { data: newProducto, error } = await supabase.from("productos").insert(data).select().single()

      if (!error && newProducto) {
        setProductos([...productos, newProducto])
      }
    }

    setLoading(false)
    closeAndReset()
    router.refresh()
  }

  const handleEdit = (producto: Producto) => {
    setEditingProducto(producto)
    setFormData({
      codigo_barras: producto.codigo_barras || "",
      nombre: producto.nombre,
      descripcion: producto.descripcion || "",
      precio: producto.precio.toString(),
      cantidad: producto.cantidad.toString(),
    })
    onDialogOpenChange(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm("¿Estás seguro de eliminar este producto?")) return

    const supabase = createClient()
    const { error } = await supabase.from("productos").update({ activo: false }).eq("id", id)

    if (!error) {
      setProductos(productos.filter((p) => p.id !== id))
      router.refresh()
    }
  }

  const activos = productos.filter((p) => p.activo)

  return (
    <div className="flex flex-col gap-6">
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          onDialogOpenChange(open)
          if (!open) resetForm()
        }}
      >
        <DialogContent className="w-[calc(100%-2rem)] sm:max-w-[800px] max-h-[90dvh] grid-rows-[auto_1fr_auto] gap-0 overflow-hidden bg-background p-0">
          <DialogHeader className="border-b border-border bg-card px-6 py-4 pr-12">
            <DialogTitle className="text-foreground">
              {editingProducto ? "Editar producto" : "Nuevo producto"}
            </DialogTitle>
          </DialogHeader>

          <form id="producto-form" onSubmit={handleSubmit} className="contents">
            <div className="min-h-0 overflow-y-auto bg-background px-6 py-5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.3fr_1fr]">
                {/* Columna izquierda: información del producto */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-primary">Información del producto</h3>
                  <div className="space-y-2">
                    <Label htmlFor="nombre">
                      Nombre <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="nombre"
                      value={formData.nombre}
                      onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                      placeholder="Ej: Rosin Premium 1g"
                      required
                      className="bg-card"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="codigo_barras">Código de barras (opcional)</Label>
                    <Input
                      id="codigo_barras"
                      type="text"
                      inputMode="numeric"
                      value={formData.codigo_barras}
                      onChange={(e) => setFormData({ ...formData, codigo_barras: e.target.value })}
                      placeholder="7891234567890"
                      className="bg-card"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="descripcion">Descripción (opcional)</Label>
                    <Textarea
                      id="descripcion"
                      value={formData.descripcion}
                      onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                      placeholder="Descripción del producto..."
                      className="bg-card"
                    />
                  </div>
                </div>

                {/* Columna derecha: precio y existencias */}
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-primary">Precio y existencias</h3>
                  <div className="space-y-4 rounded-lg border border-primary/20 bg-primary/5 p-4">
                    <div className="space-y-2">
                      <Label htmlFor="precio">
                        Precio <span className="text-destructive">*</span>
                      </Label>
                      <div className="relative">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                          $
                        </span>
                        <Input
                          id="precio"
                          type="number"
                          step="0.01"
                          min="0"
                          value={formData.precio}
                          onChange={(e) => setFormData({ ...formData, precio: e.target.value })}
                          placeholder="0"
                          required
                          className="bg-card pl-7"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="cantidad">
                        Cantidad <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="cantidad"
                        type="number"
                        min="0"
                        value={formData.cantidad}
                        onChange={(e) => setFormData({ ...formData, cantidad: e.target.value })}
                        placeholder="0"
                        required
                        className="bg-card"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter className="border-t border-border bg-card px-6 py-4">
              <Button type="button" variant="outline" className="bg-card" onClick={closeAndReset}>
                Cancelar
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? "Guardando..." : editingProducto ? "Guardar cambios" : "Agregar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <BarcodeScanner isOpen={scannerOpen} onClose={() => onScannerOpenChange(false)} onScan={handleScan} />

      <Card className="bg-card border-border gap-3">
        <CardHeader>
          <CardTitle className="text-foreground">Inventario de productos</CardTitle>
        </CardHeader>
        <CardContent>
          {activos.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No hay productos registrados. Agregá uno para comenzar.
            </p>
          ) : (
            <>
              {/* Escritorio/tablet: tabla */}
              <div className="hidden rounded-md border border-border overflow-x-auto md:block">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-primary/10 hover:bg-primary/10">
                      <TableHead className="text-foreground">Producto</TableHead>
                      <TableHead className="text-foreground">Disponible</TableHead>
                      <TableHead className="text-right text-foreground">Precio</TableHead>
                      <TableHead className="text-center text-foreground w-24">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activos.map((producto) => {
                      const disponibilidad = getDisponibilidadProducto(producto.cantidad)
                      return (
                        <TableRow key={producto.id} className="hover:bg-muted/40">
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="font-medium text-foreground">{producto.nombre}</span>
                              {producto.codigo_barras && (
                                <span className="text-xs text-muted-foreground select-text font-mono">
                                  {producto.codigo_barras}
                                </span>
                              )}
                              {producto.descripcion && (
                                <span className="text-xs text-muted-foreground line-clamp-1 max-w-xs">
                                  {producto.descripcion}
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-0.5">
                              <span className="font-medium text-foreground tabular-nums">
                                {formatNumero(producto.cantidad)}
                              </span>
                              <span className={cn("inline-flex items-center gap-1 text-xs", disponibilidad.textClass)}>
                                <disponibilidad.Icon className="h-3 w-3 shrink-0" />
                                {disponibilidad.label}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <span className="font-medium text-foreground tabular-nums">
                              {formatCurrency(producto.precio)}
                            </span>
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEdit(producto)}
                                className="h-9 w-9 p-0 hover:bg-primary/10"
                                title="Editar producto"
                                aria-label={`Editar ${producto.nombre}`}
                              >
                                <Pencil className="h-4 w-4 text-primary" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDelete(producto.id)}
                                className="h-9 w-9 p-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                title="Eliminar producto"
                                aria-label={`Eliminar ${producto.nombre}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Móvil: fichas */}
              <div className="flex flex-col gap-3 md:hidden">
                {activos.map((producto) => {
                  const disponibilidad = getDisponibilidadProducto(producto.cantidad)
                  return (
                    <div key={producto.id} className="rounded-lg border border-border bg-card p-4 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium text-foreground">{producto.nombre}</p>
                          {producto.codigo_barras && (
                            <p className="text-xs text-muted-foreground select-text font-mono mt-0.5">
                              {producto.codigo_barras}
                            </p>
                          )}
                          {producto.descripcion && (
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{producto.descripcion}</p>
                          )}
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(producto)}
                            className="h-9 w-9 p-0 hover:bg-primary/10"
                            title="Editar producto"
                            aria-label={`Editar ${producto.nombre}`}
                          >
                            <Pencil className="h-4 w-4 text-primary" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(producto.id)}
                            className="h-9 w-9 p-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                            title="Eliminar producto"
                            aria-label={`Eliminar ${producto.nombre}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-3">
                        <div
                          className={cn(
                            "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm",
                            disponibilidad.bgClass,
                          )}
                        >
                          <disponibilidad.Icon className="h-4 w-4 shrink-0" />
                          <span className="font-medium tabular-nums">{formatNumero(producto.cantidad)}</span>
                          <span className="text-xs">{disponibilidad.label}</span>
                        </div>
                        <span className="font-medium text-foreground tabular-nums">
                          {formatCurrency(producto.precio)}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
