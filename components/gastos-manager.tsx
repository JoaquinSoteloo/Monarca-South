"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import type { Gasto } from "@/lib/types"
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
import { CalendarIcon, Plus, DollarSign, Pencil, Trash2 } from "lucide-react"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { useToast } from "@/hooks/use-toast"

export function GastosManager() {
  const [gastos, setGastos] = useState<Gasto[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingGasto, setEditingGasto] = useState<Gasto | null>(null)
  const [formData, setFormData] = useState({
    descripcion: "",
    monto: "",
    metodo_pago: "efectivo" as "efectivo" | "transferencia",
    fecha: new Date(),
  })
  const { toast } = useToast()
  const supabase = createClient()

  useEffect(() => {
    fetchGastos()
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
      metodo_pago: gasto.metodo_pago,
      fecha: new Date(gasto.fecha),
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

  const totalGastos = gastos.reduce((sum, g) => sum + Number(g.monto), 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Gestión de Gastos</h2>
          <p className="text-muted-foreground">Registrá y administrá los gastos del club</p>
        </div>
        <Button onClick={() => setShowForm(true)} className="bg-emerald-700 hover:bg-emerald-800">
          <Plus className="h-4 w-4 mr-2" />
          Nuevo Gasto
        </Button>
      </div>

      <Card className="bg-gradient-to-br from-red-50 to-white border-red-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-800">
            <DollarSign className="h-5 w-5" />
            Total de Gastos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold text-red-700">${totalGastos.toFixed(2)}</div>
        </CardContent>
      </Card>

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
          ) : gastos.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No hay gastos registrados</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead>Monto</TableHead>
                  <TableHead>Método de Pago</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {gastos.map((gasto) => (
                  <TableRow key={gasto.id}>
                    <TableCell>{format(new Date(gasto.fecha), "dd/MM/yyyy", { locale: es })}</TableCell>
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
