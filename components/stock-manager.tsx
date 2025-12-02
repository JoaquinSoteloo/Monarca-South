"use client"

import type React from "react"

import { useState } from "react"
import { createClient } from "@/lib/supabase/client"
import type { Genetica } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Plus, Pencil, Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"

interface StockManagerProps {
  initialGeneticas: Genetica[]
}

export function StockManager({ initialGeneticas }: StockManagerProps) {
  const [geneticas, setGeneticas] = useState(initialGeneticas)
  const [isOpen, setIsOpen] = useState(false)
  const [editingGenetica, setEditingGenetica] = useState<Genetica | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const [formData, setFormData] = useState({
    nombre: "",
    descripcion: "",
    gramos_disponibles: "",
    precio_por_gramo: "",
  })

  const resetForm = () => {
    setFormData({
      nombre: "",
      descripcion: "",
      gramos_disponibles: "",
      precio_por_gramo: "",
    })
    setEditingGenetica(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    const supabase = createClient()

    const data = {
      nombre: formData.nombre,
      descripcion: formData.descripcion || null,
      gramos_disponibles: Number.parseFloat(formData.gramos_disponibles),
      precio_por_gramo: Number.parseFloat(formData.precio_por_gramo),
    }

    if (editingGenetica) {
      const { error } = await supabase
        .from("geneticas")
        .update({ ...data, updated_at: new Date().toISOString() })
        .eq("id", editingGenetica.id)

      if (!error) {
        setGeneticas(geneticas.map((g) => (g.id === editingGenetica.id ? { ...g, ...data } : g)))
      }
    } else {
      const { data: newGenetica, error } = await supabase.from("geneticas").insert(data).select().single()

      if (!error && newGenetica) {
        setGeneticas([...geneticas, newGenetica])
      }
    }

    setLoading(false)
    setIsOpen(false)
    resetForm()
    router.refresh()
  }

  const handleEdit = (genetica: Genetica) => {
    setEditingGenetica(genetica)
    setFormData({
      nombre: genetica.nombre,
      descripcion: genetica.descripcion || "",
      gramos_disponibles: genetica.gramos_disponibles.toString(),
      precio_por_gramo: genetica.precio_por_gramo.toString(),
    })
    setIsOpen(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm("¿Estás seguro de eliminar esta genética?")) return

    const supabase = createClient()
    const { error } = await supabase.from("geneticas").update({ activo: false }).eq("id", id)

    if (!error) {
      setGeneticas(geneticas.filter((g) => g.id !== id))
      router.refresh()
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <p className="text-muted-foreground">Administra el inventario de genéticas del club</p>
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
              Agregar Genética
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-card border-border">
            <DialogHeader>
              <DialogTitle className="text-foreground">
                {editingGenetica ? "Editar Genética" : "Nueva Genética"}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="nombre">Nombre de la Genética</Label>
                <Input
                  id="nombre"
                  value={formData.nombre}
                  onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                  placeholder="Ej: OG Kush"
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
                  placeholder="Descripción de la genética..."
                  className="bg-background border-border"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="gramos">Gramos Disponibles</Label>
                  <Input
                    id="gramos"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.gramos_disponibles}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        gramos_disponibles: e.target.value,
                      })
                    }
                    placeholder="0"
                    required
                    className="bg-background border-border"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="precio">Precio por Gramo ($)</Label>
                  <Input
                    id="precio"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.precio_por_gramo}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        precio_por_gramo: e.target.value,
                      })
                    }
                    placeholder="0"
                    required
                    className="bg-background border-border"
                  />
                </div>
              </div>
              <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700" disabled={loading}>
                {loading ? "Guardando..." : editingGenetica ? "Actualizar" : "Agregar"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-foreground">Inventario de Genéticas</CardTitle>
        </CardHeader>
        <CardContent>
          {geneticas.filter((g) => g.activo).length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No hay genéticas registradas. Agrega una para comenzar.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-border">
                  <TableHead className="text-muted-foreground">Nombre</TableHead>
                  <TableHead className="text-muted-foreground">Descripción</TableHead>
                  <TableHead className="text-muted-foreground text-right">Stock (g)</TableHead>
                  <TableHead className="text-muted-foreground text-right">Precio/g</TableHead>
                  <TableHead className="text-muted-foreground text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {geneticas
                  .filter((g) => g.activo)
                  .map((genetica) => (
                    <TableRow key={genetica.id} className="border-border">
                      <TableCell className="font-medium text-foreground">{genetica.nombre}</TableCell>
                      <TableCell className="text-muted-foreground max-w-xs truncate">
                        {genetica.descripcion || "-"}
                      </TableCell>
                      <TableCell
                        className={`text-right font-medium ${
                          genetica.gramos_disponibles < 100 ? "text-amber-500" : "text-emerald-500"
                        }`}
                      >
                        {genetica.gramos_disponibles}g
                      </TableCell>
                      <TableCell className="text-right text-foreground">${genetica.precio_por_gramo}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEdit(genetica)}
                            className="hover:bg-emerald-500/10 hover:text-emerald-500"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(genetica.id)}
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
  )
}
