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
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Plus, Pencil, Trash2, Search, AlertTriangle, Crown, Star, CheckCircle2, Clock } from "lucide-react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { formatGramos } from "@/lib/format"

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
    es_miembro: false,
    es_vip: false,
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
      es_miembro: false,
      es_vip: false,
    })
    setEditingSocio(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    const supabase = createClient()

    const dniSinPuntos = formData.dni.replace(/\./g, "")

    if (!editingSocio) {
      const { data: existingDni, error: checkError } = await supabase
        .from("socios")
        .select("id, nombre, apellido")
        .eq("dni", dniSinPuntos)
        .eq("activo", true)
        .maybeSingle()

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
      es_miembro: formData.es_miembro,
      es_vip: formData.es_vip,
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
      es_miembro: socio.es_miembro || false,
      es_vip: socio.es_vip || false,
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

  // Bloque de consumo mensual (barra + estado), compartido entre la fila de
  // tabla (desktop) y la tarjeta apilada (mobile, <sm) para no duplicar el
  // cálculo de excedido/cerca del límite en dos lugares.
  const renderConsumo = (socio: Socio) => {
    const limiteConfigurado = socio.gramos_mensuales !== null && socio.gramos_mensuales !== undefined
    const limite = socio.gramos_mensuales ?? 0
    const consumido = socio.gramos_consumidos_mes
    const excedente = Math.max(0, consumido - limite)
    const excedido = limiteConfigurado && excedente > 0
    const porcentaje = !limiteConfigurado ? 0 : limite > 0 ? (consumido / limite) * 100 : consumido > 0 ? 100 : 0
    const porcentajeBarra = Math.min(100, Math.max(0, porcentaje))
    const cercaDelLimite = limiteConfigurado && !excedido && limite > 0 && porcentaje >= 80

    if (!limiteConfigurado) {
      return (
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          {formatGramos(consumido)} consumidos
          <span className="text-xs">(sin límite configurado)</span>
        </div>
      )
    }

    return (
      <div className="flex flex-col gap-1">
        <span
          className={cn(
            "inline-flex items-center gap-1 text-sm tabular-nums",
            excedido
              ? "font-medium text-destructive"
              : cercaDelLimite
                ? "font-medium text-amber-700"
                : "text-foreground",
          )}
        >
          {(excedido || cercaDelLimite) && <AlertTriangle className="h-3.5 w-3.5 shrink-0" />}
          {formatGramos(consumido)} de {formatGramos(limite)}
        </span>
        <div className="h-1.5 w-full max-w-32 overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full",
              excedido ? "bg-destructive" : cercaDelLimite ? "bg-amber-500" : "bg-primary",
            )}
            style={{ width: `${porcentajeBarra}%` }}
          />
        </div>
        {excedido && (
          <span className="text-xs font-medium text-destructive">Excedido por {formatGramos(excedente)}</span>
        )}
      </div>
    )
  }

  const renderEstadoReprocan = (socio: Socio) =>
    socio.estado_reprocan ? (
      <Badge
        variant="outline"
        className={
          socio.estado_reprocan === "Activo"
            ? "border-primary/30 bg-primary/10 text-primary"
            : "border-amber-300 bg-amber-50 text-amber-700"
        }
      >
        {socio.estado_reprocan === "Activo" ? (
          <CheckCircle2 className="h-3 w-3 mr-1" />
        ) : (
          <Clock className="h-3 w-3 mr-1" />
        )}
        {socio.estado_reprocan}
      </Badge>
    ) : (
      <span className="text-muted-foreground">-</span>
    )

  const renderAccionesSocio = (socio: Socio) => (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => handleEdit(socio)}
        className="h-9 w-9 p-0 hover:bg-primary/10"
        title="Editar socio"
        aria-label={`Editar ${socio.nombre} ${socio.apellido}`}
      >
        <Pencil className="h-4 w-4 text-primary" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => openDeleteDialog(socio)}
        className="h-9 w-9 p-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
        title="Eliminar socio"
        aria-label={`Eliminar ${socio.nombre} ${socio.apellido}`}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </>
  )

  return (
    <div className="flex flex-col gap-6">
      <Dialog open={dniDuplicadoDialogOpen} onOpenChange={setDniDuplicadoDialogOpen}>
        <DialogContent className="monarca-theme bg-card border-border sm:max-w-md">
          <DialogHeader>
            <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-amber-100 flex items-center justify-center">
              <AlertTriangle className="h-6 w-6 text-amber-600" />
            </div>
            <DialogTitle className="text-center text-foreground">DNI ya registrado</DialogTitle>
            <DialogDescription className="text-center text-muted-foreground">
              Ya existe un socio con el DNI <span className="font-semibold text-foreground">{dniDuplicado}</span>.
              <br />
              Por favor, corregí el DNI e intentá nuevamente.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4">
            <Button className="w-full" onClick={() => setDniDuplicadoDialogOpen(false)}>
              Entendido
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="monarca-theme bg-card border-border sm:max-w-md">
          <DialogHeader>
            <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertTriangle className="h-6 w-6 text-destructive" />
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
              className="flex-1 bg-card"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={deleting}
            >
              Cancelar
            </Button>
            <Button variant="destructive" className="flex-1" onClick={handleConfirmDelete} disabled={deleting}>
              {deleting ? "Eliminando..." : "Sí, eliminar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Encabezado */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[26px] font-semibold leading-tight text-foreground">Socios</h1>
          <p className="text-sm text-muted-foreground">
            {filteredSocios.length} socio{filteredSocios.length === 1 ? "" : "s"} activo
            {filteredSocios.length === 1 ? "" : "s"}
          </p>
        </div>
        <Dialog
          open={isOpen}
          onOpenChange={(open) => {
            setIsOpen(open)
            if (!open) resetForm()
          }}
        >
          <DialogTrigger asChild>
            <Button className="shrink-0">
              <Plus className="h-4 w-4 mr-2" />
              Agregar socio
            </Button>
          </DialogTrigger>
          <DialogContent
            className="monarca-theme w-[calc(100%-2rem)] sm:max-w-[960px] max-h-[90dvh] grid-rows-[auto_1fr_auto] gap-0 overflow-hidden bg-background p-0"
          >
            <DialogHeader className="border-b border-border bg-card px-6 py-4 pr-12">
              <DialogTitle className="text-foreground">{editingSocio ? "Editar socio" : "Nuevo socio"}</DialogTitle>
            </DialogHeader>

            <form id="socio-form" onSubmit={handleSubmit} className="contents">
              <div className="min-h-0 overflow-y-auto bg-background px-6 py-5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  {/* Columna izquierda: información personal */}
                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-primary">Información personal</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="nombre">
                          Nombre <span className="text-destructive">*</span>
                        </Label>
                        <Input
                          id="nombre"
                          value={formData.nombre}
                          onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                          required
                          className="bg-card"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="apellido">
                          Apellido <span className="text-destructive">*</span>
                        </Label>
                        <Input
                          id="apellido"
                          value={formData.apellido}
                          onChange={(e) => setFormData({ ...formData, apellido: e.target.value })}
                          required
                          className="bg-card"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="dni">
                          DNI <span className="text-destructive">*</span>
                        </Label>
                        <Input
                          id="dni"
                          value={formData.dni}
                          onChange={handleDniChange}
                          placeholder="12.345.678"
                          required
                          className="bg-card"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="telefono">Teléfono (opcional)</Label>
                        <Input
                          id="telefono"
                          value={formData.telefono}
                          onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
                          className="bg-card"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">Email (opcional)</Label>
                      <Input
                        id="email"
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        className="bg-card"
                      />
                    </div>
                  </div>

                  {/* Columna derecha: membresía y consumo */}
                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-primary">Membresía</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="estado_reprocan">
                          Estado Reprocan <span className="text-destructive">*</span>
                        </Label>
                        <Select
                          value={formData.estado_reprocan}
                          onValueChange={(value: "Activo" | "Pendiente") =>
                            setFormData({ ...formData, estado_reprocan: value })
                          }
                          required
                        >
                          <SelectTrigger className="w-full bg-card">
                            <SelectValue placeholder="Seleccionar estado" />
                          </SelectTrigger>
                          <SelectContent className="monarca-theme">
                            <SelectItem value="Activo">Activo</SelectItem>
                            <SelectItem value="Pendiente">Pendiente</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="sucursal">
                          Sucursal <span className="text-destructive">*</span>
                        </Label>
                        <Select
                          value={formData.sucursal_id}
                          onValueChange={(value) => setFormData({ ...formData, sucursal_id: value })}
                          required
                        >
                          <SelectTrigger className="w-full bg-card">
                            <SelectValue placeholder="Seleccionar sucursal" />
                          </SelectTrigger>
                          <SelectContent className="monarca-theme">
                            {sucursales.map((s) => (
                              <SelectItem key={s.id} value={s.id}>
                                {s.nombre}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div
                      className={cn(
                        "flex items-center space-x-3 rounded-lg border p-3 transition-colors",
                        formData.es_miembro ? "border-accent/40 bg-accent/10" : "border-border bg-card",
                      )}
                    >
                      <Checkbox
                        id="es_miembro"
                        checked={formData.es_miembro}
                        onCheckedChange={(checked) =>
                          setFormData({
                            ...formData,
                            es_miembro: checked === true,
                            es_vip: checked === true ? false : formData.es_vip,
                          })
                        }
                        className="border-accent data-[state=checked]:bg-accent data-[state=checked]:border-accent"
                      />
                      <div className="flex-1">
                        <Label htmlFor="es_miembro" className="flex items-center gap-2 cursor-pointer">
                          <Crown className="h-4 w-4 text-accent" />
                          <span className="font-medium text-foreground">Es miembro del club</span>
                        </Label>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Los miembros trabajan en el club y tienen precio de miembro
                        </p>
                      </div>
                    </div>
                    <div
                      className={cn(
                        "flex items-center space-x-3 rounded-lg border p-3 transition-colors",
                        formData.es_vip ? "border-primary/40 bg-primary/10" : "border-border bg-card",
                      )}
                    >
                      <Checkbox
                        id="es_vip"
                        checked={formData.es_vip}
                        onCheckedChange={(checked) =>
                          setFormData({
                            ...formData,
                            es_vip: checked === true,
                            es_miembro: checked === true ? false : formData.es_miembro,
                          })
                        }
                        className="border-primary data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                      />
                      <div className="flex-1">
                        <Label htmlFor="es_vip" className="flex items-center gap-2 cursor-pointer">
                          <Star className="h-4 w-4 text-primary" />
                          <span className="font-medium text-foreground">Es socio VIP</span>
                        </Label>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Los socios VIP no trabajan pero tienen precio especial VIP
                        </p>
                      </div>
                    </div>

                    <div className="space-y-2 border-t border-border pt-4">
                      <h3 className="text-sm font-semibold text-primary">Consumo</h3>
                      <div className="space-y-2">
                        <Label htmlFor="gramos_mensuales">
                          Gramos por mes <span className="text-destructive">*</span>
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
                          className="bg-card"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <DialogFooter className="border-t border-border bg-card px-6 py-4">
                <Button
                  type="button"
                  variant="outline"
                  className="bg-card"
                  onClick={() => {
                    setIsOpen(false)
                    resetForm()
                  }}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
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
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Búsqueda */}
      <Card className="bg-card border-border py-4">
        <CardContent>
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre o DNI..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 bg-card"
            />
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card border-border gap-3">
        <CardHeader>
          <CardTitle className="text-foreground">Lista de socios ({filteredSocios.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {filteredSocios.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              {search ? "No se encontraron socios" : "No hay socios registrados"}
            </p>
          ) : (
            <>
              {/* Desktop/tablet: tabla completa (sin cambios de comportamiento). */}
              <div className="hidden sm:block rounded-md border border-border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-primary/10 hover:bg-primary/10">
                      <TableHead className="text-foreground">Socio</TableHead>
                      <TableHead className="text-foreground">Estado Reprocan</TableHead>
                      <TableHead className="text-foreground">Sucursal</TableHead>
                      <TableHead className="text-foreground">Consumo mensual</TableHead>
                      <TableHead className="text-center text-foreground w-24">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSocios.map((socio) => (
                      <TableRow key={socio.id} className="hover:bg-muted/40">
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-foreground">
                                {socio.apellido}, {socio.nombre}
                              </span>
                              {socio.es_miembro && (
                                <Badge variant="outline" className="border-accent/50 bg-accent/10 text-accent-foreground">
                                  <Crown className="h-3 w-3 mr-1" />
                                  Miembro
                                </Badge>
                              )}
                              {socio.es_vip && (
                                <Badge variant="outline" className="border-primary/40 bg-primary/10 text-primary">
                                  <Star className="h-3 w-3 mr-1" />
                                  VIP
                                </Badge>
                              )}
                            </div>
                            <span className="text-xs text-muted-foreground select-text">{formatDni(socio.dni)}</span>
                          </div>
                        </TableCell>
                        <TableCell>{renderEstadoReprocan(socio)}</TableCell>
                        <TableCell>
                          {socio.sucursal ? (
                            <span className="text-sm text-foreground">{socio.sucursal.nombre}</span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="min-w-[11rem]">{renderConsumo(socio)}</TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">{renderAccionesSocio(socio)}</div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile (<sm): tarjetas apiladas en vez de la tabla, que en pantallas
                  angostas quedaba más ancha que el viewport y escondía columnas
                  (Acciones) fuera de vista sin ninguna señal de que había más contenido. */}
              <div className="sm:hidden space-y-3">
                {filteredSocios.map((socio) => (
                  <div key={socio.id} className="rounded-lg border border-border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="truncate font-medium text-foreground">
                            {socio.apellido}, {socio.nombre}
                          </span>
                          {socio.es_miembro && (
                            <Badge variant="outline" className="border-accent/50 bg-accent/10 text-accent-foreground">
                              <Crown className="h-3 w-3 mr-1" />
                              Miembro
                            </Badge>
                          )}
                          {socio.es_vip && (
                            <Badge variant="outline" className="border-primary/40 bg-primary/10 text-primary">
                              <Star className="h-3 w-3 mr-1" />
                              VIP
                            </Badge>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground select-text">{formatDni(socio.dni)}</span>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">{renderAccionesSocio(socio)}</div>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {renderEstadoReprocan(socio)}
                      {socio.sucursal && (
                        <span className="text-sm text-muted-foreground">{socio.sucursal.nombre}</span>
                      )}
                    </div>

                    <div className="mt-2">{renderConsumo(socio)}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
