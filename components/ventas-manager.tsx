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
import { ShoppingCart, AlertCircle, Banknote, CreditCard, AlertTriangle, Scale, Cigarette, Clock } from "lucide-react"
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
    cantidad_enrolados: "",
    peso_por_enrolado: "",
    notas: "",
    metodo_pago: "efectivo" as "efectivo" | "transferencia" | "pendiente",
  })

  const selectedSocio = socios.find((s) => s.id === formData.socio_id)
  const selectedGenetica = geneticas.find((g) => g.id === formData.genetica_id)

  const gramosDisponibles = selectedGenetica?.gramos_disponibles || 0
  const precioUnitario = selectedGenetica?.precio_por_gramo || 0

  const gramosInput = Number.parseFloat(formData.gramos) || 0
  const cantidadEnrolados = Number.parseInt(formData.cantidad_enrolados) || 0
  const pesoPorEnrolado = Number.parseFloat(formData.peso_por_enrolado) || 0
  const pesoTotalEnrolados = Math.round(cantidadEnrolados * pesoPorEnrolado * 10) / 10
  const gramosTotales = Math.round((gramosInput + pesoTotalEnrolados) * 10) / 10
  const total = Math.round(gramosTotales * precioUnitario * 100) / 100

  const limiteMensual = selectedSocio?.gramos_mensuales || 0
  const consumidoMes = selectedSocio?.gramos_consumidos_mes || 0
  const disponibleSocio = limiteMensual - consumidoMes
  const excedeLimit = limiteMensual > 0 && gramosTotales > disponibleSocio

  const getTipoVenta = () => {
    if (gramosInput > 0 && cantidadEnrolados > 0) return "mixto"
    if (cantidadEnrolados > 0) return "enrolados"
    return "gramos"
  }

  const procesarVenta = async () => {
    setLoading(true)
    setShowLimitDialog(false)
    const supabase = createClient()

    const ventaData = {
      socio_id: formData.socio_id,
      genetica_id: formData.genetica_id,
      tipo_venta: getTipoVenta(),
      gramos: gramosTotales,
      cantidad_enrolados: cantidadEnrolados > 0 ? cantidadEnrolados : null,
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
        gramos_disponibles: gramosDisponibles - gramosTotales,
        updated_at: new Date().toISOString(),
      })
      .eq("id", formData.genetica_id)

    await supabase
      .from("socios")
      .update({
        gramos_consumidos_mes: consumidoMes + gramosTotales,
        updated_at: new Date().toISOString(),
      })
      .eq("id", formData.socio_id)

    setVentas([newVenta, ...ventas])
    setFormData({
      socio_id: "",
      genetica_id: "",
      gramos: "",
      cantidad_enrolados: "",
      peso_por_enrolado: "",
      notas: "",
      metodo_pago: "efectivo",
    })
    setLoading(false)
    router.refresh()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (gramosTotales <= 0) {
      setError("Ingresa una cantidad válida de gramos o enrolados")
      return
    }

    if (cantidadEnrolados > 0 && pesoPorEnrolado <= 0) {
      setError("Ingresa el peso por enrolado")
      return
    }

    if (gramosTotales > gramosDisponibles) {
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
                Intentando comprar: <strong>{gramosTotales}g</strong>
              </p>
              <p className="text-sm text-amber-800">
                Nuevo total: <strong>{consumidoMes + gramosTotales}g</strong> (
                {consumidoMes + gramosTotales - limiteMensual}g sobre el límite)
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

            <div className="p-4 rounded-lg bg-muted/50 border border-border space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Scale className="h-4 w-4 text-emerald-600" />
                Gramos
              </div>
              <div className="space-y-2">
                <Label htmlFor="gramos">Cantidad de gramos</Label>
                <Input
                  id="gramos"
                  type="number"
                  step="0.1"
                  min="0"
                  max={gramosDisponibles}
                  value={formData.gramos}
                  onChange={(e) => setFormData({ ...formData, gramos: e.target.value })}
                  placeholder="Ej: 5"
                  className="bg-background border-border"
                />
              </div>
            </div>

            <div className="p-4 rounded-lg bg-muted/50 border border-border space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Cigarette className="h-4 w-4 text-amber-600" />
                Enrolados
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="cantidad_enrolados">Cantidad</Label>
                  <Input
                    id="cantidad_enrolados"
                    type="number"
                    min="0"
                    value={formData.cantidad_enrolados}
                    onChange={(e) => setFormData({ ...formData, cantidad_enrolados: e.target.value })}
                    placeholder="Ej: 3"
                    className="bg-background border-border"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="peso_por_enrolado">Peso c/u (g)</Label>
                  <Input
                    id="peso_por_enrolado"
                    type="number"
                    step="0.1"
                    min="0"
                    value={formData.peso_por_enrolado}
                    onChange={(e) => setFormData({ ...formData, peso_por_enrolado: e.target.value })}
                    placeholder="Ej: 0.5"
                    className="bg-background border-border"
                    disabled={!formData.cantidad_enrolados || Number(formData.cantidad_enrolados) <= 0}
                  />
                </div>
              </div>
              {cantidadEnrolados > 0 && pesoPorEnrolado > 0 && (
                <p className="text-xs text-muted-foreground">
                  Peso total: {cantidadEnrolados} x {pesoPorEnrolado}g = <strong>{pesoTotalEnrolados}g</strong>
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="metodo_pago">Método de Pago</Label>
              <Select
                value={formData.metodo_pago}
                onValueChange={(value: "efectivo" | "transferencia" | "pendiente") =>
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
                  <SelectItem value="pendiente">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      Pendiente
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
              {gramosTotales > 0 && (
                <div className="text-xs text-muted-foreground mt-2 space-y-1">
                  {gramosInput > 0 && (
                    <p className="flex items-center gap-1">
                      <Scale className="h-3 w-3" />
                      Gramos: {gramosInput}g x ${precioUnitario}/g = ${(gramosInput * precioUnitario).toFixed(2)}
                    </p>
                  )}
                  {cantidadEnrolados > 0 && pesoPorEnrolado > 0 && (
                    <p className="flex items-center gap-1">
                      <Cigarette className="h-3 w-3" />
                      {cantidadEnrolados} enrolado{cantidadEnrolados > 1 ? "s" : ""} ({cantidadEnrolados} x{" "}
                      {pesoPorEnrolado}g = {pesoTotalEnrolados}g) x ${precioUnitario}/g = $
                      {(pesoTotalEnrolados * precioUnitario).toFixed(2)}
                    </p>
                  )}
                  <p className="font-medium pt-1 border-t border-emerald-200">Total: {gramosTotales}g</p>
                </div>
              )}
            </div>

            <Button
              type="submit"
              className="w-full bg-emerald-600 hover:bg-emerald-700"
              disabled={
                loading ||
                !formData.socio_id ||
                !formData.genetica_id ||
                gramosTotales <= 0 ||
                (cantidadEnrolados > 0 && pesoPorEnrolado <= 0)
              }
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
                    <TableHead className="text-muted-foreground">Tipo</TableHead>
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
                      <TableCell>
                        {venta.tipo_venta === "mixto" ? (
                          <div className="flex gap-1">
                            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                              <Scale className="h-3 w-3" />
                            </Badge>
                            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                              <Cigarette className="h-3 w-3 mr-1" />
                              Enrolados
                            </Badge>
                          </div>
                        ) : venta.tipo_venta === "enrolados" ? (
                          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                            <Cigarette className="h-3 w-3 mr-1" />
                            Enrolados
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                            <Scale className="h-3 w-3 mr-1" />
                            Gramos
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-foreground">
                        {venta.cantidad_enrolados
                          ? `${venta.cantidad_enrolados} enr. (${venta.gramos}g)`
                          : `${venta.gramos}g`}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            venta.metodo_pago === "pendiente"
                              ? "destructive"
                              : venta.metodo_pago === "efectivo"
                                ? "secondary"
                                : "outline"
                          }
                          className={
                            venta.metodo_pago === "pendiente" ? "bg-red-100 text-red-700 border-red-200" : "text-xs"
                          }
                        >
                          {venta.metodo_pago === "efectivo" ? (
                            <>
                              <Banknote className="h-3 w-3 mr-1" />
                              Efectivo
                            </>
                          ) : venta.metodo_pago === "transferencia" ? (
                            <>
                              <CreditCard className="h-3 w-3 mr-1" />
                              Transferencia
                            </>
                          ) : (
                            <>
                              <Clock className="h-3 w-3 mr-1" />
                              Pendiente
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
