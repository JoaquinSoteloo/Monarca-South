"use client"

import { useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import type React from "react"
import { useState } from "react"
import type { Socio, Genetica, Venta, LineaVenta, Producto } from "@/lib/types"
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
  CalendarIcon,
  Crown,
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { cn } from "@/lib/utils"
import { BarcodeScanner } from "./barcode-scanner"

interface VentasManagerProps {
  socios: Socio[]
  geneticas: Genetica[]
  productos: Producto[]
  initialVentas: Venta[]
}

export function VentasManager({ socios, geneticas, productos, initialVentas }: VentasManagerProps) {
  const [ventas, setVentas] = useState(initialVentas)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const [showLimitDialog, setShowLimitDialog] = useState(false)
  const [fechaVenta, setFechaVenta] = useState<Date>(new Date())
  const [popoverFechaOpen, setPopoverFechaOpen] = useState(false)

  const [lineas, setLineas] = useState<LineaVenta[]>([
    {
      tipo: "genetica",
      genetica_id: "",
      producto_id: "",
      gramos: 0,
      cantidad_enrolados: 0,
      peso_por_enrolado: 0,
      cantidad_producto: 0,
    },
  ])

  const [formData, setFormData] = useState({
    socio_id: "",
    notas: "",
  })

  const [pagoCombinado, setPagoCombinado] = useState({
    efectivo: 0,
    transferencia: 0,
  })

  const [scannerOpen, setScannerOpen] = useState(false)
  const [scanningLineIndex, setScanningLineIndex] = useState<number | null>(null)
  const [deudaSocio, setDeudaSocio] = useState<number>(0)
  const supabase = createClient()

  const selectedSocio = socios.find((s) => s.id === formData.socio_id)

  // Consultar deuda del socio cuando cambia
  useEffect(() => {
    const consultarDeuda = async () => {
      if (!formData.socio_id) {
        setDeudaSocio(0)
        return
      }
      const { data } = await supabase
        .from("ventas")
        .select("saldo_pendiente")
        .eq("socio_id", formData.socio_id)
        .gt("saldo_pendiente", 0)
      
      const totalDeuda = data?.reduce((acc, v) => acc + (Number(v.saldo_pendiente) || 0), 0) || 0
      setDeudaSocio(totalDeuda)
    }
    consultarDeuda()
  }, [formData.socio_id])
  const esMiembro = selectedSocio?.es_miembro || false

  const calcularLinea = (linea: LineaVenta) => {
    if (linea.tipo === "producto") {
      const producto = productos.find((p) => p.id === linea.producto_id)
      const precioProducto = esMiembro ? 0 : producto?.precio || 0
      const subtotal = Math.round(linea.cantidad_producto * precioProducto * 100) / 100

      return {
        genetica: null,
        producto,
        precioGramo: 0,
        precioEnrolado: 0,
        precioProducto,
        pesoEnrolados: 0,
        gramosTotales: 0,
        subtotal,
        subtotalGramos: 0,
        subtotalEnrolados: 0,
      }
    }

    const genetica = geneticas.find((g) => g.id === linea.genetica_id)
    const precioGramo = esMiembro ? 0 : genetica?.precio_por_gramo || 0
    const precioEnrolado = esMiembro ? 0 : genetica?.precio_por_enrolado || 0
    const pesoEnrolados = Math.round(linea.cantidad_enrolados * linea.peso_por_enrolado * 10) / 10
    const gramosTotales = Math.round((linea.gramos + pesoEnrolados) * 10) / 10

    const subtotalGramos = Math.round(linea.gramos * precioGramo * 100) / 100
    const subtotalEnrolados = Math.round(linea.cantidad_enrolados * precioEnrolado * 100) / 100
    const subtotal = Math.round((subtotalGramos + subtotalEnrolados) * 100) / 100

    return {
      genetica,
      producto: null,
      precioGramo,
      precioEnrolado,
      precioProducto: 0,
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

  const agregarLineaGenetica = () => {
    setLineas([
      ...lineas,
      {
        tipo: "genetica",
        genetica_id: "",
        producto_id: "",
        gramos: 0,
        cantidad_enrolados: 0,
        peso_por_enrolado: 0,
        cantidad_producto: 0,
      },
    ])
  }

  const agregarLineaProducto = () => {
    setLineas([
      ...lineas,
      {
        tipo: "producto",
        genetica_id: "",
        producto_id: "",
        gramos: 0,
        cantidad_enrolados: 0,
        peso_por_enrolado: 0,
        cantidad_producto: 1,
      },
    ])
  }

  const eliminarLinea = (index: number) => {
    if (lineas.length > 1) {
      setLineas(lineas.filter((_, i) => i !== index))
    }
  }

  const actualizarLinea = (index: number, campo: keyof LineaVenta, valor: string | number) => {
    const nuevasLineas = [...lineas]
    if (campo === "genetica_id" || campo === "producto_id" || campo === "tipo") {
      nuevasLineas[index][campo] = valor as any
    } else {
      nuevasLineas[index][campo] = Number(valor) || 0
    }
    setLineas(nuevasLineas)
  }

  const getTipoVenta = () => {
    let tieneGramos = false
    let tieneEnrolados = false
    let tieneProducto = false
    for (const linea of lineas) {
      if (linea.tipo === "genetica") {
        if (linea.gramos > 0) tieneGramos = true
        if (linea.cantidad_enrolados > 0) tieneEnrolados = true
      } else if (linea.tipo === "producto") {
        if (linea.cantidad_producto > 0) tieneProducto = true
      }
    }
    if (tieneGramos && tieneEnrolados && tieneProducto) return "mixto"
    if (tieneGramos && tieneEnrolados) return "genetica_y_enrolados"
    if (tieneEnrolados) return "enrolados"
    if (tieneProducto) return "productos"
    return "gramos"
  }

  const procesarVenta = async () => {
    setLoading(true)
    setShowLimitDialog(false)

    for (const linea of lineas) {
      if (linea.tipo === "genetica" && linea.genetica_id) {
        const { gramosTotales, genetica } = calcularLinea(linea)
        if (genetica && gramosTotales > genetica.gramos_disponibles) {
          setError(`Stock insuficiente de ${genetica.nombre}. Disponible: ${genetica.gramos_disponibles}g`)
          setLoading(false)
          return
        }
      } else if (linea.tipo === "producto" && linea.producto_id) {
        const { producto } = calcularLinea(linea)
        if (producto && linea.cantidad_producto > producto.cantidad) {
          setError(`Stock insuficiente de ${producto.nombre}. Disponible: ${producto.cantidad}`)
          setLoading(false)
          return
        }
      }
    }

    // Calcular montos - deuda se calcula automáticamente
    const montoPagado = pagoCombinado.efectivo + pagoCombinado.transferencia
    const saldoPendiente = Math.max(0, totalVenta - montoPagado)
    
    // Determinar método de pago principal
    let metodoPagoFinal: "efectivo" | "transferencia" | "pendiente" = "efectivo"
    if (saldoPendiente >= totalVenta) {
      metodoPagoFinal = "pendiente" // Todo es deuda
    } else if (pagoCombinado.transferencia > pagoCombinado.efectivo) {
      metodoPagoFinal = "transferencia"
    } else if (pagoCombinado.efectivo > 0) {
      metodoPagoFinal = "efectivo"
    } else if (saldoPendiente > 0) {
      metodoPagoFinal = "pendiente"
    }

    const ventaData = {
      socio_id: formData.socio_id,
      genetica_id: lineas.find((l) => l.tipo === "genetica")?.genetica_id || null,
      tipo_venta: getTipoVenta(),
      gramos: gramosTotalesVenta,
      precio_unitario: lineas.length === 1 && lineas[0].tipo === "genetica" ? calcularLinea(lineas[0]).precioGramo : 0,
      total: totalVenta,
      metodo_pago: metodoPagoFinal,
      saldo_pendiente: saldoPendiente,
      monto_pagado: montoPagado,
      notas: formData.notas || null,
      created_at: fechaVenta.toISOString(),
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

    // Registrar pagos si hay montos
    if (pagoCombinado.efectivo > 0) {
      await supabase.from("pagos").insert({
        venta_id: newVenta.id,
        monto: pagoCombinado.efectivo,
        metodo_pago: "efectivo",
        fecha: fechaVenta.toISOString(),
      })
    }
    if (pagoCombinado.transferencia > 0) {
      await supabase.from("pagos").insert({
        venta_id: newVenta.id,
        monto: pagoCombinado.transferencia,
        metodo_pago: "transferencia",
        fecha: fechaVenta.toISOString(),
      })
    }

    for (const linea of lineas) {
      if (linea.tipo === "genetica" && linea.genetica_id) {
        const { gramosTotales, subtotal, precioGramo, precioEnrolado, genetica, pesoEnrolados } = calcularLinea(linea)
        if (linea.gramos <= 0 && linea.cantidad_enrolados <= 0) continue

        await supabase.from("detalle_venta").insert({
          venta_id: newVenta.id,
          genetica_id: linea.genetica_id,
          producto_id: null,
          gramos: linea.gramos,
          cantidad_enrolados: linea.cantidad_enrolados > 0 ? linea.cantidad_enrolados : null,
          peso_por_enrolado: linea.peso_por_enrolado > 0 ? linea.peso_por_enrolado : null,
          peso_enrolados: pesoEnrolados > 0 ? pesoEnrolados : null,
          precio_unitario: precioGramo,
          precio_enrolado: precioEnrolado > 0 ? precioEnrolado : null,
          subtotal: subtotal,
        })

        if (genetica) {
          await supabase
            .from("geneticas")
            .update({
              gramos_disponibles: genetica.gramos_disponibles - gramosTotales,
              updated_at: new Date().toISOString(),
            })
            .eq("id", linea.genetica_id)
        }
      } else if (linea.tipo === "producto" && linea.producto_id) {
        const { subtotal, precioProducto, producto } = calcularLinea(linea)
        if (linea.cantidad_producto <= 0) continue

        await supabase.from("detalle_venta").insert({
          venta_id: newVenta.id,
          genetica_id: null,
          producto_id: linea.producto_id,
          gramos: 0,
          cantidad_enrolados: linea.cantidad_producto,
          peso_por_enrolado: null,
          peso_enrolados: null,
          precio_unitario: precioProducto,
          precio_enrolado: null,
          subtotal: subtotal,
        })

        if (producto) {
          await supabase
            .from("productos")
            .update({
              cantidad: producto.cantidad - linea.cantidad_producto,
              updated_at: new Date().toISOString(),
            })
            .eq("id", linea.producto_id)
        }
      }
    }

    await supabase
      .from("socios")
      .update({
        gramos_consumidos_mes: consumidoMes + gramosTotalesVenta,
        updated_at: new Date().toISOString(),
      })
      .eq("id", formData.socio_id)

    const geneticasNombres = lineas
      .filter((l) => l.tipo === "genetica" && l.genetica_id)
      .map((l) => geneticas.find((g) => g.id === l.genetica_id)?.nombre)
      .filter(Boolean)
      .join(", ")

    const productosNombres = lineas
      .filter((l) => l.tipo === "producto" && l.producto_id)
      .map((l) => productos.find((p) => p.id === l.producto_id)?.nombre)
      .filter(Boolean)
      .join(", ")

    setVentas([
      { ...newVenta, genetica: { nombre: geneticasNombres } as any, producto: { nombre: productosNombres } as any },
      ...ventas,
    ])
    setLineas([
      {
        tipo: "genetica",
        genetica_id: "",
        producto_id: "",
        gramos: 0,
        cantidad_enrolados: 0,
        peso_por_enrolado: 0,
        cantidad_producto: 0,
      },
    ])
    setFormData({
      socio_id: "",
      notas: "",
    })
    setPagoCombinado({ efectivo: 0, transferencia: 0 })
    setFechaVenta(new Date())
    setLoading(false)
    router.refresh()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const lineasValidas = lineas.filter(
      (l) =>
        (l.tipo === "genetica" &&
          l.genetica_id &&
          (l.gramos > 0 || (l.cantidad_enrolados > 0 && l.peso_por_enrolado > 0))) ||
        (l.tipo === "producto" && l.producto_id && l.cantidad_producto > 0),
    )
    if (lineasValidas.length === 0) {
      setError("Agrega al menos un producto con cantidad válida")
      return
    }

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

    // Validar que el pago no exceda el total
    const totalPagado = pagoCombinado.efectivo + pagoCombinado.transferencia
    if (totalPagado > totalVenta) {
      setError(`El pago ($${totalPagado.toLocaleString()}) excede el total de la venta ($${totalVenta.toLocaleString()})`)
      return
    }

    await procesarVenta()
  }

  const handleBarcodeScan = (barcode: string) => {
    if (scanningLineIndex === null) return

    console.log("[v0] Código escaneado:", barcode)

    // Buscar producto por código de barras
    const producto = productos.find((p) => p.codigo_barras === barcode && p.activo)

    if (producto) {
      console.log("[v0] Producto encontrado:", producto.nombre)
      actualizarLinea(scanningLineIndex, "producto_id", producto.id)
      setScannerOpen(false)
      setScanningLineIndex(null)
    } else {
      console.log("[v0] Producto no encontrado con código:", barcode)
      alert(`No se encontró ningún producto con el código: ${barcode}`)
    }
  }

  const openScanner = (index: number) => {
    setScanningLineIndex(index)
    setScannerOpen(true)
  }

  return (
    <div className="space-y-6">
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
            <ShoppingCart className="h-5 w-5 text-emerald-500" />
            Registrar Venta
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label>Fecha de Venta</Label>
              <Popover open={popoverFechaOpen} onOpenChange={setPopoverFechaOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal border-border hover:border-emerald-400 hover:bg-emerald-50/50",
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4 text-emerald-600" />
                    {format(fechaVenta, "dd 'de' MMMM, yyyy", { locale: es })}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 border-emerald-200" align="start">
                  <Calendar
                    mode="single"
                    selected={fechaVenta}
                    onSelect={(date) => {
                      if (date) {
                        const now = new Date()
                        date.setHours(now.getHours(), now.getMinutes(), now.getSeconds())
                        setFechaVenta(date)
                      }
                      setPopoverFechaOpen(false)
                    }}
                    locale={es}
                    disabled={(date) => date > new Date()}
                    className="rounded-md"
                  />
                </PopoverContent>
              </Popover>
              {fechaVenta.toDateString() !== new Date().toDateString() && (
                <p className="text-xs text-amber-600 flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Registrando venta de fecha anterior
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>
                  Socio <span className="text-red-500">*</span>
                </Label>
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
                        <div className="flex items-center gap-2">
                          {s.apellido}, {s.nombre} - {s.dni}
                          {s.es_miembro && (
                            <Badge
                              variant="outline"
                              className="border-amber-400 text-amber-500 bg-amber-500/10 text-xs ml-1"
                            >
                              <Crown className="h-3 w-3 mr-1" />
                              Miembro
                            </Badge>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                {deudaSocio > 0 && (
                  <div className="mt-2 p-3 rounded-lg bg-amber-50 border border-amber-200 flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                    <div className="text-sm">
                      <span className="font-medium text-amber-700">Este socio tiene una deuda pendiente de </span>
                      <span className="font-bold text-amber-700">${deudaSocio.toLocaleString()}</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label>Pagos recibidos (Total: ${totalVenta.toLocaleString()})</Label>
                <div className="p-4 rounded-lg bg-muted/30 border space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs flex items-center gap-1">
                        <Banknote className="h-3 w-3 text-emerald-600" />
                        Efectivo
                      </Label>
                      <Input
                        type="number"
                        min="0"
                        max={totalVenta}
                        value={pagoCombinado.efectivo || ""}
                        onChange={(e) => setPagoCombinado({ ...pagoCombinado, efectivo: Number(e.target.value) || 0 })}
                        placeholder="0"
                        className="bg-background border-border"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs flex items-center gap-1">
                        <CreditCard className="h-3 w-3 text-blue-600" />
                        Transferencia
                      </Label>
                      <Input
                        type="number"
                        min="0"
                        max={totalVenta}
                        value={pagoCombinado.transferencia || ""}
                        onChange={(e) => setPagoCombinado({ ...pagoCombinado, transferencia: Number(e.target.value) || 0 })}
                        placeholder="0"
                        className="bg-background border-border"
                      />
                    </div>
                  </div>
                  {(() => {
                    const totalPagado = pagoCombinado.efectivo + pagoCombinado.transferencia
                    const deuda = Math.max(0, totalVenta - totalPagado)
                    const excedente = Math.max(0, totalPagado - totalVenta)
                    return (
                      <div className="flex justify-between items-center pt-2 border-t">
                        <div className="text-sm">
                          <span className="text-muted-foreground">Pagado: </span>
                          <span className="font-medium text-emerald-600">${totalPagado.toLocaleString()}</span>
                        </div>
                        {deuda > 0 ? (
                          <div className="text-sm">
                            <span className="text-muted-foreground">Deuda: </span>
                            <span className="font-medium text-amber-600">${deuda.toLocaleString()}</span>
                          </div>
                        ) : excedente > 0 ? (
                          <div className="text-sm text-red-600">
                            Excede en ${excedente.toLocaleString()}
                          </div>
                        ) : (
                          <div className="text-sm text-emerald-600 font-medium">
                            Pagado completo
                          </div>
                        )}
                      </div>
                    )
                  })()}
                </div>
              </div>
            </div>

            {esMiembro && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <Crown className="h-5 w-5 text-amber-500" />
                <span className="text-sm text-amber-600 font-medium">
                  Este socio es miembro del club - La venta será sin costo ($0)
                </span>
              </div>
            )}

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Productos</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={agregarLineaGenetica}
                    className="h-8 text-xs border-emerald-300 text-emerald-700 hover:bg-emerald-50 bg-transparent"
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Genética
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={agregarLineaProducto}
                    className="h-8 text-xs border-blue-300 text-blue-700 hover:bg-blue-50 bg-transparent"
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Producto
                  </Button>
                </div>
              </div>

              {lineas.map((linea, index) => {
                const calc = calcularLinea(linea)

                return (
                  <div key={index} className="p-4 rounded-lg bg-muted/50 border border-border space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-foreground">
                        {linea.tipo === "genetica" ? "Genética" : "Producto"} {index + 1}
                      </span>
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

                    {linea.tipo === "genetica" ? (
                      <>
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
                              max={calc.genetica?.gramos_disponibles || 0}
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
                                {linea.cantidad_enrolados} x {linea.peso_por_enrolado}g = {calc.pesoEnrolados}g
                              </p>
                            )}
                          </div>
                        )}

                        {(linea.gramos > 0 || linea.cantidad_enrolados > 0) && calc.genetica && (
                          <div className="pt-2 border-t border-border space-y-1">
                            {linea.gramos > 0 && (
                              <div className="flex justify-between text-sm text-muted-foreground">
                                <span>
                                  {linea.gramos}g x ${calc.precioGramo}/g
                                </span>
                                <span>${calc.subtotalGramos.toFixed(2)}</span>
                              </div>
                            )}
                            {linea.cantidad_enrolados > 0 && calc.precioEnrolado > 0 && (
                              <div className="flex justify-between text-sm text-amber-700">
                                <span>
                                  {linea.cantidad_enrolados} enr. x ${calc.precioEnrolado}/enr
                                </span>
                                <span>${calc.subtotalEnrolados.toFixed(2)}</span>
                              </div>
                            )}
                            <div className="flex justify-between text-sm font-medium pt-1">
                              <span>Subtotal</span>
                              <span className="text-foreground">${calc.subtotal.toFixed(2)}</span>
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <div className="space-y-3">
                          <div className="flex gap-2">
                            <Select
                              value={linea.producto_id}
                              onValueChange={(value) => actualizarLinea(index, "producto_id", value)}
                            >
                              <SelectTrigger className="bg-background border-border flex-1">
                                <SelectValue placeholder="Seleccionar producto" />
                              </SelectTrigger>
                              <SelectContent>
                                {productos
                                  .filter((p) => p.activo)
                                  .map((p) => (
                                    <SelectItem key={p.id} value={p.id}>
                                      {p.nombre} - Stock: {p.cantidad} (${p.precio})
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              onClick={() => openScanner(index)}
                              className="bg-transparent border-border hover:bg-muted shrink-0"
                              title="Escanear código de barras"
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="20"
                                height="20"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <path d="M3 5v14" />
                                <path d="M8 5v14" />
                                <path d="M12 5v14" />
                                <path d="M17 5v14" />
                                <path d="M21 5v14" />
                              </svg>
                            </Button>
                          </div>

                          <div className="space-y-2">
                            <Label className="text-xs">Cantidad</Label>
                            <Input
                              type="number"
                              min="1"
                              max={calc.producto?.cantidad || 0}
                              value={linea.cantidad_producto || ""}
                              onChange={(e) => actualizarLinea(index, "cantidad_producto", e.target.value)}
                              placeholder="1"
                              className="bg-background border-border"
                            />
                          </div>

                          {linea.cantidad_producto > 0 && calc.producto && (
                            <div className="pt-2 border-t border-border">
                              <div className="flex justify-between text-sm text-muted-foreground">
                                <span>
                                  {linea.cantidad_producto} x ${calc.precioProducto}
                                </span>
                                <span className="font-medium text-foreground">${calc.subtotal.toFixed(2)}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )
              })}
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

      <BarcodeScanner
        isOpen={scannerOpen}
        onClose={() => {
          setScannerOpen(false)
          setScanningLineIndex(null)
        }}
        onScan={handleBarcodeScan}
      />

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <ShoppingCart className="h-5 w-5 text-emerald-500" />
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
                  <TableHead className="text-muted-foreground">Producto</TableHead>
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
                    <TableCell className="text-foreground">{venta.producto?.nombre || "-"}</TableCell>
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
