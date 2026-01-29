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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Plus, Pencil, Trash2, Scan } from "lucide-react"
import { useRouter } from "next/navigation"
import { BarcodeScanner } from "./barcode-scanner"

interface ProductosManagerProps {
  initialProductos: Producto[]
}

export function ProductosManager({ initialProductos }: ProductosManagerProps) {
  const [productos, setProductos] = useState(initialProductos)
  const [isOpen, setIsOpen] = useState(false)
  const [isScannerOpen, setIsScannerOpen] = useState(false)
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
      setIsOpen(true)
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
    setIsOpen(false)
    resetForm()
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
    setIsOpen(true)
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

  return (
    <>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <p className="text-muted-foreground">Administra productos adicionales (rosin, accesorios, etc)</p>
          <div className="flex gap-2">
            <Button
              onClick={() => setIsScannerOpen(true)}
              variant="outline"
              className="border-emerald-600 text-emerald-600 hover:bg-emerald-600/10"
            >
              <Scan className="h-4 w-4 mr-2" />
              Escanear Código
            </Button>
            <Dialog
              open={isOpen}
              onOpenChange={(open) => {
                setIsOpen(open)
                if (!open) resetForm()
              }}
            >
              <DialogTrigger asChild>
                <Button className="bg-emerald-600 hover:bg-emerald-700">
                  <Plus className="h-4 w-4 mr-2" />
                  Agregar Producto
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-card border-border">
                <DialogHeader>
                  <DialogTitle className="text-foreground">
                    {editingProducto ? "Editar Producto" : "Nuevo Producto"}
                  </DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="codigo_barras">Código de Barras (opcional)</Label>
                    <Input
                      id="codigo_barras"
                      value={formData.codigo_barras}
                      onChange={(e) => setFormData({ ...formData, codigo_barras: e.target.value })}
                      placeholder="7891234567890"
                      className="bg-background border-border"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="nombre">Nombre del Producto</Label>
                    <Input
                      id="nombre"
                      value={formData.nombre}
                      onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                      placeholder="Ej: Rosin Premium 1g"
                      required
                      className="bg-background border-border"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="descripcion">Descripción (opcional)</Label>
                    <Textarea
                      id="descripcion"
                      value={formData.descripcion}
                      onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                      placeholder="Descripción del producto..."
                      className="bg-background border-border"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="precio">Precio ($)</Label>
                      <Input
                        id="precio"
                        type="number"
                        step="0.01"
                        min="0"
                        value={formData.precio}
                        onChange={(e) => setFormData({ ...formData, precio: e.target.value })}
                        placeholder="0"
                        required
                        className="bg-background border-border"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="cantidad">Cantidad</Label>
                      <Input
                        id="cantidad"
                        type="number"
                        min="0"
                        value={formData.cantidad}
                        onChange={(e) => setFormData({ ...formData, cantidad: e.target.value })}
                        placeholder="0"
                        required
                        className="bg-background border-border"
                      />
                    </div>
                  </div>
                  <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700" disabled={loading}>
                    {loading ? "Guardando..." : editingProducto ? "Actualizar" : "Agregar"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-foreground">Inventario de Productos</CardTitle>
          </CardHeader>
          <CardContent>
            {productos.filter((p) => p.activo).length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                No hay productos registrados. Agrega uno para comenzar.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-border">
                    <TableHead className="text-muted-foreground">Código</TableHead>
                    <TableHead className="text-muted-foreground">Nombre</TableHead>
                    <TableHead className="text-muted-foreground">Descripción</TableHead>
                    <TableHead className="text-muted-foreground text-right">Precio</TableHead>
                    <TableHead className="text-muted-foreground text-right">Cantidad</TableHead>
                    <TableHead className="text-muted-foreground text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {productos
                    .filter((p) => p.activo)
                    .map((producto) => (
                      <TableRow key={producto.id} className="border-border">
                        <TableCell className="font-mono text-sm text-muted-foreground">
                          {producto.codigo_barras || "-"}
                        </TableCell>
                        <TableCell className="font-medium text-foreground">{producto.nombre}</TableCell>
                        <TableCell className="text-muted-foreground max-w-xs truncate">
                          {producto.descripcion || "-"}
                        </TableCell>
                        <TableCell className="text-right text-foreground font-medium">${producto.precio}</TableCell>
                        <TableCell
                          className={`text-right font-medium ${
                            producto.cantidad < 5 ? "text-amber-500" : "text-emerald-500"
                          }`}
                        >
                          {producto.cantidad}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEdit(producto)}
                              className="hover:bg-emerald-500/10 hover:text-emerald-500"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDelete(producto.id)}
                              className="hover:bg-red-500/10 hover:text-red-500"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <BarcodeScanner isOpen={isScannerOpen} onClose={() => setIsScannerOpen(false)} onScan={handleScan} />
    </>
  )
}
