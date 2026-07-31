"use client"

import type React from "react"

import { useState, useEffect, useMemo } from "react"
import { createClient } from "@/lib/supabase/client"
import type { Gasto, CategoriaGasto } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { CalendarIcon, Plus, DollarSign, Pencil, Trash2, Tag, Check } from "lucide-react"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { useToast } from "@/hooks/use-toast"

export function GastosManager() {
  const [gastos, setGastos] = useState<Gasto[]>([])
  const [categorias, setCategorias] = useState<CategoriaGasto[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [showCategoriasDialog, setShowCategoriasDialog] = useState(false)
  const [nuevaCategoria, setNuevaCategoria] = useState("")
  const [editingGasto, setEditingGasto] = useState<Gasto | null>(null)
  const [mesSeleccionado, setMesSeleccionado] = useState<string>("todos")
  const [formData, setFormData] = useState({
    descripcion: "",
    monto: "",
    categoria: "Varios",
    metodo_pago: "efectivo" as "efectivo" | "transferencia",
    fecha: new Date(),
  })
  const { toast } = useToast()
  const supabase = createClient()

  useEffect(() => {
    fetchGastos()
    fetchCategorias()
  }, [])

  async function fetchGastos() {
    setLoading(true)
    const { data, error } = await supabase
      .from("gastos")
      .select("*")
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false })

    if (error) {
      toast({
        title: "Error",
        description: "No se pudieron cargar los gastos",
        variant: "destructive",
      })
    } else {
      setGastos(data || [])
    }
    setLoading(false)
  }

  async function fetchCategorias() {
    const { data } = await supabase.from("categorias_gasto").select("*").order("nombre")
    if (data) setCategorias(data)
  }

  async function agregarCategoria() {
    const nombre = nuevaCategoria.trim()
    if (!nombre) return

    const { error } = await supabase.from("categorias_gasto").insert([{ nombre }])
    if (error) {
      toast({
        title: "Error",
        description: "No se pudo agregar la categoría (¿ya existe?)",
        variant: "destructive",
      })
    } else {
      setNuevaCategoria("")
      fetchCategorias()
      toast({ title: "Categoría agregada", description: `Se agregó "${nombre}"` })
    }
  }

  async function eliminarCategoria(id: string) {
    const { error } = await supabase.from("categorias_gasto").delete().eq("id", id)
    if (error) {
      toast({ title: "Error", description: "No se pudo eliminar la categoría", variant: "destructive" })
    } else {
      fetchCategorias()
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!formData.descripcion.trim() || !formData.monto) {
      toast({
        title: "Error",
        description: "Completá todos los campos requeridos",
        variant: "destructive",
      })
      return
    }

    const gastoData = {
      descripcion: formData.descripcion.trim(),
      monto: Number.parseFloat(formData.monto),
      categoria: formData.categoria,
      metodo_pago: formData.metodo_pago,
      fecha: format(formData.fecha, "yyyy-MM-dd"),
    }

    if (editingGasto) {
      const { error } = await supabase.from("gastos").update(gastoData).eq("id", editingGasto.id)

      if (error) {
        toast({
          title: "Error",
          description: "No se pudo actualizar el gasto",
          variant: "destructive",
        })
      } else {
        toast({
          title: "Gasto actualizado",
          description: "El gasto se actualizó correctamente",
        })
        resetForm()
        fetchGastos()
      }
    } else {
      const { error } = await supabase.from("gastos").insert([gastoData])

      if (error) {
        toast({
          title: "Error",
          description: "No se pudo registrar el gasto",
          variant: "destructive",
        })
      } else {
        toast({
          title: "Gasto registrado",
          description: "El gasto se registró correctamente",
        })
        resetForm()
        fetchGastos()
      }
    }
  }

  function resetForm() {
    setFormData({
      descripcion: "",
      monto: "",
      categoria: "Varios",
      metodo_pago: "efectivo",
      fecha: new Date(),
    })
    setShowForm(false)
    setEditingGasto(null)
  }

  function handleEdit(gasto: Gasto) {
    setEditingGasto(gasto)
    setFormData({
      descripcion: gasto.descripcion,
      monto: gasto.monto.toString(),
      categoria: gasto.categoria || "Varios",
      metodo_pago: gasto.metodo_pago,
      fecha: new Date(gasto.fecha + "T00:00:00"),
    })
    setShowForm(true)
  }

  async function handleDelete(id: string) {
    if (!confirm("¿Estás seguro de eliminar este gasto?")) return

    const { error } = await supabase.from("gastos").delete().eq("id", id)

    if (error) {
      toast({
        title: "Error",
        description: "No se pudo eliminar el gasto",
        variant: "destructive",
      })
    } else {
      toast({
        title: "Gasto eliminado",
        description: "El gasto se eliminó correctamente",
      })
      fetchGastos()
    }
  }

  // Lista de meses disponibles (a partir de los gastos existentes)
  const mesesDisponibles = useMemo(() => {
    const set = new Set<string>()
    for (const g of gastos) {
      set.add(g.fecha.substring(0, 7)) // yyyy-MM
    }
    return Array.from(set).sort((a, b) => b.localeCompare(a))
  }, [gastos])

  // Gastos filtrados por el mes seleccionado
  const gastosFiltrados = useMemo(() => {
    if (mesSeleccionado === "todos") return gastos
    return gastos.filter((g) => g.fecha.substring(0, 7) === mesSeleccionado)
  }, [gastos, mesSeleccionado])

  const totalFiltrado = gastosFiltrados.reduce((sum, g) => sum + Number(g.monto), 0)

  // Totales por categoría dentro del filtro
  const totalesPorCategoria = useMemo(() => {
    const map = new Map<string, number>()
    for (const g of gastosFiltrados) {
      const cat = g.categoria || "Varios"
      map.set(cat, (map.get(cat) || 0) + Number(g.monto))
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1])
  }, [gastosFiltrados])

  function nombreMes(ym: string) {
    const [y, m] = ym.split("-")
    return format(new Date(Number(y), Number(m) - 1, 1), "MMMM yyyy", { locale: es })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Gestión de Gastos</h2>
          <p className="text-muted-foreground">Registrá y administrá los gastos del club</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowCategoriasDialog(true)}>
            <Tag className="h-4 w-4 mr-2" />
            Categorías
          </Button>
          <Button onClick={() => setShowForm(true)} className="bg-emerald-700 hover:bg-emerald-800">
            <Plus className="h-4 w-4 mr-2" />
            Nuevo Gasto
          </Button>
        </div>
      </div>

      {/* Filtro por mes */}
      <div className="flex items-center gap-3">
        <Label htmlFor="filtro-mes" className="whitespace-nowrap">
          Ver período:
        </Label>
        <Select value={mesSeleccionado} onValueChange={setMesSeleccionado}>
          <SelectTrigger id="filtro-mes" className="w-56 capitalize">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los meses</SelectItem>
            {mesesDisponibles.map((ym) => (
              <SelectItem key={ym} value={ym} className="capitalize">
                {nombreMes(ym)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Total + desglose por categoría */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-gradient-to-br from-red-50 to-white border-red-200">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-red-800 text-base">
              <DollarSign className="h-5 w-5" />
              {mesSeleccionado === "todos" ? "Total General" : "Total del Mes"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-700">${totalFiltrado.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {gastosFiltrados.length} {gastosFiltrados.length === 1 ? "gasto" : "gastos"}
            </p>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Gastos por categoría</CardTitle>
          </CardHeader>
          <CardContent>
            {totalesPorCategoria.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin gastos en este período</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {totalesPorCategoria.map(([cat, monto]) => (
                  <div
                    key={cat}
                    className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2"
                  >
                    <span className="text-sm font-medium text-foreground">{cat}</span>
                    <span className="text-sm font-bold text-red-700">${monto.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Dialog gestión de categorías */}
      <Dialog open={showCategoriasDialog} onOpenChange={setShowCategoriasDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Categorías de gastos</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="Nueva categoría..."
                value={nuevaCategoria}
                onChange={(e) => setNuevaCategoria(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                    e.preventDefault()
                    agregarCategoria()
                  }
                }}
              />
              <Button onClick={agregarCategoria} className="bg-emerald-700 hover:bg-emerald-800">
                <Check className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-2">
              {categorias.map((cat) => (
                <div
                  key={cat.id}
                  className="flex items-center justify-between rounded-lg border px-3 py-2"
                >
                  <span className="text-sm">{cat.nombre}</span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-red-600 hover:text-red-700 h-8 w-8"
                    onClick={() => eliminarCategoria(cat.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              {categorias.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-2">No hay categorías</p>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog nuevo/editar gasto */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingGasto ? "Editar Gasto" : "Nuevo Gasto"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fecha">Fecha del Gasto</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left font-normal bg-transparent">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(formData.fecha, "PPP", { locale: es })}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={formData.fecha}
                    onSelect={(date) => date && setFormData({ ...formData, fecha: date })}
                    locale={es}
                    disabled={(date) => date > new Date()}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label htmlFor="categoria">Categoría</Label>
              <Select
                value={formData.categoria}
                onValueChange={(value) => setFormData({ ...formData, categoria: value })}
              >
                <SelectTrigger id="categoria">
                  <SelectValue placeholder="Seleccionar categoría" />
                </SelectTrigger>
                <SelectContent>
                  {categorias.map((cat) => (
                    <SelectItem key={cat.id} value={cat.nombre}>
                      {cat.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="descripcion">Descripción</Label>
              <Textarea
                id="descripcion"
                placeholder="Ej: Compra de luces LED, Pago de alquiler..."
                value={formData.descripcion}
                onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="monto">Monto</Label>
              <Input
                id="monto"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={formData.monto}
                onChange={(e) => setFormData({ ...formData, monto: e.target.value })}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="metodo_pago">Método de Pago</Label>
              <Select
                value={formData.metodo_pago}
                onValueChange={(value: "efectivo" | "transferencia") =>
                  setFormData({ ...formData, metodo_pago: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="efectivo">Efectivo</SelectItem>
                  <SelectItem value="transferencia">Transferencia</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={resetForm} className="flex-1 bg-transparent">
                Cancelar
              </Button>
              <Button type="submit" className="flex-1 bg-emerald-700 hover:bg-emerald-800">
                {editingGasto ? "Actualizar" : "Registrar"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <CardTitle>Historial de Gastos</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Cargando gastos...</div>
          ) : gastosFiltrados.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No hay gastos en este período</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead>Monto</TableHead>
                  <TableHead>Método de Pago</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {gastosFiltrados.map((gasto) => (
                  <TableRow key={gasto.id}>
                    <TableCell>{format(new Date(gasto.fecha + "T00:00:00"), "dd/MM/yyyy", { locale: es })}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{gasto.categoria || "Varios"}</Badge>
                    </TableCell>
                    <TableCell className="max-w-xs">{gasto.descripcion}</TableCell>
                    <TableCell className="font-medium text-red-700">${Number(gasto.monto).toFixed(2)}</TableCell>
                    <TableCell>
                      <Badge variant={gasto.metodo_pago === "efectivo" ? "default" : "secondary"}>
                        {gasto.metodo_pago === "efectivo" ? "Efectivo" : "Transferencia"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button size="icon" variant="ghost" onClick={() => handleEdit(gasto)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-red-600 hover:text-red-700"
                          onClick={() => handleDelete(gasto.id)}
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
