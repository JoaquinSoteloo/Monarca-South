"use client"

import type React from "react"

import { useState } from "react"
import { createClient } from "@/lib/supabase/client"
import type { Socio, Genetica, Venta, LineaVenta } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  ShoppingCart,
  AlertCircle,
  Banknote,
  CreditCard,
  AlertTriangle,
  Scale,
  Cigarette,
  Clock,
  Plus,
  Trash2,
} from "lucide-react"
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

  const [lineas, setLineas] = useState<LineaVenta[]>([
    { genetica_id: "", gramos: 0, cantidad_enrolados: 0, peso_por_enrolado: 0 },
  ])

  const [formData, setFormData] = useState({
    socio_id: "",
    notas: "",
    metodo_pago: "efectivo" as "efectivo" | "transferencia" | "pendiente",
  })

  const selectedSocio = socios.find((s) => s.id === formData.socio_id)

  const calcularLinea = (linea: LineaVenta) => {
    const genetica = geneticas.find((g) => g.id === linea.genetica_id)
    const precioGramo = genetica?.precio_por_gramo || 0
    const precioEnrolado = genetica?.precio_por_enrolado || 0
    const pesoEnrolados = Math.round(linea.cantidad_enrolados * linea.peso_por_enrolado * 10) / 10
    const gramosTotales = Math.round((linea.gramos + pesoEnrolados) * 10) / 10

    // Subtotal = gramos * precio/g + enrolados * precio/enrolado
    const subtotalGramos = Math.round(linea.gramos * precioGramo * 100) / 100
    const subtotalEnrolados = Math.round(linea.cantidad_enrolados * precioEnrolado * 100) / 100
    const subtotal = Math.round((subtotalGramos + subtotalEnrolados) * 100) / 100

    return {
      genetica,
      precioGramo,
      precioEnrolado,
      pesoEnrolados,
      gramosTotales,
      subtotal,
      subtotalGramos,
      subtotalEnrolados,
    }
  }

  const gramosTotalesVenta = lineas.reduce((acc, linea) => {
    const { gramosTotales } = calcularLinea(linea)
    return Math.round((acc + gramosTotales) * 10) / 10
  }, 0)

  const totalVenta = lineas.reduce((acc, linea) => {
    const { subtotal } = calcularLinea(linea)
    return Math.round((acc + subtotal) * 100) / 100
  }, 0)

  const limiteMensual = selectedSocio?.gramos_mensuales || 0
  const consumidoMes = selectedSocio?.gramos_consumidos_mes || 0
  const disponibleSocio = limiteMensual - consumidoMes
  const excedeLimit = limiteMensual > 0 && gramosTotalesVenta > disponibleSocio

  const agregarLinea = () => {
    setLineas([...lineas, { genetica_id: "", gramos: 0, cantidad_enrolados: 0, peso_por_enrolado: 0 }])
  }

  const eliminarLinea = (index: number) => {
    if (lineas.length > 1) {
      setLineas(lineas.filter((_, i) => i !== index))
    }
  }

  const actualizarLinea = (index: number, campo: keyof LineaVenta, valor: string | number) => {
    const nuevasLineas = [...lineas]
    if (campo === "genetica_id") {
      nuevasLineas[index][campo] = valor as string
    } else {
      nuevasLineas[index][campo] = Number(valor) || 0
    }
    setLineas(nuevasLineas)
  }

  const getTipoVenta = () => {
    let tieneGramos = false
    let tieneEnrolados = false
    for (const linea of lineas) {
      if (linea.gramos > 0) tieneGramos = true
      if (linea.cantidad_enrolados > 0) tieneEnrolados = true
    }
    if (tieneGramos && tieneEnrolados) return "mixto"
    if (tieneEnrolados) return "enrolados"
    return "gramos"
  }

  const procesarVenta = async () => {
    setLoading(true)
    setShowLimitDialog(false)
    const supabase = createClient()

    // Validar stock de cada línea
    for (const linea of lineas) {
      if (!linea.genetica_id) continue
      const { gramosTotales, genetica } = calcularLinea(linea)
      if (genetica && gramosTotales > genetica.gramos_disponibles) {
        setError(`Stock insuficiente de ${genetica.nombre}. Disponible: ${genetica.gramos_disponibles}g`)
        setLoading(false)
        return
      }
    }

    // Esos campos están en detalle_venta, no en ventas
    const ventaData = {
      socio_id: formData.socio_id,
      genetica_id: lineas[0]?.genetica_id || null,
      tipo_venta: getTipoVenta(),
      gramos: gramosTotalesVenta,
      precio_unitario: lineas.length === 1 ? calcularLinea(lineas[0]).precioGramo : 0,
      total: totalVenta,
      metodo_pago: formData.metodo_pago,
      notas: formData.notas || null,
    }

    const { data: newVenta, error: ventaError } = await supabase
      .from("ventas")
      .insert(ventaData)
      .select("*, socio:socios(nombre, apellido)")
      .single()

    if (ventaError) {
      setError("Error al registrar la venta: " + ventaError.message)
      setLoading(false)
      return
    }

    // Insertar detalles de venta y actualizar stock
    for (const linea of lineas) {
      if (!linea.genetica_id) continue
      const { gramosTotales, subtotal, precioGramo, precioEnrolado, genetica, pesoEnrolados } = calcularLinea(linea)
      if (linea.gramos <= 0 && linea.cantidad_enrolados <= 0) continue

      // Insertar detalle con precio de enrolado
      await supabase.from("detalle_venta").insert({
        venta_id: newVenta.id,
        genetica_id: linea.genetica_id,
        gramos: linea.gramos,
        cantidad_enrolados: linea.cantidad_enrolados > 0 ? linea.cantidad_enrolados : null,
        peso_por_enrolado: linea.peso_por_enrolado > 0 ? linea.peso_por_enrolado : null,
        peso_enrolados: pesoEnrolados > 0 ? pesoEnrolados : null,
        precio_unitario: precioGramo,
        precio_enrolado: precioEnrolado > 0 ? precioEnrolado : null,
        subtotal: subtotal,
      })

      // Actualizar stock
      if (genetica) {
        await supabase
          .from("geneticas")
          .update({
            gramos_disponibles: genetica.gramos_disponibles - gramosTotales,
            updated_at: new Date().toISOString(),
          })
          .eq("id", linea.genetica_id)
      }
    }

    // Actualizar consumo del socio
    await supabase
      .from("socios")
      .update({
        gramos_consumidos_mes: consumidoMes + gramosTotalesVenta,
        updated_at: new Date().toISOString(),
      })
      .eq("id", formData.socio_id)

    // Agregar nombres de genéticas a la venta para mostrar
    const geneticasNombres = lineas
      .filter((l) => l.genetica_id)
      .map((l) => geneticas.find((g) => g.id === l.genetica_id)?.nombre)
      .filter(Boolean)
      .join(", ")

    setVentas([{ ...newVenta, genetica: { nombre: geneticasNombres } as any }, ...ventas])
    setLineas([{ genetica_id: "", gramos: 0, cantidad_enrolados: 0, peso_por_enrolado: 0 }])
    setFormData({
      socio_id: "",
      notas: "",
      metodo_pago: "efectivo",
    })
    setLoading(false)
    router.refresh()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    // Validar que hay al menos una línea con datos
    const lineasValidas = lineas.filter(
      (l) => l.genetica_id && (l.gramos > 0 || (l.cantidad_enrolados > 0 && l.peso_por_enrolado > 0)),
    )
    if (lineasValidas.length === 0) {
      setError("Agrega al menos una genética con cantidad válida")
      return
    }

    // Validar enrolados sin peso
    for (const linea of lineas) {
      if (linea.cantidad_enrolados > 0 && linea.peso_por_enrolado <= 0) {
        const gen = geneticas.find((g) => g.id === linea.genetica_id)
        setError(`Ingresa el peso por enrolado para ${gen?.nombre || "la genética"}`)
        return
      }
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
                Intentando comprar: <strong>{gramosTotalesVenta}g</strong>
              </p>
              <p className="text-sm text-amber-800">
                Nuevo total: <strong>{consumidoMes + gramosTotalesVenta}g</strong> (
                {consumidoMes + gramosTotalesVenta - limiteMensual}g sobre el límite)
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

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Productos</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={agregarLinea}
                  className="h-8 text-xs border-emerald-300 text-emerald-700 hover:bg-emerald-50 bg-transparent"
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Agregar genética
                </Button>
              </div>

              {lineas.map((linea, index) => {
                const {
                  genetica,
                  gramosTotales,
                  subtotal,
                  pesoEnrolados,
                  precioGramo,
                  precioEnrolado,
                  subtotalGramos,
                  subtotalEnrolados,
                } = calcularLinea(linea)
                const gramosDisponibles = genetica?.gramos_disponibles || 0

                return (
                  <div key={index} className="p-4 rounded-lg bg-muted/50 border border-border space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-foreground">Producto {index + 1}</span>
                      {lineas.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => eliminarLinea(index)}
                          className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs">Genética</Label>
                      <Select
                        value={linea.genetica_id}
                        onValueChange={(value) => actualizarLinea(index, "genetica_id", value)}
                      >
                        <SelectTrigger className="bg-background border-border">
                          <SelectValue placeholder="Seleccionar genética" />
                        </SelectTrigger>
                        <SelectContent>
                          {geneticas.map((g) => (
                            <SelectItem key={g.id} value={g.id}>
                              {g.nombre} - {g.gramos_disponibles}g (${g.precio_por_gramo}/g
                              {g.precio_por_enrolado ? ` | $${g.precio_por_enrolado}/enr` : ""})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label className="text-xs flex items-center gap-1">
                          <Scale className="h-3 w-3 text-emerald-600" />
                          Gramos
                        </Label>
                        <Input
                          type="number"
                          step="0.1"
                          min="0"
                          max={gramosDisponibles}
                          value={linea.gramos || ""}
                          onChange={(e) => actualizarLinea(index, "gramos", e.target.value)}
                          placeholder="0"
                          className="bg-background border-border"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs flex items-center gap-1">
                          <Cigarette className="h-3 w-3 text-amber-600" />
                          Enrolados
                        </Label>
                        <Input
                          type="number"
                          min="0"
                          value={linea.cantidad_enrolados || ""}
                          onChange={(e) => actualizarLinea(index, "cantidad_enrolados", e.target.value)}
                          placeholder="0"
                          className="bg-background border-border"
                        />
                      </div>
                    </div>

                    {linea.cantidad_enrolados > 0 && (
                      <div className="space-y-2">
                        <Label className="text-xs">Peso por enrolado (g)</Label>
                        <Input
                          type="number"
                          step="0.1"
                          min="0"
                          value={linea.peso_por_enrolado || ""}
                          onChange={(e) => actualizarLinea(index, "peso_por_enrolado", e.target.value)}
                          placeholder="Ej: 0.5"
                          className="bg-background border-border"
                        />
                        {linea.peso_por_enrolado > 0 && (
                          <p className="text-xs text-muted-foreground">
                            {linea.cantidad_enrolados} x {linea.peso_por_enrolado}g = {pesoEnrolados}g
                          </p>
                        )}
                      </div>
                    )}

                    {(linea.gramos > 0 || linea.cantidad_enrolados > 0) && genetica && (
                      <div className="pt-2 border-t border-border space-y-1">
                        {linea.gramos > 0 && (
                          <div className="flex justify-between text-sm text-muted-foreground">
                            <span>
                              {linea.gramos}g x ${precioGramo}/g
                            </span>
                            <span>${subtotalGramos.toFixed(2)}</span>
                          </div>
                        )}
                        {linea.cantidad_enrolados > 0 && precioEnrolado > 0 && (
                          <div className="flex justify-between text-sm text-amber-700">
                            <span>
                              {linea.cantidad_enrolados} enr. x ${precioEnrolado}/enr
                            </span>
                            <span>${subtotalEnrolados.toFixed(2)}</span>
                          </div>
                        )}
                        <div className="flex justify-between text-sm font-medium pt-1">
                          <span>Subtotal</span>
                          <span className="text-foreground">${subtotal.toFixed(2)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
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
                <span className="text-muted-foreground">Total ({gramosTotalesVenta}g)</span>
                <span className="text-2xl font-bold text-emerald-600">${totalVenta.toFixed(2)}</span>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full bg-emerald-600 hover:bg-emerald-700"
              disabled={loading || !formData.socio_id}
            >
              {loading ? "Registrando..." : "Registrar Venta"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <ShoppingCart className="h-5 w-5 text-emerald-600" />
            Últimas Ventas
          </CardTitle>
        </CardHeader>
        <CardContent>
          {ventas.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No hay ventas registradas hoy</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-border">
                  <TableHead className="text-muted-foreground">Socio</TableHead>
                  <TableHead className="text-muted-foreground">Genética</TableHead>
                  <TableHead className="text-muted-foreground text-right">Cantidad</TableHead>
                  <TableHead className="text-muted-foreground text-center">Pago</TableHead>
                  <TableHead className="text-muted-foreground text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ventas.slice(0, 10).map((venta) => (
                  <TableRow key={venta.id} className="border-border">
                    <TableCell className="text-foreground">
                      {venta.socio?.apellido}, {venta.socio?.nombre}
                    </TableCell>
                    <TableCell className="text-foreground">{venta.genetica?.nombre || "-"}</TableCell>
                    <TableCell className="text-right">
                      <span className="text-foreground">{venta.gramos}g</span>
                      {venta.cantidad_enrolados && venta.cantidad_enrolados > 0 && (
                        <Badge variant="outline" className="ml-1 border-amber-300 text-amber-700 text-xs">
                          +{venta.cantidad_enrolados} enr.
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge
                        variant="outline"
                        className={
                          venta.metodo_pago === "efectivo"
                            ? "border-emerald-300 text-emerald-700"
                            : venta.metodo_pago === "transferencia"
                              ? "border-blue-300 text-blue-700"
                              : "border-red-300 text-red-600"
                        }
                      >
                        {venta.metodo_pago === "efectivo" && <Banknote className="h-3 w-3 mr-1" />}
                        {venta.metodo_pago === "transferencia" && <CreditCard className="h-3 w-3 mr-1" />}
                        {venta.metodo_pago === "pendiente" && <Clock className="h-3 w-3 mr-1" />}
                        {venta.metodo_pago === "efectivo"
                          ? "Efectivo"
                          : venta.metodo_pago === "transferencia"
                            ? "Transferencia"
                            : "Pendiente"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium text-emerald-600">
                      ${Number(venta.total).toFixed(2)}
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
