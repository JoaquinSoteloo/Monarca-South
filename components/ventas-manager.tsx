"use client"

import type React from "react"

import { useState } from "react"
import { createClient } from "@/lib/supabase/client"
import type { Socio, Genetica, Venta } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { ShoppingCart, AlertCircle, Banknote, CreditCard, AlertTriangle } from "lucide-react"
import { useRouter } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface VentasManagerProps {
  socios: Socio[]
  geneticas: Genetica[]
  initialVentas: Venta[]
}

export function VentasManager({ socios, geneticas, initialVentas }: VentasManagerProps) {
  const [ventas, setVentas] = useState(initialVentas)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const [showLimitDialog, setShowLimitDialog] = useState(false)

  const [formData, setFormData] = useState({
    socio_id: "",
    genetica_id: "",
    gramos: "",
    notas: "",
    metodo_pago: "efectivo" as "efectivo" | "transferencia",
  })

  const selectedSocio = socios.find((s) => s.id === formData.socio_id)
  const selectedGenetica = geneticas.find((g) => g.id === formData.genetica_id)

  const gramosDisponibles = selectedGenetica?.gramos_disponibles || 0
  const precioUnitario = selectedGenetica?.precio_por_gramo || 0
  const gramosInput = Number.parseFloat(formData.gramos) || 0
  const total = gramosInput * precioUnitario

  const limiteMensual = selectedSocio?.gramos_mensuales || 0
  const consumidoMes = selectedSocio?.gramos_consumidos_mes || 0
  const disponibleSocio = limiteMensual - consumidoMes
  const excedeLimit = limiteMensual > 0 && gramosInput > disponibleSocio

  const procesarVenta = async () => {
    setLoading(true)
    setShowLimitDialog(false)
    const supabase = createClient()

    const ventaData = {
      socio_id: formData.socio_id,
      genetica_id: formData.genetica_id,
      gramos: gramosInput,
      precio_unitario: precioUnitario,
      total: total,
      metodo_pago: formData.metodo_pago,
      notas: formData.notas || null,
    }

    const { data: newVenta, error: ventaError } = await supabase
      .from("ventas")
      .insert(ventaData)
      .select("*, socio:socios(nombre, apellido), genetica:geneticas(nombre)")
      .single()

    if (ventaError) {
      setError("Error al registrar la venta")
      setLoading(false)
      return
    }

    await supabase
      .from("geneticas")
      .update({
        gramos_disponibles: gramosDisponibles - gramosInput,
        updated_at: new Date().toISOString(),
      })
      .eq("id", formData.genetica_id)

    await supabase
      .from("socios")
      .update({
        gramos_consumidos_mes: consumidoMes + gramosInput,
        updated_at: new Date().toISOString(),
      })
      .eq("id", formData.socio_id)

    setVentas([newVenta, ...ventas])
    setFormData({ socio_id: "", genetica_id: "", gramos: "", notas: "", metodo_pago: "efectivo" })
    setLoading(false)
    router.refresh()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (gramosInput <= 0) {
      setError("Ingresa una cantidad válida de gramos")
      return
    }

    if (gramosInput > gramosDisponibles) {
      setError(`Stock insuficiente. Disponible: ${gramosDisponibles}g`)
      return
    }

    if (excedeLimit) {
      setShowLimitDialog(true)
      return
    }

    await procesarVenta()
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Dialog open={showLimitDialog} onOpenChange={setShowLimitDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
                <AlertTriangle className="h-6 w-6 text-amber-600" />
              </div>
              <div>
                <DialogTitle className="text-foreground">Límite mensual excedido</DialogTitle>
                <DialogDescription className="text-muted-foreground">
                  El socio superará su límite mensual
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground mb-3">
              <strong className="text-foreground">
                {selectedSocio?.nombre} {selectedSocio?.apellido}
              </strong>{" "}
              tiene un límite de <strong className="text-foreground">{limiteMensual}g</strong> por mes.
            </p>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-1">
              <p className="text-sm text-amber-800">
                Consumido este mes: <strong>{consumidoMes}g</strong>
              </p>
              <p className="text-sm text-amber-800">
                Intentando comprar: <strong>{gramosInput}g</strong>
              </p>
              <p className="text-sm text-amber-800">
                Nuevo total: <strong>{consumidoMes + gramosInput}g</strong> (
                {consumidoMes + gramosInput - limiteMensual}g sobre el límite)
              </p>
            </div>
            <p className="text-sm text-muted-foreground mt-3">¿Deseas continuar con la venta de todas formas?</p>
          </div>
          <DialogFooter className="flex gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShowLimitDialog(false)} className="border-border">
              Cancelar
            </Button>
            <Button onClick={procesarVenta} disabled={loading} className="bg-amber-600 hover:bg-amber-700">
              {loading ? "Registrando..." : "Sí, continuar con la venta"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <ShoppingCart className="h-5 w-5 text-emerald-600" />
            Nueva Venta
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="socio">Socio</Label>
              <Select
                value={formData.socio_id}
                onValueChange={(value) => setFormData({ ...formData, socio_id: value })}
              >
                <SelectTrigger className="bg-background border-border">
                  <SelectValue placeholder="Seleccionar socio" />
                </SelectTrigger>
                <SelectContent>
                  {socios.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.apellido}, {s.nombre} - {s.dni}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedSocio && selectedSocio.gramos_mensuales && (
                <p className="text-xs text-muted-foreground">
                  Límite mensual: {selectedSocio.gramos_mensuales}g | Disponible:{" "}
                  <span className={disponibleSocio <= 0 ? "text-red-500" : "text-emerald-600"}>{disponibleSocio}g</span>
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="genetica">Genética</Label>
              <Select
                value={formData.genetica_id}
                onValueChange={(value) => setFormData({ ...formData, genetica_id: value })}
              >
                <SelectTrigger className="bg-background border-border">
                  <SelectValue placeholder="Seleccionar genética" />
                </SelectTrigger>
                <SelectContent>
                  {geneticas.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.nombre} - {g.gramos_disponibles}g disponibles (${g.precio_por_gramo}/g)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="gramos">Cantidad (gramos)</Label>
              <Input
                id="gramos"
                type="number"
                step="0.5"
                min="0.5"
                max={Math.min(40, gramosDisponibles)}
                value={formData.gramos}
                onChange={(e) => setFormData({ ...formData, gramos: e.target.value })}
                placeholder="Ej: 5"
                required
                className="bg-background border-border"
              />
              <p className="text-xs text-muted-foreground">Máximo por venta: 40g</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="metodo_pago">Método de Pago</Label>
              <Select
                value={formData.metodo_pago}
                onValueChange={(value: "efectivo" | "transferencia") =>
                  setFormData({ ...formData, metodo_pago: value })
                }
              >
                <SelectTrigger className="bg-background border-border">
                  <SelectValue placeholder="Seleccionar método de pago" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="efectivo">
                    <div className="flex items-center gap-2">
                      <Banknote className="h-4 w-4" />
                      Efectivo
                    </div>
                  </SelectItem>
                  <SelectItem value="transferencia">
                    <div className="flex items-center gap-2">
                      <CreditCard className="h-4 w-4" />
                      Transferencia
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notas">Notas (opcional)</Label>
              <Textarea
                id="notas"
                value={formData.notas}
                onChange={(e) => setFormData({ ...formData, notas: e.target.value })}
                placeholder="Observaciones..."
                className="bg-background border-border"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 text-red-500 text-sm">
                <AlertCircle className="h-4 w-4" />
                {error}
              </div>
            )}

            <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Total a cobrar:</span>
                <span className="text-2xl font-bold text-emerald-600">${total.toFixed(2)}</span>
              </div>
              {gramosInput > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  {gramosInput}g x ${precioUnitario}/g
                </p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full bg-emerald-600 hover:bg-emerald-700"
              disabled={loading || !formData.socio_id || !formData.genetica_id || !formData.gramos}
            >
              {loading ? "Registrando..." : "Registrar Venta"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-foreground">Últimas Ventas</CardTitle>
        </CardHeader>
        <CardContent>
          {ventas.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No hay ventas registradas</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border">
                    <TableHead className="text-muted-foreground">Fecha</TableHead>
                    <TableHead className="text-muted-foreground">Socio</TableHead>
                    <TableHead className="text-muted-foreground">Genética</TableHead>
                    <TableHead className="text-muted-foreground text-right">Cantidad</TableHead>
                    <TableHead className="text-muted-foreground">Pago</TableHead>
                    <TableHead className="text-muted-foreground text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ventas.slice(0, 20).map((venta) => (
                    <TableRow key={venta.id} className="border-border">
                      <TableCell className="text-muted-foreground text-sm">
                        {new Date(venta.created_at).toLocaleDateString("es-AR", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </TableCell>
                      <TableCell className="text-foreground">
                        {venta.socio?.apellido}, {venta.socio?.nombre}
                      </TableCell>
                      <TableCell className="text-foreground">{venta.genetica?.nombre}</TableCell>
                      <TableCell className="text-right text-foreground">{venta.gramos}g</TableCell>
                      <TableCell>
                        <Badge variant={venta.metodo_pago === "efectivo" ? "secondary" : "outline"} className="text-xs">
                          {venta.metodo_pago === "efectivo" ? (
                            <>
                              <Banknote className="h-3 w-3 mr-1" />
                              Efectivo
                            </>
                          ) : (
                            <>
                              <CreditCard className="h-3 w-3 mr-1" />
                              Transferencia
                            </>
                          )}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium text-emerald-600">${venta.total}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
