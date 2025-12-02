"use client"

import type React from "react"
import { useState } from "react"
import { createClient } from "@/lib/supabase/client"
import type { Sucursal } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Plus, Pencil, Trash2, MapPin, AlertTriangle } from "lucide-react"
import { useRouter } from "next/navigation"

interface SucursalesManagerProps {
  initialSucursales: Sucursal[]
}

export function SucursalesManager({ initialSucursales }: SucursalesManagerProps) {
  const [sucursales, setSucursales] = useState(initialSucursales)
  const [isOpen, setIsOpen] = useState(false)
  const [editingSucursal, setEditingSucursal] = useState<Sucursal | null>(null)
  const [loading, setLoading] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [sucursalToDelete, setSucursalToDelete] = useState<Sucursal | null>(null)
  const [deleting, setDeleting] = useState(false)
  const router = useRouter()

  const [formData, setFormData] = useState({
    nombre: "",
    direccion: "",
  })

  const resetForm = () => {
    setFormData({ nombre: "", direccion: "" })
    setEditingSucursal(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    const supabase = createClient()

    const data = {
      nombre: formData.nombre,
      direccion: formData.direccion || null,
    }

    if (editingSucursal) {
      const { error } = await supabase
        .from("sucursales")
        .update({ ...data, updated_at: new Date().toISOString() })
        .eq("id", editingSucursal.id)

      if (!error) {
        setSucursales(sucursales.map((s) => (s.id === editingSucursal.id ? { ...s, ...data } : s)))
      }
    } else {
      const { data: newSucursal, error } = await supabase.from("sucursales").insert(data).select("*").single()

      if (!error && newSucursal) {
        setSucursales([...sucursales, newSucursal])
      }
    }

    setLoading(false)
    setIsOpen(false)
    resetForm()
    router.refresh()
  }

  const handleEdit = (sucursal: Sucursal) => {
    setEditingSucursal(sucursal)
    setFormData({
      nombre: sucursal.nombre,
      direccion: sucursal.direccion || "",
    })
    setIsOpen(true)
  }

  const openDeleteDialog = (sucursal: Sucursal) => {
    setSucursalToDelete(sucursal)
    setDeleteDialogOpen(true)
  }

  const handleConfirmDelete = async () => {
    if (!sucursalToDelete) return

    setDeleting(true)
    const supabase = createClient()
    const { error } = await supabase.from("sucursales").update({ activo: false }).eq("id", sucursalToDelete.id)

    if (!error) {
      setSucursales(sucursales.filter((s) => s.id !== sucursalToDelete.id))
      router.refresh()
    }

    setDeleting(false)
    setDeleteDialogOpen(false)
    setSucursalToDelete(null)
  }

  return (
    <div className="space-y-6">
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="bg-card border-border sm:max-w-md">
          <DialogHeader>
            <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-red-500/10 flex items-center justify-center">
              <AlertTriangle className="h-6 w-6 text-red-500" />
            </div>
            <DialogTitle className="text-center text-foreground">¿Eliminar sucursal?</DialogTitle>
            <DialogDescription className="text-center text-muted-foreground">
              Estás por eliminar la sucursal{" "}
              <span className="font-semibold text-foreground">{sucursalToDelete?.nombre}</span>.
              <br />
              Los socios asignados a esta sucursal quedarán sin sucursal.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-3 sm:gap-3 mt-4">
            <Button
              variant="outline"
              className="flex-1 border-border bg-transparent"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={deleting}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              className="flex-1 bg-red-600 hover:bg-red-700"
              onClick={handleConfirmDelete}
              disabled={deleting}
            >
              {deleting ? "Eliminando..." : "Sí, eliminar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex justify-end">
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
              Agregar Sucursal
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-card border-border">
            <DialogHeader>
              <DialogTitle className="text-foreground">
                {editingSucursal ? "Editar Sucursal" : "Nueva Sucursal"}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="nombre">Nombre de la Sucursal</Label>
                <Input
                  id="nombre"
                  value={formData.nombre}
                  onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                  required
                  placeholder="Ej: Salas Itaqui"
                  className="bg-background border-border"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="direccion">Dirección</Label>
                <Input
                  id="direccion"
                  value={formData.direccion}
                  onChange={(e) => setFormData({ ...formData, direccion: e.target.value })}
                  placeholder="Dirección de la sucursal"
                  className="bg-background border-border"
                />
              </div>
              <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700" disabled={loading}>
                {loading ? "Guardando..." : editingSucursal ? "Actualizar" : "Agregar"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-foreground flex items-center gap-2">
            <MapPin className="h-5 w-5 text-emerald-600" />
            Sucursales ({sucursales.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {sucursales.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No hay sucursales registradas</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-border">
                  <TableHead className="text-muted-foreground">Nombre</TableHead>
                  <TableHead className="text-muted-foreground">Dirección</TableHead>
                  <TableHead className="text-muted-foreground text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sucursales.map((sucursal) => (
                  <TableRow key={sucursal.id} className="border-border">
                    <TableCell className="font-medium text-foreground">{sucursal.nombre}</TableCell>
                    <TableCell className="text-muted-foreground">{sucursal.direccion || "-"}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(sucursal)}
                          className="hover:bg-emerald-500/10 hover:text-emerald-500"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openDeleteDialog(sucursal)}
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
