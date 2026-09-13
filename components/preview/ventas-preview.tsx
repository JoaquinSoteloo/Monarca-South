"use client"

import type React from "react"
import { useState } from "react"
import {
  ShoppingCart,
  AlertTriangle,
  Banknote,
  CreditCard,
  Scale,
  Cigarette,
  Plus,
  Trash2,
  CalendarIcon,
  Crown,
  Star,
  CheckCircle2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
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
import { formatCurrency, formatGramos } from "@/components/preview/format"

/**
 * Muestra de diseño para /ventas — misma fórmula de cálculo que
 * components/ventas-manager.tsx (precio miembro/VIP, gramos + enrolados,
 * límite mensual, pago combinado), pero con datos ficticios en memoria.
 * No llama a Supabase ni a la RPC registrar_venta: "Registrar venta" acá
 * sólo simula el resultado para mostrar el flujo completo.
 */

type TipoLinea = "genetica" | "producto"

interface LineaMock {
  tipo: TipoLinea
  genetica_id: string
  producto_id: string
  gramos: number
  cantidad_enrolados: number
  peso_por_enrolado: number
  cantidad_producto: number
}

const sociosMock = [
  {
    id: "s1",
    nombre: "Ana",
    apellido: "Gómez",
    dni: "30111222",
    es_miembro: true,
    es_vip: false,
    gramos_mensuales: 40,
    gramos_consumidos_mes: 28,
    deuda: 0,
  },
  {
    id: "s2",
    nombre: "Luis",
    apellido: "Pereyra",
    dni: "28444555",
    es_miembro: false,
    es_vip: true,
    gramos_mensuales: 60,
    gramos_consumidos_mes: 51,
    deuda: 8200,
  },
  {
    id: "s3",
    nombre: "Marta",
    apellido: "Fernández",
    dni: "33777888",
    es_miembro: false,
    es_vip: false,
    gramos_mensuales: 30,
    gramos_consumidos_mes: 12,
    deuda: 21000,
  },
]

const geneticasMock = [
  {
    id: "g1",
    nombre: "Amnesia Haze",
    gramos_disponibles: 340,
    precio_por_gramo: 1200,
    precio_por_enrolado: 1800,
    precio_gramo_miembro: 1000,
    precio_enrolado_miembro: 1500,
    precio_gramo_vip: 950,
    precio_enrolado_vip: 1400,
  },
  {
    id: "g2",
    nombre: "Northern Lights",
    gramos_disponibles: 85,
    precio_por_gramo: 1100,
    precio_por_enrolado: 1600,
    precio_gramo_miembro: 950,
    precio_enrolado_miembro: 1400,
    precio_gramo_vip: 900,
    precio_enrolado_vip: 1300,
  },
]

const productosMock = [
  { id: "p1", nombre: "Papel de armar", cantidad: 24, precio: 900 },
  { id: "p2", nombre: "Grinder mediano", cantidad: 6, precio: 4500 },
]

const lineaVacia = (): LineaMock => ({
  tipo: "genetica",
  genetica_id: "",
  producto_id: "",
  gramos: 0,
  cantidad_enrolados: 0,
  peso_por_enrolado: 0,
  cantidad_producto: 0,
})

export function VentasPreview() {
  const [fechaVenta, setFechaVenta] = useState<Date>(new Date())
  const [popoverFechaOpen, setPopoverFechaOpen] = useState(false)
  const [socioId, setSocioId] = useState("")
  const [notas, setNotas] = useState("")
  const [lineas, setLineas] = useState<LineaMock[]>([lineaVacia()])
  const [pago, setPago] = useState({ efectivo: 0, transferencia: 0 })
  const [showLimitDialog, setShowLimitDialog] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const selectedSocio = sociosMock.find((s) => s.id === socioId)
  const esMiembro = selectedSocio?.es_miembro ?? false
  const esVip = selectedSocio?.es_vip ?? false
  const deudaSocio = selectedSocio?.deuda ?? 0

  const calcularLinea = (linea: LineaMock) => {
    if (linea.tipo === "producto") {
      const producto = productosMock.find((p) => p.id === linea.producto_id)
      const precioProducto = producto?.precio || 0
      const subtotal = Math.round(linea.cantidad_producto * precioProducto * 100) / 100
      return { genetica: null, producto, precioGramo: 0, precioEnrolado: 0, pesoEnrolados: 0, gramosTotales: 0, subtotal, subtotalGramos: 0, subtotalEnrolados: 0 }
    }

    const genetica = geneticasMock.find((g) => g.id === linea.genetica_id)
    const precioGramo = esMiembro ? genetica?.precio_gramo_miembro || 0 : esVip ? genetica?.precio_gramo_vip || 0 : genetica?.precio_por_gramo || 0
    const precioEnrolado = esMiembro ? genetica?.precio_enrolado_miembro || 0 : esVip ? genetica?.precio_enrolado_vip || 0 : genetica?.precio_por_enrolado || 0
    const pesoEnrolados = Math.round(linea.cantidad_enrolados * linea.peso_por_enrolado * 10) / 10
    const gramosTotales = Math.round((linea.gramos + pesoEnrolados) * 10) / 10
    const subtotalGramos = Math.round(linea.gramos * precioGramo * 100) / 100
    const subtotalEnrolados = Math.round(linea.cantidad_enrolados * precioEnrolado * 100) / 100
    const subtotal = Math.round((subtotalGramos + subtotalEnrolados) * 100) / 100

    return { genetica, producto: null, precioGramo, precioEnrolado, pesoEnrolados, gramosTotales, subtotal, subtotalGramos, subtotalEnrolados }
  }

  const gramosTotalesVenta = lineas.reduce((acc, l) => Math.round((acc + calcularLinea(l).gramosTotales) * 10) / 10, 0)
  const totalVenta = lineas.reduce((acc, l) => Math.round((acc + calcularLinea(l).subtotal) * 100) / 100, 0)

  const limiteMensual = selectedSocio?.gramos_mensuales || 0
  const consumidoMes = selectedSocio?.gramos_consumidos_mes || 0
  const disponibleSocio = limiteMensual - consumidoMes
  const excedeLimit = limiteMensual > 0 && gramosTotalesVenta > disponibleSocio

  const totalPagado = pago.efectivo + pago.transferencia
  const saldo = Math.max(0, totalVenta - totalPagado)
  const excedente = Math.max(0, totalPagado - totalVenta)

  const actualizarLinea = (index: number, campo: keyof LineaMock, valor: string | number) => {
    setLineas((prev) => {
      const next = [...prev]
      if (campo === "genetica_id" || campo === "producto_id" || campo === "tipo") {
        next[index] = { ...next[index], [campo]: valor as string }
      } else {
        next[index] = { ...next[index], [campo]: Number(valor) || 0 }
      }
      return next
    })
  }

  const agregarLinea = (tipo: TipoLinea) => {
    setLineas((prev) => [...prev, { ...lineaVacia(), tipo, cantidad_producto: tipo === "producto" ? 1 : 0 }])
  }

  const eliminarLinea = (index: number) => {
    setLineas((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev))
  }

  const registrarSimulado = () => {
    setShowLimitDialog(false)
    setLoading(true)
    window.setTimeout(() => {
      setLoading(false)
      setSuccess(true)
      setLineas([lineaVacia()])
      setSocioId("")
      setNotas("")
      setPago({ efectivo: 0, transferencia: 0 })
      setFechaVenta(new Date())
    }, 500)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(false)

    const lineasValidas = lineas.filter(
      (l) =>
        (l.tipo === "genetica" && l.genetica_id && (l.gramos > 0 || (l.cantidad_enrolados > 0 && l.peso_por_enrolado > 0))) ||
        (l.tipo === "producto" && l.producto_id && l.cantidad_producto > 0),
    )
    if (!socioId) {
      setError("Seleccioná un socio")
      return
    }
    if (lineasValidas.length === 0) {
      setError("Agregá al menos un producto con cantidad válida")
      return
    }
    if (totalPagado > totalVenta) {
      setError(`El pago (${formatCurrency(totalPagado)}) excede el total de la venta (${formatCurrency(totalVenta)})`)
      return
    }
    if (excedeLimit) {
      setShowLimitDialog(true)
      return
    }
    registrarSimulado()
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
      <Dialog open={showLimitDialog} onOpenChange={setShowLimitDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
                <AlertTriangle className="h-6 w-6 text-amber-700" />
              </div>
              <div>
                <DialogTitle>Límite mensual excedido</DialogTitle>
                <DialogDescription>El socio superará su límite mensual</DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <p>
              Límite: <strong>{formatGramos(limiteMensual)}</strong> · Consumido:{" "}
              <strong>{formatGramos(consumidoMes)}</strong>
            </p>
            <p>
              Esta venta: <strong>{formatGramos(gramosTotalesVenta)}</strong> → Nuevo total:{" "}
              <strong>{formatGramos(consumidoMes + gramosTotalesVenta)}</strong>
            </p>
          </div>
          <DialogFooter className="flex gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setShowLimitDialog(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={registrarSimulado} disabled={loading}>
              {loading ? "Registrando..." : "Sí, continuar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Columna principal: socio + ítems */}
      <div className="flex flex-col gap-6">
        <div className="space-y-2">
          <Label htmlFor="fecha-venta">Fecha de venta</Label>
          <Popover open={popoverFechaOpen} onOpenChange={setPopoverFechaOpen}>
            <PopoverTrigger asChild>
              <Button id="fecha-venta" type="button" variant="outline" className="w-full justify-start font-normal sm:w-64">
                <CalendarIcon className="mr-2 h-4 w-4 text-primary" />
                {format(fechaVenta, "dd 'de' MMMM, yyyy", { locale: es })}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={fechaVenta}
                onSelect={(date) => {
                  if (date) setFechaVenta(date)
                  setPopoverFechaOpen(false)
                }}
                locale={es}
                disabled={(date) => date > new Date()}
              />
            </PopoverContent>
          </Popover>
        </div>

        <div className="space-y-2">
          <Label htmlFor="socio-select">
            Socio <span className="text-destructive">*</span>
          </Label>
          <Select value={socioId} onValueChange={setSocioId}>
            <SelectTrigger id="socio-select" className="w-full">
              <SelectValue placeholder="Seleccionar socio" />
            </SelectTrigger>
            <SelectContent>
              {sociosMock.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  <span className="flex items-center gap-2">
                    {s.apellido}, {s.nombre} — {s.dni}
                    {s.es_miembro && (
                      <Badge variant="outline" className="border-accent/50 bg-accent/10 text-accent-foreground">
                        <Crown className="h-3 w-3" /> Miembro
                      </Badge>
                    )}
                    {s.es_vip && (
                      <Badge variant="outline" className="border-primary/40 bg-primary/10 text-primary">
                        <Star className="h-3 w-3" /> VIP
                      </Badge>
                    )}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {deudaSocio > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <span>
                Este socio tiene una deuda pendiente de <strong>{formatCurrency(deudaSocio)}</strong>
              </span>
            </div>
          )}

          {esMiembro && (
            <div className="flex items-center gap-2 rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 text-sm">
              <Crown className="h-4 w-4 text-accent" />
              Socio miembro — se aplica el precio de miembro de cada genética
            </div>
          )}
          {esVip && (
            <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-sm">
              <Star className="h-4 w-4 text-primary" />
              Socio VIP — se aplica el precio VIP de cada genética
            </div>
          )}
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Productos</Label>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => agregarLinea("genetica")}>
                <Plus className="h-3.5 w-3.5" /> Genética
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => agregarLinea("producto")}>
                <Plus className="h-3.5 w-3.5" /> Producto
              </Button>
            </div>
          </div>

          {lineas.map((linea, index) => {
            const calc = calcularLinea(linea)
            return (
              <div key={index} className="space-y-3 rounded-lg border border-border bg-card p-4">
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
                    <div className="space-y-1.5">
                      <Label htmlFor={`genetica-${index}`} className="text-xs">
                        Genética
                      </Label>
                      <Select value={linea.genetica_id} onValueChange={(v) => actualizarLinea(index, "genetica_id", v)}>
                        <SelectTrigger id={`genetica-${index}`} className="w-full">
                          <SelectValue placeholder="Seleccionar genética" />
                        </SelectTrigger>
                        <SelectContent>
                          {geneticasMock.map((g) => (
                            <SelectItem key={g.id} value={g.id}>
                              {g.nombre} - {formatGramos(g.gramos_disponibles)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label htmlFor={`gramos-${index}`} className="flex items-center gap-1 text-xs">
                          <Scale className="h-3 w-3 text-primary" /> Gramos
                        </Label>
                        <Input
                          id={`gramos-${index}`}
                          type="number"
                          step="0.1"
                          min="0"
                          value={linea.gramos || ""}
                          onChange={(e) => actualizarLinea(index, "gramos", e.target.value)}
                          placeholder="0"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor={`enrolados-${index}`} className="flex items-center gap-1 text-xs">
                          <Cigarette className="h-3 w-3 text-accent" /> Enrolados
                        </Label>
                        <Input
                          id={`enrolados-${index}`}
                          type="number"
                          min="0"
                          value={linea.cantidad_enrolados || ""}
                          onChange={(e) => actualizarLinea(index, "cantidad_enrolados", e.target.value)}
                          placeholder="0"
                        />
                      </div>
                    </div>
                    {linea.cantidad_enrolados > 0 && (
                      <div className="space-y-1.5">
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
                        />
                      </div>
                    )}
                    {calc.subtotal > 0 && (
                      <div className="flex items-center justify-between border-t border-border pt-2 text-sm">
                        <span className="text-muted-foreground">Subtotal</span>
                        <span className="font-medium text-foreground">{formatCurrency(calc.subtotal)}</span>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="space-y-1.5">
                      <Label htmlFor={`producto-${index}`} className="text-xs">
                        Producto
                      </Label>
                      <Select value={linea.producto_id} onValueChange={(v) => actualizarLinea(index, "producto_id", v)}>
                        <SelectTrigger id={`producto-${index}`} className="w-full">
                          <SelectValue placeholder="Seleccionar producto" />
                        </SelectTrigger>
                        <SelectContent>
                          {productosMock.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.nombre} - Stock: {p.cantidad} ({formatCurrency(p.precio)})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`cantidad-producto-${index}`} className="text-xs">
                        Cantidad
                      </Label>
                      <Input
                        id={`cantidad-producto-${index}`}
                        type="number"
                        min="1"
                        value={linea.cantidad_producto || ""}
                        onChange={(e) => actualizarLinea(index, "cantidad_producto", e.target.value)}
                        placeholder="1"
                      />
                    </div>
                    {calc.subtotal > 0 && (
                      <div className="flex items-center justify-between border-t border-border pt-2 text-sm">
                        <span className="text-muted-foreground">Subtotal</span>
                        <span className="font-medium text-foreground">{formatCurrency(calc.subtotal)}</span>
                      </div>
                    )}
                  </>
                )}
              </div>
            )
          })}
        </div>

        <div className="space-y-2">
          <Label htmlFor="notas-venta">Notas (opcional)</Label>
          <Textarea id="notas-venta" value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Observaciones..." />
        </div>
      </div>

      {/* Resumen lateral en escritorio, debajo en móvil */}
      <Card className="border-border bg-card shadow-sm lg:sticky lg:top-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShoppingCart className="h-4 w-4 text-primary" />
            Resumen
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Total ({formatGramos(gramosTotalesVenta)})</span>
            <span className="text-2xl font-semibold text-foreground">{formatCurrency(totalVenta)}</span>
          </div>

          <div className="space-y-2 border-t border-border pt-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Pagos recibidos</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="pago-efectivo" className="flex items-center gap-1 text-xs">
                  <Banknote className="h-3 w-3 text-primary" /> Efectivo
                </Label>
                <Input
                  id="pago-efectivo"
                  type="number"
                  min="0"
                  max={totalVenta}
                  value={pago.efectivo || ""}
                  onChange={(e) => setPago({ ...pago, efectivo: Number(e.target.value) || 0 })}
                  placeholder="0"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="pago-transferencia" className="flex items-center gap-1 text-xs">
                  <CreditCard className="h-3 w-3 text-primary" /> Transferencia
                </Label>
                <Input
                  id="pago-transferencia"
                  type="number"
                  min="0"
                  max={totalVenta}
                  value={pago.transferencia || ""}
                  onChange={(e) => setPago({ ...pago, transferencia: Number(e.target.value) || 0 })}
                  placeholder="0"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-border pt-3 text-sm">
            <span className="text-muted-foreground">Pagado</span>
            <span className="font-medium text-primary">{formatCurrency(totalPagado)}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            {saldo > 0 ? (
              <>
                <span className="text-muted-foreground">Saldo pendiente</span>
                <span className="font-medium text-amber-700">{formatCurrency(saldo)}</span>
              </>
            ) : excedente > 0 ? (
              <>
                <span className="text-muted-foreground">Excedente</span>
                <span className="font-medium text-destructive">{formatCurrency(excedente)}</span>
              </>
            ) : (
              <span className="font-medium text-primary">Pagado completo</span>
            )}
          </div>

          {error && (
            <p className="flex items-start gap-2 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {error}
            </p>
          )}

          {success && (
            <p className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/10 p-2 text-sm text-primary">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              Venta simulada registrada. No se guardó ningún dato real.
            </p>
          )}

          <Button type="submit" className="w-full" size="lg" disabled={loading || !socioId}>
            {loading ? "Registrando..." : "Registrar venta"}
          </Button>
          <p className="text-center text-[11px] text-muted-foreground">
            Vista previa: esta acción no escribe en la base de datos.
          </p>
        </CardContent>
      </Card>
    </form>
  )
}
