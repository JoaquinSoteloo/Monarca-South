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
  Star,
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
import { formatCurrency, formatGramos } from "@/lib/format"
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
  const [lineasParaEnviar, setLineasParaEnviar] = useState<LineaVenta[]>([])
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
  const esVip = selectedSocio?.es_vip || false

  const calcularLinea = (linea: LineaVenta) => {
    if (linea.tipo === "producto") {
      const producto = productos.find((p) => p.id === linea.producto_id)
      const precioProducto = producto?.precio || 0
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
    const precioGramo = esMiembro
      ? genetica?.precio_gramo_miembro || 0
      : esVip
        ? genetica?.precio_gramo_vip || 0
        : genetica?.precio_por_gramo || 0
    const precioEnrolado = esMiembro
      ? genetica?.precio_enrolado_miembro || 0
      : esVip
        ? genetica?.precio_enrolado_vip || 0
        : genetica?.precio_por_enrolado || 0
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
    if (campo === "genetica_id" || campo === "producto_id" || campo === "tipo" || campo === "detalle_id") {
      nuevasLineas[index][campo] = valor as any
    } else {
      nuevasLineas[index][campo] = Number(valor) || 0
    }
    setLineas(nuevasLineas)
  }

  const procesarVenta = async (lineasValidas: LineaVenta[]) => {
    setLoading(true)
    setShowLimitDialog(false)

    // Chequeo rápido de UX (no es la autoridad: el servidor vuelve a validar
    // todo contra el stock y los precios vigentes al momento de la llamada).
    for (const linea of lineasValidas) {
      if (linea.tipo === "genetica" && linea.genetica_id) {
        const { gramosTotales, genetica } = calcularLinea(linea)
        if (genetica && gramosTotales > genetica.gramos_disponibles) {
          setError(`Stock insuficiente de ${genetica.nombre}. Disponible: ${formatGramos(genetica.gramos_disponibles)}`)
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

    const { data: newVenta, error: rpcError } = await supabase
      .rpc("registrar_venta", {
        p_socio_id: formData.socio_id,
        p_lineas: lineasValidas.map((l) => ({
          tipo: l.tipo,
          genetica_id: l.genetica_id || null,
          producto_id: l.producto_id || null,
          gramos: l.gramos,
          cantidad_enrolados: l.cantidad_enrolados,
          peso_por_enrolado: l.peso_por_enrolado,
          cantidad_producto: l.cantidad_producto,
        })),
        p_pago_efectivo: pagoCombinado.efectivo,
        p_pago_transferencia: pagoCombinado.transferencia,
        p_notas: formData.notas || null,
        p_fecha: fechaVenta.toISOString(),
      })
      .single()

    if (rpcError) {
      setLoading(false)
      if (/^VT0\d{2}$/.test(rpcError.code || "")) {
        setError(rpcError.message)
      } else {
        console.error("Error inesperado al registrar venta:", rpcError)
        setError("Ocurrió un error inesperado. Intentá nuevamente.")
      }
      return
    }

    // La RPC devuelve sólo la fila de `ventas` (sin el join a socios que
    // hacía el insert directo antes) — se arma el mismo objeto de
    // visualización usando los datos que el cliente ya tiene cargados.
    const geneticasNombres = lineasValidas
      .filter((l) => l.tipo === "genetica" && l.genetica_id)
      .map((l) => geneticas.find((g) => g.id === l.genetica_id)?.nombre)
      .filter(Boolean)
      .join(", ")

    const productosNombres = lineasValidas
      .filter((l) => l.tipo === "producto" && l.producto_id)
      .map((l) => productos.find((p) => p.id === l.producto_id)?.nombre)
      .filter(Boolean)
      .join(", ")

    setVentas([
      {
        ...(newVenta as any),
        socio: selectedSocio ? { nombre: selectedSocio.nombre, apellido: selectedSocio.apellido } : undefined,
        genetica: { nombre: geneticasNombres } as any,
        producto: { nombre: productosNombres } as any,
      },
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

    for (const linea of lineasValidas) {
      if (linea.cantidad_enrolados > 0 && linea.peso_por_enrolado <= 0) {
        const gen = geneticas.find((g) => g.id === linea.genetica_id)
        setError(`Ingresa el peso por enrolado para ${gen?.nombre || "la genética"}`)
        return
      }
    }

    setLineasParaEnviar(lineasValidas)

    if (excedeLimit) {
      setShowLimitDialog(true)
      return
    }

    // Validar que el pago no exceda el total
    const totalPagado = pagoCombinado.efectivo + pagoCombinado.transferencia
    if (totalPagado > totalVenta) {
      setError(`El pago (${formatCurrency(totalPagado)}) excede el total de la venta (${formatCurrency(totalVenta)})`)
      return
    }

    await procesarVenta(lineasValidas)
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
    <div className="flex min-w-0 flex-col gap-6">
      <Dialog open={showLimitDialog} onOpenChange={setShowLimitDialog}>
        <DialogContent className="monarca-theme max-h-[90dvh] overflow-y-auto sm:max-w-md">
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
              tiene un límite de <strong className="text-foreground">{formatGramos(limiteMensual)}</strong> por mes.
            </p>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-1">
              <p className="text-sm text-amber-800">
                Consumido este mes: <strong>{formatGramos(consumidoMes)}</strong>
              </p>
              <p className="text-sm text-amber-800">
                Intentando comprar: <strong>{formatGramos(gramosTotalesVenta)}</strong>
              </p>
              <p className="text-sm text-amber-800">
                Nuevo total: <strong>{formatGramos(consumidoMes + gramosTotalesVenta)}</strong> (
                {formatGramos(consumidoMes + gramosTotalesVenta - limiteMensual)} sobre el límite)
              </p>
            </div>
            <p className="text-sm text-muted-foreground mt-3">¿Deseas continuar con la venta de todas formas?</p>
          </div>
          <DialogFooter className="flex gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShowLimitDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={() => procesarVenta(lineasParaEnviar)} disabled={loading}>
              {loading ? "Registrando..." : "Sí, continuar con la venta"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div>
        <h1 className="text-[26px] font-semibold leading-tight text-foreground">Ventas</h1>
        <p className="mt-1 text-sm text-muted-foreground">Prepará la venta y revisá el cobro antes de registrarla.</p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px] lg:items-start"
      >
        {/* Columna principal: fecha, socio, ítems */}
        <div className="flex min-w-0 flex-col gap-6">
          <section className="min-w-0 rounded-xl border bg-card p-5">
            <h2 className="mb-4 flex items-center gap-2 text-base font-semibold"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs text-primary">1</span> Datos de la venta</h2>
            <div className="grid min-w-0 gap-4 md:grid-cols-[minmax(0,1fr)_240px]">
          <div className="space-y-2">
            <Label htmlFor="socio-select" className="font-semibold text-primary">
              Socio <span className="text-destructive">*</span>
            </Label>
            <Select
              value={formData.socio_id}
              onValueChange={(value) => setFormData({ ...formData, socio_id: value })}
            >
              <SelectTrigger id="socio-select" className="w-full bg-card">
                <SelectValue placeholder="Seleccionar socio" />
              </SelectTrigger>
              <SelectContent className="monarca-theme">
                {socios.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    <div className="flex items-center gap-2">
                      {s.apellido}, {s.nombre} - {s.dni}
                      {s.es_miembro && (
                        <Badge variant="outline" className="border-accent/50 bg-accent/10 text-accent-foreground text-xs ml-1">
                          <Crown className="h-3 w-3 mr-1" />
                          Miembro
                        </Badge>
                      )}
                      {s.es_vip && (
                        <Badge variant="outline" className="border-primary/40 bg-primary/10 text-primary text-xs ml-1">
                          <Star className="h-3 w-3 mr-1" />
                          VIP
                        </Badge>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

          </div>
          <div className="min-w-0 space-y-2">
            <Label htmlFor="fecha-venta">Fecha de venta</Label>
            <Popover open={popoverFechaOpen} onOpenChange={setPopoverFechaOpen}>
              <PopoverTrigger asChild>
                <Button
                  id="fecha-venta"
                  type="button"
                  variant="outline"
                  className="w-full justify-start bg-card text-left font-normal"
                >
                  <CalendarIcon className="mr-2 h-4 w-4 text-primary" />
                  {format(fechaVenta, "dd 'de' MMMM, yyyy", { locale: es })}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="monarca-theme w-auto p-0" align="start">
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

            </div>
            <div className="mt-3 space-y-2">
            {deudaSocio > 0 && (
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                <div className="text-sm">
                  <span className="font-medium text-amber-700">Este socio tiene una deuda pendiente de </span>
                  <span className="font-bold text-amber-700">{formatCurrency(deudaSocio)}</span>
                </div>
              </div>
            )}

            {esMiembro && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-accent/10 border border-accent/30">
                <Crown className="h-5 w-5 text-accent" />
                <span className="text-sm text-accent-foreground font-medium">
                  Socio miembro del club - Se aplica el precio de miembro definido en cada genética
                </span>
              </div>
            )}

            {esVip && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/10 border border-primary/30">
                <Star className="h-5 w-5 text-primary" />
                <span className="text-sm text-primary font-medium">
                  Socio VIP - Se aplica el precio VIP definido en cada genética
                </span>
              </div>
            )}
            </div>
          </section>

          <div className="space-y-3 rounded-xl border bg-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-base font-semibold"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs text-primary">2</span> Ítems de la venta</h2>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={agregarLineaGenetica}
                  className="bg-card text-primary border-primary/30 hover:bg-primary/5 hover:text-primary"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Genética
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={agregarLineaProducto}
                  className="bg-card text-primary border-primary/30 hover:bg-primary/5 hover:text-primary"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Producto
                </Button>
              </div>
            </div>

            {lineas.map((linea, index) => {
              const calc = calcularLinea(linea)

              return (
                <div key={index} className="min-w-0 p-4 rounded-lg bg-primary/5 border border-primary/15 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground">
                      {linea.tipo === "genetica" ? "Genética" : "Producto"} {index + 1}
                    </span>
                    {lineas.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => eliminarLinea(index)}
                        className="text-destructive hover:text-destructive"
                        aria-label="Eliminar línea"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>

                  {linea.tipo === "genetica" ? (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor={`genetica-${index}`} className="text-xs">
                          Genética
                        </Label>
                        <Select
                          value={linea.genetica_id}
                          onValueChange={(value) => actualizarLinea(index, "genetica_id", value)}
                        >
                          <SelectTrigger id={`genetica-${index}`} className="w-full bg-card">
                            <SelectValue placeholder="Seleccionar genética" />
                          </SelectTrigger>
                          <SelectContent className="monarca-theme">
                            {geneticas.map((g) => {
                              const gPrecioGramo = esMiembro
                                ? g.precio_gramo_miembro || 0
                                : esVip
                                  ? g.precio_gramo_vip || 0
                                  : g.precio_por_gramo || 0
                              const gPrecioEnrolado = esMiembro
                                ? g.precio_enrolado_miembro || 0
                                : esVip
                                  ? g.precio_enrolado_vip || 0
                                  : g.precio_por_enrolado || 0
                              return (
                                <SelectItem key={g.id} value={g.id}>
                                  {g.nombre} - {formatGramos(g.gramos_disponibles)} ({formatCurrency(gPrecioGramo)}/g
                                  {gPrecioEnrolado ? ` | ${formatCurrency(gPrecioEnrolado)}/enr` : ""})
                                </SelectItem>
                              )
                            })}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label htmlFor={`gramos-${index}`} className="text-xs flex items-center gap-1">
                            <Scale className="h-3 w-3 text-primary" />
                            Gramos
                          </Label>
                          <Input
                            id={`gramos-${index}`}
                            type="number"
                            step="0.1"
                            min="0"
                            max={calc.genetica?.gramos_disponibles || 0}
                            value={linea.gramos || ""}
                            onChange={(e) => actualizarLinea(index, "gramos", e.target.value)}
                            placeholder="0"
                            className="bg-card"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={`enrolados-${index}`} className="text-xs flex items-center gap-1">
                            <Cigarette className="h-3 w-3 text-accent" />
                            Enrolados
                          </Label>
                          <Input
                            id={`enrolados-${index}`}
                            type="number"
                            min="0"
                            value={linea.cantidad_enrolados || ""}
                            onChange={(e) => actualizarLinea(index, "cantidad_enrolados", e.target.value)}
                            placeholder="0"
                            className="bg-card"
                          />
                        </div>
                      </div>

                      {linea.cantidad_enrolados > 0 && (
                        <div className="space-y-2">
                          <Label htmlFor={`peso-enrolado-${index}`} className="text-xs">
                            Peso por enrolado (g)
                          </Label>
                          <Input
                            id={`peso-enrolado-${index}`}
                            type="number"
                            step="0.1"
                            min="0"
                            value={linea.peso_por_enrolado || ""}
                            onChange={(e) => actualizarLinea(index, "peso_por_enrolado", e.target.value)}
                            placeholder="Ej: 0.5"
                            className="bg-card"
                          />
                          {linea.peso_por_enrolado > 0 && (
                            <p className="text-xs text-muted-foreground">
                              {linea.cantidad_enrolados} x {formatGramos(linea.peso_por_enrolado)} ={" "}
                              {formatGramos(calc.pesoEnrolados)}
                            </p>
                          )}
                        </div>
                      )}

                      {(linea.gramos > 0 || linea.cantidad_enrolados > 0) && calc.genetica && (
                        <div className="pt-2 border-t border-border space-y-1">
                          {linea.gramos > 0 && (
                            <div className="flex justify-between text-sm text-muted-foreground">
                              <span>
                                {formatGramos(linea.gramos)} x {formatCurrency(calc.precioGramo)}/g
                              </span>
                              <span>{formatCurrency(calc.subtotalGramos)}</span>
                            </div>
                          )}
                          {linea.cantidad_enrolados > 0 && calc.precioEnrolado > 0 && (
                            <div className="flex justify-between text-sm text-muted-foreground">
                              <span>
                                {linea.cantidad_enrolados} enr. x {formatCurrency(calc.precioEnrolado)}/enr
                              </span>
                              <span>{formatCurrency(calc.subtotalEnrolados)}</span>
                            </div>
                          )}
                          <div className="flex justify-between text-sm font-medium pt-1">
                            <span>Subtotal</span>
                            <span className="text-foreground">{formatCurrency(calc.subtotal)}</span>
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
                            <SelectTrigger id={`producto-${index}`} aria-label={`Producto ${index + 1}`} className="min-w-0 flex-1 bg-card">
                              <SelectValue placeholder="Seleccionar producto" />
                            </SelectTrigger>
                            <SelectContent className="monarca-theme">
                              {productos
                                .filter((p) => p.activo)
                                .map((p) => (
                                  <SelectItem key={p.id} value={p.id}>
                                    {p.nombre} - Stock: {p.cantidad} ({formatCurrency(p.precio)})
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={() => openScanner(index)}
                            className="bg-card hover:bg-muted shrink-0"
                            title="Escanear código de barras"
                            aria-label="Escanear código de barras"
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
                          <Label htmlFor={`cantidad-producto-${index}`} className="text-xs">
                            Cantidad
                          </Label>
                          <Input
                            id={`cantidad-producto-${index}`}
                            type="number"
                            min="1"
                            max={calc.producto?.cantidad || 0}
                            value={linea.cantidad_producto || ""}
                            onChange={(e) => actualizarLinea(index, "cantidad_producto", e.target.value)}
                            placeholder="1"
                            className="bg-card"
                          />
                        </div>

                        {linea.cantidad_producto > 0 && calc.producto && (
                          <div className="pt-2 border-t border-border">
                            <div className="flex justify-between text-sm text-muted-foreground">
                              <span>
                                {linea.cantidad_producto} x {formatCurrency(calc.precioProducto)}
                              </span>
                              <span className="font-medium text-foreground">{formatCurrency(calc.subtotal)}</span>
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

          <details className="rounded-xl border bg-card p-4">
            <summary className="cursor-pointer text-sm font-medium text-primary">Notas de la venta (opcional)</summary>
            <Label htmlFor="notas" className="sr-only">Notas</Label>
            <Textarea
              id="notas"
              value={formData.notas}
              onChange={(e) => setFormData({ ...formData, notas: e.target.value })}
              placeholder="Observaciones..."
              className="mt-3 bg-card"
            />
          </details>
        </div>

        {/* Resumen lateral en escritorio, debajo del formulario en móvil */}
        <Card className="min-w-0 gap-0 overflow-hidden border-border bg-card shadow-sm xl:sticky xl:top-6">
          <CardHeader className="-mt-6 gap-3 bg-primary py-5 text-primary-foreground">
            <CardTitle className="flex items-center gap-2 text-base"><ShoppingCart className="h-4 w-4" />3 · Resumen y cobro</CardTitle>
            <div>
              <p className="text-xs text-primary-foreground/80">Total de la venta</p>
              <p className="mt-1 break-words text-3xl font-semibold tabular-nums">{formatCurrency(totalVenta)}</p>
              <p className="mt-1 text-xs text-primary-foreground/80">{formatGramos(gramosTotalesVenta)} en esta venta</p>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            <div className="space-y-2 text-sm">
              {selectedSocio && <p className="font-medium">{selectedSocio.apellido}, {selectedSocio.nombre}</p>}
              {lineas.filter((l) => l.tipo === "genetica" ? l.genetica_id && (l.gramos > 0 || l.cantidad_enrolados > 0) : l.producto_id && l.cantidad_producto > 0).map((linea, index) => {
                const detalle = calcularLinea(linea)
                return <div key={index} className="flex items-start justify-between gap-3">
                  <span className="min-w-0 text-muted-foreground">{detalle.genetica?.nombre || detalle.producto?.nombre}</span>
                  <span className="shrink-0 tabular-nums">{formatCurrency(detalle.subtotal)}</span>
                </div>
              })}
            </div>

            <div className="space-y-2 border-t border-border pt-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Pagos recibidos</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="pago-efectivo" className="text-xs flex items-center gap-1">
                    <Banknote className="h-3 w-3 text-primary" />
                    Efectivo
                  </Label>
                  <Input
                    id="pago-efectivo"
                    type="number"
                    min="0"
                    max={totalVenta}
                    value={pagoCombinado.efectivo || ""}
                    onChange={(e) => setPagoCombinado({ ...pagoCombinado, efectivo: Number(e.target.value) || 0 })}
                    placeholder="0"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="pago-transferencia" className="text-xs flex items-center gap-1">
                    <CreditCard className="h-3 w-3 text-primary" />
                    Transferencia
                  </Label>
                  <Input
                    id="pago-transferencia"
                    type="number"
                    min="0"
                    max={totalVenta}
                    value={pagoCombinado.transferencia || ""}
                    onChange={(e) =>
                      setPagoCombinado({ ...pagoCombinado, transferencia: Number(e.target.value) || 0 })
                    }
                    placeholder="0"
                  />
                </div>
              </div>
              {(() => {
                const totalPagado = pagoCombinado.efectivo + pagoCombinado.transferencia
                const deuda = Math.max(0, totalVenta - totalPagado)
                const excedente = Math.max(0, totalPagado - totalVenta)
                return (
                  <div className="flex flex-wrap justify-between items-center gap-2 pt-2 border-t border-border">
                    <div className="text-sm">
                      <span className="text-muted-foreground">Pagado: </span>
                      <span className="font-medium text-primary">{formatCurrency(totalPagado)}</span>
                    </div>
                    {!lineas.some((l) => l.tipo === "genetica" ? l.genetica_id && (l.gramos > 0 || (l.cantidad_enrolados > 0 && l.peso_por_enrolado > 0)) : l.producto_id && l.cantidad_producto > 0) ? (
                      <p className="text-xs text-muted-foreground">Agregá ítems con cantidades válidas para calcular el total.</p>
                    ) : deuda > 0 ? (
                      <div className="text-sm">
                        <span className="text-muted-foreground">Deuda: </span>
                        <span className="font-medium text-amber-700">{formatCurrency(deuda)}</span>
                      </div>
                    ) : excedente > 0 ? (
                      <div className="text-sm text-destructive">Excede en {formatCurrency(excedente)}</div>
                    ) : (
                      <div className="text-sm text-primary font-medium">Pagado completo</div>
                    )}
                  </div>
                )
              })()}
            </div>

            {error && (
              <div role="alert" className="flex items-start gap-2 rounded-lg bg-destructive/5 p-3 text-destructive text-sm">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                {error}
              </div>
            )}

            <Button type="submit" className="w-full" size="lg" disabled={loading || !formData.socio_id}>
              {loading ? "Registrando..." : "Registrar venta"}
            </Button>
          </CardContent>
        </Card>
      </form>

      <BarcodeScanner
        isOpen={scannerOpen}
        onClose={() => {
          setScannerOpen(false)
          setScanningLineIndex(null)
        }}
        onScan={handleBarcodeScan}
      />

      <Card className="border-border bg-card shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShoppingCart className="h-4 w-4 text-primary" />
            Últimas ventas
          </CardTitle>
        </CardHeader>
        <CardContent>
          {ventas.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No hay ventas registradas hoy</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border bg-primary/10">
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
                        <span className="text-foreground">{formatGramos(venta.gramos)}</span>
                        {venta.cantidad_enrolados && venta.cantidad_enrolados > 0 && (
                          <Badge variant="outline" className="ml-1 border-accent/40 bg-accent/10 text-accent-foreground text-xs">
                            +{venta.cantidad_enrolados} enr.
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge
                          variant="outline"
                          className={
                            venta.metodo_pago === "efectivo"
                              ? "border-primary/30 text-primary"
                              : venta.metodo_pago === "pendiente"
                                ? "border-amber-300 text-amber-700"
                                : undefined
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
                      <TableCell className="text-right font-medium text-primary">
                        {formatCurrency(Number(venta.total))}
                      </TableCell>
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
