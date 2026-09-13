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
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Pencil, Trash2, Crown, Star, PackageX, PackageSearch, PackageCheck } from "lucide-react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { formatCurrency, formatGramos } from "@/lib/format"

interface StockManagerProps {
  initialGeneticas: Genetica[]
  // El diálogo de alta/edición se abre desde el botón "Agregar genética",
  // que ahora vive junto a las pestañas (ver components/stock-tabs.tsx) para
  // compartir la misma fila. El estado de apertura lo controla ese padre;
  // acá sólo vive el formulario y su lógica de guardado, sin cambios.
  dialogOpen: boolean
  onDialogOpenChange: (open: boolean) => void
}

// Campo de precio reutilizado en las 6 celdas de la matriz General/Miembro/VIP
// × Por gramo/Por enrolado. El label lleva siempre el nombre accesible
// completo (p. ej. "Precio VIP por enrolado"); en escritorio queda oculto
// visualmente porque la fila y la columna ya lo dejan claro, en móvil se ve.
function PriceField({
  id,
  label,
  value,
  onChange,
  required,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  required?: boolean
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs sm:sr-only">
        {label}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
          $
        </span>
        <Input
          id={id}
          type="number"
          step="0.01"
          min="0"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="0"
          required={required}
          className="bg-card pl-7"
        />
      </div>
    </div>
  )
}

// Mismo umbral de "stock bajo" que ya usaba la tabla original
// (gramos_disponibles < 100), sólo se subdivide en 0 para distinguir "sin
// stock" de "stock bajo" — no es un umbral nuevo.
function getDisponibilidad(gramos: number) {
  if (gramos <= 0) {
    return {
      label: "Sin stock",
      Icon: PackageX,
      textClass: "text-muted-foreground",
      bgClass: "bg-muted text-muted-foreground",
    }
  }
  if (gramos < 100) {
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

// Dos líneas por celda de precio (/g y /enrolado), importe primero y unidad
// como texto secundario. `siempreGramo` preserva la semántica original:
// precio_por_gramo general siempre se muestra tal cual (es un campo
// requerido); el resto conserva el criterio existente de tratar 0 como "no
// configurado" — ahora se lee "Sin configurar" en vez de "—", mismo dato.
function PriceCellLines({
  gramo,
  enrolado,
  siempreGramo,
}: {
  gramo: number
  enrolado: number
  siempreGramo?: boolean
}) {
  const gramoConfigurado = siempreGramo || gramo > 0
  const enroladoConfigurado = enrolado > 0
  return (
    <div className="flex flex-col items-end gap-0.5 text-right text-sm">
      <span className="tabular-nums text-foreground">
        {gramoConfigurado ? (
          <>
            {formatCurrency(gramo)} <span className="text-xs text-muted-foreground">/g</span>
          </>
        ) : (
          <span className="text-xs text-muted-foreground">Sin configurar /g</span>
        )}
      </span>
      <span className="tabular-nums text-foreground">
        {enroladoConfigurado ? (
          <>
            {formatCurrency(enrolado)} <span className="text-xs text-muted-foreground">/enrolado</span>
          </>
        ) : (
          <span className="text-xs text-muted-foreground">Sin configurar /enrolado</span>
        )}
      </span>
    </div>
  )
}

export function StockManager({ initialGeneticas, dialogOpen, onDialogOpenChange }: StockManagerProps) {
  const [geneticas, setGeneticas] = useState(initialGeneticas)
  const [editingGenetica, setEditingGenetica] = useState<Genetica | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const [formData, setFormData] = useState({
    nombre: "",
    descripcion: "",
    gramos_disponibles: "",
    precio_por_gramo: "",
    precio_por_enrolado: "",
    precio_gramo_miembro: "",
    precio_enrolado_miembro: "",
    precio_gramo_vip: "",
    precio_enrolado_vip: "",
  })

  const resetForm = () => {
    setFormData({
      nombre: "",
      descripcion: "",
      gramos_disponibles: "",
      precio_por_gramo: "",
      precio_por_enrolado: "",
      precio_gramo_miembro: "",
      precio_enrolado_miembro: "",
      precio_gramo_vip: "",
      precio_enrolado_vip: "",
    })
    setEditingGenetica(null)
  }

  const closeAndReset = () => {
    onDialogOpenChange(false)
    resetForm()
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
      precio_por_enrolado: Number.parseFloat(formData.precio_por_enrolado) || 0,
      precio_gramo_miembro: Number.parseFloat(formData.precio_gramo_miembro) || 0,
      precio_enrolado_miembro: Number.parseFloat(formData.precio_enrolado_miembro) || 0,
      precio_gramo_vip: Number.parseFloat(formData.precio_gramo_vip) || 0,
      precio_enrolado_vip: Number.parseFloat(formData.precio_enrolado_vip) || 0,
    }

    if (editingGenetica) {
      console.log("[v0] Updating genetica:", editingGenetica.id, data)
      const { error } = await supabase
        .from("geneticas")
        .update({ ...data, updated_at: new Date().toISOString() })
        .eq("id", editingGenetica.id)

      console.log("[v0] Update result - error:", error)
      if (!error) {
        setGeneticas(geneticas.map((g) => (g.id === editingGenetica.id ? { ...g, ...data } : g)))
      }
    } else {
      console.log("[v0] Inserting new genetica:", data)
      const { data: newGenetica, error } = await supabase.from("geneticas").insert(data).select().single()

      console.log("[v0] Insert result - newGenetica:", newGenetica, "error:", error)
      if (!error && newGenetica) {
        setGeneticas([...geneticas, newGenetica])
      } else if (error) {
        console.log("[v0] Error inserting genetica:", error.message, error.details, error.hint)
      }
    }

    setLoading(false)
    closeAndReset()
    router.refresh()
  }

  const handleEdit = (genetica: Genetica) => {
    setEditingGenetica(genetica)
    setFormData({
      nombre: genetica.nombre,
      descripcion: genetica.descripcion || "",
      gramos_disponibles: genetica.gramos_disponibles.toString(),
      precio_por_gramo: genetica.precio_por_gramo.toString(),
      precio_por_enrolado: (genetica.precio_por_enrolado || 0).toString(),
      precio_gramo_miembro: (genetica.precio_gramo_miembro || 0).toString(),
      precio_enrolado_miembro: (genetica.precio_enrolado_miembro || 0).toString(),
      precio_gramo_vip: (genetica.precio_gramo_vip || 0).toString(),
      precio_enrolado_vip: (genetica.precio_enrolado_vip || 0).toString(),
    })
    onDialogOpenChange(true)
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

  const activas = geneticas.filter((g) => g.activo)

  return (
    <div className="flex flex-col gap-6">
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          onDialogOpenChange(open)
          if (!open) resetForm()
        }}
      >
        <DialogContent className="w-[calc(100%-2rem)] sm:max-w-[960px] max-h-[90dvh] grid-rows-[auto_1fr_auto] gap-0 overflow-hidden bg-background p-0">
            <DialogHeader className="border-b border-border bg-card px-6 py-4 pr-12">
              <DialogTitle className="text-foreground">
                {editingGenetica ? "Editar genética" : "Nueva genética"}
              </DialogTitle>
            </DialogHeader>

            <form id="genetica-form" onSubmit={handleSubmit} className="contents">
              <div className="min-h-0 overflow-y-auto bg-background px-6 py-5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  {/* Columna izquierda: información y existencias */}
                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-primary">Información y existencias</h3>
                    <div className="space-y-2">
                      <Label htmlFor="nombre">
                        Nombre <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="nombre"
                        value={formData.nombre}
                        onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                        placeholder="Ej: OG Kush"
                        required
                        className="bg-card"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="descripcion">Descripción (opcional)</Label>
                      <Textarea
                        id="descripcion"
                        value={formData.descripcion}
                        onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                        placeholder="Descripción de la genética..."
                        className="bg-card"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="gramos">
                        Gramos disponibles <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="gramos"
                        type="number"
                        step="0.01"
                        min="0"
                        value={formData.gramos_disponibles}
                        onChange={(e) => setFormData({ ...formData, gramos_disponibles: e.target.value })}
                        placeholder="0"
                        required
                        className="bg-card"
                      />
                    </div>
                  </div>

                  {/* Columna derecha: precios */}
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-primary">Precios</h3>
                    <div className="overflow-hidden rounded-lg border border-border">
                      <div className="hidden grid-cols-[110px_1fr_1fr] gap-3 bg-primary/10 px-3 py-2 text-xs font-medium text-primary sm:grid">
                        <span>Categoría</span>
                        <span>Por gramo</span>
                        <span>Por enrolado</span>
                      </div>

                      <div className="grid grid-cols-1 gap-3 bg-card px-3 py-3 sm:grid-cols-[110px_1fr_1fr] sm:items-center">
                        <span className="text-sm font-medium text-foreground">General</span>
                        <PriceField
                          id="precio"
                          label="Precio general por gramo"
                          value={formData.precio_por_gramo}
                          onChange={(v) => setFormData({ ...formData, precio_por_gramo: v })}
                          required
                        />
                        <PriceField
                          id="precio_enrolado"
                          label="Precio general por enrolado"
                          value={formData.precio_por_enrolado}
                          onChange={(v) => setFormData({ ...formData, precio_por_enrolado: v })}
                        />
                      </div>

                      <div className="grid grid-cols-1 gap-3 border-t border-border bg-accent/5 px-3 py-3 sm:grid-cols-[110px_1fr_1fr] sm:items-center">
                        <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                          <Crown className="h-3.5 w-3.5 text-accent" />
                          Miembro
                        </span>
                        <PriceField
                          id="precio_gramo_miembro"
                          label="Precio miembro por gramo"
                          value={formData.precio_gramo_miembro}
                          onChange={(v) => setFormData({ ...formData, precio_gramo_miembro: v })}
                        />
                        <PriceField
                          id="precio_enrolado_miembro"
                          label="Precio miembro por enrolado"
                          value={formData.precio_enrolado_miembro}
                          onChange={(v) => setFormData({ ...formData, precio_enrolado_miembro: v })}
                        />
                      </div>

                      <div className="grid grid-cols-1 gap-3 border-t border-border bg-primary/5 px-3 py-3 sm:grid-cols-[110px_1fr_1fr] sm:items-center">
                        <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                          <Star className="h-3.5 w-3.5 text-primary" />
                          VIP
                        </span>
                        <PriceField
                          id="precio_gramo_vip"
                          label="Precio VIP por gramo"
                          value={formData.precio_gramo_vip}
                          onChange={(v) => setFormData({ ...formData, precio_gramo_vip: v })}
                        />
                        <PriceField
                          id="precio_enrolado_vip"
                          label="Precio VIP por enrolado"
                          value={formData.precio_enrolado_vip}
                          onChange={(v) => setFormData({ ...formData, precio_enrolado_vip: v })}
                        />
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      El precio por enrolado es el valor de cada enrolado armado. Un precio en blanco o en 0 en
                      Miembro/VIP se toma como no configurado para esa categoría.
                    </p>
                  </div>
                </div>
              </div>

              <DialogFooter className="border-t border-border bg-card px-6 py-4">
                <Button type="button" variant="outline" className="bg-card" onClick={closeAndReset}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={loading}>
                  {loading ? "Guardando..." : editingGenetica ? "Guardar cambios" : "Agregar"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
      </Dialog>

      <Card className="bg-card border-border gap-3">
        <CardHeader>
          <CardTitle className="text-foreground">Inventario de genéticas</CardTitle>
        </CardHeader>
        <CardContent>
          {activas.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No hay genéticas registradas. Agregá una para comenzar.
            </p>
          ) : (
            <>
              {/* Escritorio/tablet: tabla */}
              <div className="hidden rounded-md border border-border overflow-x-auto md:block">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-primary/10 hover:bg-primary/10">
                      <TableHead className="text-foreground">Genética</TableHead>
                      <TableHead className="text-foreground">Disponible</TableHead>
                      <TableHead className="text-right text-foreground">General</TableHead>
                      <TableHead className="text-right text-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Crown className="h-3.5 w-3.5 text-accent" />
                          Miembro
                        </span>
                      </TableHead>
                      <TableHead className="text-right text-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Star className="h-3.5 w-3.5 text-primary" />
                          VIP
                        </span>
                      </TableHead>
                      <TableHead className="text-center text-foreground w-24">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activas.map((genetica) => {
                      const disponibilidad = getDisponibilidad(genetica.gramos_disponibles)
                      return (
                        <TableRow key={genetica.id} className="hover:bg-muted/40">
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="font-medium text-foreground">{genetica.nombre}</span>
                              {genetica.descripcion && (
                                <span className="text-xs text-muted-foreground line-clamp-1 max-w-xs">
                                  {genetica.descripcion}
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-0.5">
                              <span className="font-medium text-foreground tabular-nums">
                                {formatGramos(genetica.gramos_disponibles)}
                              </span>
                              <span
                                className={cn(
                                  "inline-flex items-center gap-1 text-xs",
                                  disponibilidad.textClass,
                                )}
                              >
                                <disponibilidad.Icon className="h-3 w-3 shrink-0" />
                                {disponibilidad.label}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <PriceCellLines
                              gramo={genetica.precio_por_gramo}
                              enrolado={genetica.precio_por_enrolado}
                              siempreGramo
                            />
                          </TableCell>
                          <TableCell>
                            <PriceCellLines
                              gramo={genetica.precio_gramo_miembro}
                              enrolado={genetica.precio_enrolado_miembro}
                            />
                          </TableCell>
                          <TableCell>
                            <PriceCellLines gramo={genetica.precio_gramo_vip} enrolado={genetica.precio_enrolado_vip} />
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEdit(genetica)}
                                className="h-9 w-9 p-0 hover:bg-primary/10"
                                title="Editar genética"
                                aria-label={`Editar ${genetica.nombre}`}
                              >
                                <Pencil className="h-4 w-4 text-primary" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDelete(genetica.id)}
                                className="h-9 w-9 p-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                title="Eliminar genética"
                                aria-label={`Eliminar ${genetica.nombre}`}
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
                {activas.map((genetica) => {
                  const disponibilidad = getDisponibilidad(genetica.gramos_disponibles)
                  const filas = [
                    {
                      label: "General",
                      icon: null as typeof Crown | null,
                      iconClass: "",
                      gramo: genetica.precio_por_gramo,
                      enrolado: genetica.precio_por_enrolado,
                      siempreGramo: true,
                    },
                    {
                      label: "Miembro",
                      icon: Crown,
                      iconClass: "text-accent",
                      gramo: genetica.precio_gramo_miembro,
                      enrolado: genetica.precio_enrolado_miembro,
                      siempreGramo: false,
                    },
                    {
                      label: "VIP",
                      icon: Star,
                      iconClass: "text-primary",
                      gramo: genetica.precio_gramo_vip,
                      enrolado: genetica.precio_enrolado_vip,
                      siempreGramo: false,
                    },
                  ]

                  return (
                    <div key={genetica.id} className="rounded-lg border border-border bg-card p-4 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium text-foreground">{genetica.nombre}</p>
                          {genetica.descripcion && (
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{genetica.descripcion}</p>
                          )}
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(genetica)}
                            className="h-9 w-9 p-0 hover:bg-primary/10"
                            title="Editar genética"
                            aria-label={`Editar ${genetica.nombre}`}
                          >
                            <Pencil className="h-4 w-4 text-primary" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(genetica.id)}
                            className="h-9 w-9 p-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                            title="Eliminar genética"
                            aria-label={`Eliminar ${genetica.nombre}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      <div
                        className={cn(
                          "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm",
                          disponibilidad.bgClass,
                        )}
                      >
                        <disponibilidad.Icon className="h-4 w-4 shrink-0" />
                        <span className="font-medium tabular-nums">{formatGramos(genetica.gramos_disponibles)}</span>
                        <span className="text-xs">{disponibilidad.label}</span>
                      </div>

                      <div className="space-y-2 text-sm">
                        {filas.map((fila, i) => (
                          <div
                            key={fila.label}
                            className={cn(
                              "flex items-center justify-between gap-3 pt-2",
                              i > 0 && "border-t border-border",
                            )}
                          >
                            <span className="flex items-center gap-1.5 font-medium text-foreground">
                              {fila.icon && <fila.icon className={cn("h-3.5 w-3.5", fila.iconClass)} />}
                              {fila.label}
                            </span>
                            <div className="text-right text-xs">
                              <div className="tabular-nums text-foreground">
                                {fila.siempreGramo || fila.gramo ? (
                                  <>
                                    {formatCurrency(fila.gramo)} <span className="text-muted-foreground">/g</span>
                                  </>
                                ) : (
                                  <span className="text-muted-foreground">Sin configurar /g</span>
                                )}
                              </div>
                              <div className="tabular-nums text-foreground">
                                {fila.enrolado ? (
                                  <>
                                    {formatCurrency(fila.enrolado)}{" "}
                                    <span className="text-muted-foreground">/enrolado</span>
                                  </>
                                ) : (
                                  <span className="text-muted-foreground">Sin configurar /enrolado</span>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
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
