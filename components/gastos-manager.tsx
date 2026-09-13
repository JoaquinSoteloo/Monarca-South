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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { CalendarIcon, Plus, DollarSign, Pencil, Trash2, Tag, Banknote, CreditCard } from "lucide-react"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { formatCurrency } from "@/lib/format"
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
    <div className="min-w-0 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Gastos</h2>
          <p className="text-muted-foreground">Registrá y administrá los gastos del club</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button className="bg-card" variant="outline" onClick={() => setShowCategoriasDialog(true)}>
            <Tag className="h-4 w-4 mr-2" />
            Categorías
          </Button>
          <Button onClick={() => setShowForm(true)} className="bg-primary text-primary-foreground hover:bg-primary/90">
            <Plus className="h-4 w-4 mr-2" />
            Nuevo gasto
          </Button>
        </div>
      </div>

      {/* Filtro por mes */}
      <div className="flex flex-col items-start gap-2 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:gap-4">
        <Label htmlFor="filtro-mes" className="whitespace-nowrap">
          Ver período:
        </Label>
        <Select value={mesSeleccionado} onValueChange={setMesSeleccionado}>
          <SelectTrigger id="filtro-mes" className="w-full bg-white capitalize sm:w-60">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="monarca-theme">
            <SelectItem value="todos">Todos los meses</SelectItem>
            {mesesDisponibles.map((ym) => (
              <SelectItem key={ym} value={ym} className="capitalize">
                {nombreMes(ym)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Resumen y distribución del período seleccionado */}
      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <Card className="min-w-0 justify-center gap-3 border-primary bg-primary text-primary-foreground">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-primary-foreground/80">
              <DollarSign className="h-4 w-4" />Total de gastos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="break-words text-3xl font-semibold tabular-nums">{loading ? "—" : formatCurrency(totalFiltrado)}</div>
            <p className="mt-2 text-sm text-primary-foreground/80">
              {loading ? "Cargando gastos…" : `${gastosFiltrados.length} ${gastosFiltrados.length === 1 ? "gasto registrado" : "gastos registrados"}`}
            </p>
            <p className="mt-1 text-xs capitalize text-primary-foreground/80">
              {mesSeleccionado === "todos" ? "Todos los meses" : nombreMes(mesSeleccionado)}
            </p>
          </CardContent>
        </Card>
        <Card className="min-w-0 gap-4 bg-card">
          <CardHeader><CardTitle className="text-base">Distribución por categoría</CardTitle></CardHeader>
          <CardContent className="max-h-64 space-y-4 overflow-y-auto">
            {loading ? <p className="text-sm text-muted-foreground">Cargando categorías…</p> : totalesPorCategoria.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin gastos en este período</p>
            ) : totalesPorCategoria.map(([cat, monto]) => (
              <div key={cat} className="space-y-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  <span className="font-medium">{cat}</span>
                  <span className="font-semibold tabular-nums">{formatCurrency(monto)}</span>
                </div>
                <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-primary/10">
                  <div className="h-full rounded-full bg-primary/65" style={{ width: `${totalFiltrado > 0 ? Math.max(0, Math.min(100, monto / totalFiltrado * 100)) : 0}%` }} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Dialog gestión de categorías */}
      <Dialog open={showCategoriasDialog} onOpenChange={setShowCategoriasDialog}>
        <DialogContent className="monarca-theme max-h-[90dvh] overflow-y-auto bg-white sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>Categorías de gastos</DialogTitle>
            <DialogDescription>Organizá las categorías disponibles al registrar un gasto.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Label htmlFor="nueva-categoria">Nueva categoría</Label>
            <div className="flex gap-2">
              <Input
                id="nueva-categoria"
                className="min-w-0 bg-white"
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
              <Button onClick={agregarCategoria} className="bg-primary text-primary-foreground hover:bg-primary/90">
                <Plus className="h-4 w-4" /> Agregar
              </Button>
            </div>
            <div className="space-y-2">
              {categorias.map((cat) => (
                <div
                  key={cat.id}
                  className="flex items-center justify-between gap-3 rounded-lg border bg-primary/5 px-3 py-2"
                >
                  <span className="text-sm">{cat.nombre}</span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-red-600 hover:text-red-700 h-8 w-8"
                    aria-label={`Eliminar categoría ${cat.nombre}`}
                    title={`Eliminar categoría ${cat.nombre}`}
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
        <DialogContent className="monarca-theme flex w-[calc(100%-2rem)] max-h-[90dvh] flex-col gap-0 overflow-hidden bg-white p-0 sm:max-w-[800px]">
          <DialogHeader className="shrink-0 border-b bg-white p-5 pr-12 text-left">
            <DialogTitle>{editingGasto ? "Editar gasto" : "Nuevo gasto"}</DialogTitle>
            <DialogDescription>Completá el detalle, el importe y cómo se pagó.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="flex min-h-0 flex-col overflow-hidden">
            <div className="grid min-h-0 gap-6 overflow-y-auto bg-background/50 p-5 sm:p-6 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div className="min-w-0 space-y-4">
                <h3 className="text-sm font-semibold text-primary">Detalle del gasto</h3>
            <div className="space-y-2">
              <Label htmlFor="fecha">Fecha del Gasto</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" id="fecha" className="w-full justify-start bg-white text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(formData.fecha, "PPP", { locale: es })}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="monarca-theme w-auto p-0" align="start">
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
                <SelectTrigger id="categoria" className="w-full bg-white">
                  <SelectValue placeholder="Seleccionar categoría" />
                </SelectTrigger>
                <SelectContent className="monarca-theme">
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
                className="min-h-24 bg-white"
                placeholder="Ej: Compra de luces LED, Pago de alquiler..."
                value={formData.descripcion}
                onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                required
              />
            </div>
              </div>
              <div className="min-w-0 space-y-4 self-start rounded-xl border border-primary/15 bg-primary/5 p-4">
                <h3 className="text-sm font-semibold text-primary">Importe y pago</h3>
            <div className="space-y-2">
              <Label htmlFor="monto">Monto ($)</Label>
              <Input
                id="monto"
                className="h-12 bg-white text-xl font-semibold tabular-nums"
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
                <SelectTrigger id="metodo_pago" className="w-full bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="monarca-theme">
                  <SelectItem value="efectivo">Efectivo</SelectItem>
                  <SelectItem value="transferencia">Transferencia</SelectItem>
                </SelectContent>
              </Select>
            </div>
              </div>
            </div>
            <div className="flex shrink-0 justify-end gap-2 border-t bg-white p-4">
              <Button type="button" variant="outline" onClick={resetForm}>Cancelar</Button>
              <Button type="submit">{editingGasto ? "Guardar cambios" : "Registrar gasto"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Card className="min-w-0 gap-4 bg-card">
        <CardHeader>
          <CardTitle className="text-base">Historial de gastos</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Cargando gastos...</div>
          ) : gastosFiltrados.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No hay gastos en este período</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-primary/10 hover:bg-primary/10">
                  <TableHead>Fecha</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead>Método de Pago</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {gastosFiltrados.map((gasto) => (
                  <TableRow key={gasto.id} className="hover:bg-primary/5">
                    <TableCell>{format(new Date(gasto.fecha + "T00:00:00"), "dd/MM/yyyy", { locale: es })}</TableCell>
                    <TableCell className="min-w-48 max-w-sm whitespace-normal">
                      <p className="font-medium">{gasto.descripcion}</p>
                      <span className="mt-1 inline-block text-xs text-muted-foreground">{gasto.categoria || "Varios"}</span>
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{formatCurrency(Number(gasto.monto))}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="gap-1.5 border-primary/20 bg-primary/5 font-normal text-primary">
                        {gasto.metodo_pago === "efectivo" ? <Banknote className="h-3.5 w-3.5" /> : <CreditCard className="h-3.5 w-3.5" />}
                        {gasto.metodo_pago === "efectivo" ? "Efectivo" : "Transferencia"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button size="icon" variant="ghost" className="text-primary" title="Editar gasto" aria-label={`Editar gasto: ${gasto.descripcion}`} onClick={() => handleEdit(gasto)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-red-600 hover:text-red-700"
                          title="Eliminar gasto"
                          aria-label={`Eliminar gasto: ${gasto.descripcion}`}
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
