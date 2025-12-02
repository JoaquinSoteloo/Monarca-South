"use client"

import type React from "react"

import { useState } from "react"
import { createClient } from "@/lib/supabase/client"
import type { Socio, Sucursal } from "@/lib/types"
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Plus, Pencil, Trash2, Search, AlertTriangle } from "lucide-react"
import { useRouter } from "next/navigation"

interface SociosManagerProps {
  initialSocios: Socio[]
  sucursales: Sucursal[]
}

export function SociosManager({ initialSocios, sucursales }: SociosManagerProps) {
  const [socios, setSocios] = useState(initialSocios)
  const [search, setSearch] = useState("")
  const [isOpen, setIsOpen] = useState(false)
  const [editingSocio, setEditingSocio] = useState<Socio | null>(null)
  const [loading, setLoading] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [socioToDelete, setSocioToDelete] = useState<Socio | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [dniDuplicadoDialogOpen, setDniDuplicadoDialogOpen] = useState(false)
  const [dniDuplicado, setDniDuplicado] = useState("")
  const router = useRouter()

  const [formData, setFormData] = useState({
    nombre: "",
    apellido: "",
    dni: "",
    email: "",
    telefono: "",
    gramos_mensuales: "",
    estado_reprocan: "" as "Activo" | "Pendiente" | "",
    sucursal_id: "",
  })

  const resetForm = () => {
    setFormData({
      nombre: "",
      apellido: "",
      dni: "",
      email: "",
      telefono: "",
      gramos_mensuales: "",
      estado_reprocan: "",
      sucursal_id: "",
    })
    setEditingSocio(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    const supabase = createClient()

    const dniSinPuntos = formData.dni.replace(/\./g, "")

    if (!editingSocio) {
      const { data: existingDni } = await supabase
        .from("socios")
        .select("id, nombre, apellido")
        .eq("dni", dniSinPuntos)
        .eq("activo", true)
        .single()

      if (existingDni) {
        setDniDuplicado(formData.dni)
        setDniDuplicadoDialogOpen(true)
        setLoading(false)
        return
      }
    }

    const data = {
      nombre: formData.nombre,
      apellido: formData.apellido,
      dni: dniSinPuntos,
      email: formData.email || null,
      telefono: formData.telefono || null,
      gramos_mensuales: formData.gramos_mensuales ? Number.parseInt(formData.gramos_mensuales) : null,
      estado_reprocan: formData.estado_reprocan || null,
      sucursal_id: formData.sucursal_id ? formData.sucursal_id : null,
    }

    if (editingSocio) {
      const { data: updatedSocio, error } = await supabase
        .from("socios")
        .update({ ...data, updated_at: new Date().toISOString() })
        .eq("id", editingSocio.id)
        .select("*, sucursal:sucursales(*)")
        .single()

      if (!error && updatedSocio) {
        setSocios(
          socios.map((s) =>
            s.id === editingSocio.id ? { ...updatedSocio, gramos_consumidos_mes: s.gramos_consumidos_mes } : s,
          ),
        )
      }
    } else {
      const { data: newSocio, error } = await supabase
        .from("socios")
        .insert(data)
        .select("*, sucursal:sucursales(*)")
        .single()

      if (error) {
        setDniDuplicado(formData.dni)
        setDniDuplicadoDialogOpen(true)
        setLoading(false)
        return
      } else if (newSocio) {
        setSocios([...socios, { ...newSocio, gramos_consumidos_mes: 0 }])
      }
    }

    setLoading(false)
    setIsOpen(false)
    resetForm()
    router.refresh()
  }

  const handleEdit = (socio: Socio) => {
    setEditingSocio(socio)
    setFormData({
      nombre: socio.nombre,
      apellido: socio.apellido,
      dni: socio.dni,
      email: socio.email || "",
      telefono: socio.telefono || "",
      gramos_mensuales: socio.gramos_mensuales?.toString() || "",
      estado_reprocan: socio.estado_reprocan || "",
      sucursal_id: socio.sucursal_id || "",
    })
    setIsOpen(true)
  }

  const openDeleteDialog = (socio: Socio) => {
    setSocioToDelete(socio)
    setDeleteDialogOpen(true)
  }

  const handleConfirmDelete = async () => {
    if (!socioToDelete) return

    setDeleting(true)
    const supabase = createClient()
    const { error } = await supabase.from("socios").update({ activo: false }).eq("id", socioToDelete.id)

    if (!error) {
      setSocios(socios.filter((s) => s.id !== socioToDelete.id))
      router.refresh()
    }

    setDeleting(false)
    setDeleteDialogOpen(false)
    setSocioToDelete(null)
  }

  const filteredSocios = socios.filter(
    (s) =>
      s.activo &&
      (s.nombre.toLowerCase().includes(search.toLowerCase()) ||
        s.apellido.toLowerCase().includes(search.toLowerCase()) ||
        s.dni.includes(search)),
  )

  const formatDni = (value: string) => {
    const numbers = value.replace(/\D/g, "")
    const limited = numbers.slice(0, 8)

    if (limited.length <= 1) return limited
    if (limited.length <= 3) {
      return limited
    }
    if (limited.length <= 6) {
      if (limited.length === 4) {
        return `${limited.slice(0, 1)}.${limited.slice(1)}`
      }
      if (limited.length === 5) {
        return `${limited.slice(0, 2)}.${limited.slice(2)}`
      }
      return `${limited.slice(0, 3)}.${limited.slice(3)}`
    }
    if (limited.length === 7) {
      return `${limited.slice(0, 1)}.${limited.slice(1, 4)}.${limited.slice(4)}`
    }
    return `${limited.slice(0, 2)}.${limited.slice(2, 5)}.${limited.slice(5)}`
  }

  const handleDniChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatDni(e.target.value)
    setFormData({ ...formData, dni: formatted })
  }

  return (
    <div className="space-y-6">
      <Dialog open={dniDuplicadoDialogOpen} onOpenChange={setDniDuplicadoDialogOpen}>
        <DialogContent className="bg-card border-border sm:max-w-md">
          <DialogHeader>
            <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-amber-500/10 flex items-center justify-center">
              <AlertTriangle className="h-6 w-6 text-amber-500" />
            </div>
            <DialogTitle className="text-center text-foreground">DNI ya registrado</DialogTitle>
            <DialogDescription className="text-center text-muted-foreground">
              Ya existe un socio con el DNI <span className="font-semibold text-foreground">{dniDuplicado}</span>.
              <br />
              Por favor, corregí el DNI e intentá nuevamente.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4">
            <Button
              className="w-full bg-emerald-600 hover:bg-emerald-700"
              onClick={() => setDniDuplicadoDialogOpen(false)}
            >
              Entendido
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="bg-card border-border sm:max-w-md">
          <DialogHeader>
            <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-red-500/10 flex items-center justify-center">
              <AlertTriangle className="h-6 w-6 text-red-500" />
            </div>
            <DialogTitle className="text-center text-foreground">¿Eliminar socio?</DialogTitle>
            <DialogDescription className="text-center text-muted-foreground">
              Estás por eliminar a{" "}
              <span className="font-semibold text-foreground">
                {socioToDelete?.nombre} {socioToDelete?.apellido}
              </span>{" "}
              (DNI: {socioToDelete?.dni}).
              <br />
              Esta acción no se puede deshacer.
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

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre o DNI..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 bg-background border-border"
          />
        </div>
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
              Agregar Socio
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-card border-border max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-foreground">{editingSocio ? "Editar Socio" : "Nuevo Socio"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="nombre">
                    Nombre <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="nombre"
                    value={formData.nombre}
                    onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                    required
                    className="bg-background border-border"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="apellido">
                    Apellido <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="apellido"
                    value={formData.apellido}
                    onChange={(e) => setFormData({ ...formData, apellido: e.target.value })}
                    required
                    className="bg-background border-border"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="dni">
                    DNI <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="dni"
                    value={formData.dni}
                    onChange={handleDniChange}
                    placeholder="12.345.678"
                    required
                    className="bg-background border-border"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="estado_reprocan">
                    Estado Reprocan <span className="text-red-500">*</span>
                  </Label>
                  <Select
                    value={formData.estado_reprocan}
                    onValueChange={(value: "Activo" | "Pendiente") =>
                      setFormData({ ...formData, estado_reprocan: value })
                    }
                    required
                  >
                    <SelectTrigger className="bg-background border-border">
                      <SelectValue placeholder="Seleccionar estado" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Activo">Activo</SelectItem>
                      <SelectItem value="Pendiente">Pendiente</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="sucursal">
                    Sucursal <span className="text-red-500">*</span>
                  </Label>
                  <Select
                    value={formData.sucursal_id}
                    onValueChange={(value) => setFormData({ ...formData, sucursal_id: value })}
                    required
                  >
                    <SelectTrigger className="bg-background border-border">
                      <SelectValue placeholder="Seleccionar sucursal" />
                    </SelectTrigger>
                    <SelectContent>
                      {sucursales.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="gramos_mensuales">
                    Gramos por mes <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="gramos_mensuales"
                    type="number"
                    min="1"
                    max="500"
                    value={formData.gramos_mensuales}
                    onChange={(e) => setFormData({ ...formData, gramos_mensuales: e.target.value })}
                    placeholder="Ej: 30"
                    required
                    className="bg-background border-border"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email (opcional)</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="bg-background border-border"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="telefono">Teléfono (opcional)</Label>
                  <Input
                    id="telefono"
                    value={formData.telefono}
                    onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
                    className="bg-background border-border"
                  />
                </div>
              </div>
              <Button
                type="submit"
                className="w-full bg-emerald-600 hover:bg-emerald-700"
                disabled={
                  loading ||
                  !formData.nombre ||
                  !formData.apellido ||
                  !formData.dni ||
                  !formData.estado_reprocan ||
                  !formData.sucursal_id ||
                  !formData.gramos_mensuales
                }
              >
                {loading ? "Guardando..." : editingSocio ? "Actualizar" : "Agregar"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-foreground">Lista de Socios ({filteredSocios.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {filteredSocios.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              {search ? "No se encontraron socios" : "No hay socios registrados"}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border">
                    <TableHead className="text-muted-foreground">Nombre</TableHead>
                    <TableHead className="text-muted-foreground">DNI</TableHead>
                    <TableHead className="text-muted-foreground">Estado Reprocan</TableHead>
                    <TableHead className="text-muted-foreground">Sucursal</TableHead>
                    <TableHead className="text-muted-foreground">Gramos/Mes</TableHead>
                    <TableHead className="text-muted-foreground text-right">Consumido/Mes</TableHead>
                    <TableHead className="text-muted-foreground text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSocios.map((socio) => {
                    const limite = socio.gramos_mensuales || 0
                    const consumido = socio.gramos_consumidos_mes
                    const porcentaje = limite > 0 ? (consumido / limite) * 100 : 0

                    return (
                      <TableRow key={socio.id} className="border-border">
                        <TableCell className="font-medium text-foreground">
                          {socio.apellido}, {socio.nombre}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{formatDni(socio.dni)}</TableCell>
                        <TableCell>
                          {socio.estado_reprocan ? (
                            <span
                              className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                                socio.estado_reprocan === "Activo"
                                  ? "bg-emerald-500/10 text-emerald-500"
                                  : "bg-amber-500/10 text-amber-500"
                              }`}
                            >
                              {socio.estado_reprocan}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {socio.sucursal ? (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-500/10 text-blue-500">
                              {socio.sucursal.nombre}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {socio.gramos_mensuales ? (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-500">
                              {socio.gramos_mensuales}g/mes
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <span
                            className={
                              porcentaje >= 100
                                ? "text-red-500"
                                : porcentaje >= 80
                                  ? "text-amber-500"
                                  : "text-foreground"
                            }
                          >
                            {consumido}g / {limite}g
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEdit(socio)}
                              className="hover:bg-emerald-500/10 hover:text-emerald-500"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openDeleteDialog(socio)}
                              className="hover:bg-red-500/10 hover:text-red-500"
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
          )}
        </CardContent>
      </Card>
    </div>
  )
}
