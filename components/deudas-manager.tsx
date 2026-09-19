"use client"

import React from "react"

import { useState, useEffect, useRef } from "react"
import { createClient } from "@/lib/supabase/client"
import type { Venta, Pago } from "@/lib/types"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  AlertCircle,
  DollarSign,
  CreditCard,
  Banknote,
  ChevronDown,
  Plus,
  History,
  Upload,
  ImageIcon,
  X,
  User,
  Calendar,
  CheckCircle,
} from "lucide-react"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { formatCurrency } from "@/lib/format"

interface VentaConDeuda extends Omit<Venta, "socio"> {
  socio: {
    id: string
    nombre: string
    apellido: string
    dni: string
  }
  pagos: Pago[]
}

export function DeudasManager() {
  const supabase = createClient()
  const [deudas, setDeudas] = useState<VentaConDeuda[]>([])
  const [loading, setLoading] = useState(true)
  const [totalDeuda, setTotalDeuda] = useState(0)
  
  // Dialog para registrar pago
  const [pagoDialogOpen, setPagoDialogOpen] = useState(false)
  const [ventaSeleccionada, setVentaSeleccionada] = useState<VentaConDeuda | null>(null)
  const [montoPago, setMontoPago] = useState("")
  const [metodoPago, setMetodoPago] = useState<"efectivo" | "transferencia">("efectivo")
  const [notasPago, setNotasPago] = useState("")
  const [comprobanteUrl, setComprobanteUrl] = useState("")
  const [comprobantePath, setComprobantePath] = useState("")
  const [uploadingComprobante, setUploadingComprobante] = useState(false)
  const [procesandoPago, setProcesandoPago] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  // Dialog para registrar pago por monto total del socio
  const [pagoSocioDialogOpen, setPagoSocioDialogOpen] = useState(false)
  const [socioPago, setSocioPago] = useState<{
    socio: VentaConDeuda["socio"]
    deudas: VentaConDeuda[]
    totalDeuda: number
  } | null>(null)
  const [montoPagoSocio, setMontoPagoSocio] = useState("")
  const [procesandoPagoSocio, setProcesandoPagoSocio] = useState(false)

  // Dialog para ver historial de pagos
  const [historialDialogOpen, setHistorialDialogOpen] = useState(false)
  const [pagosHistorial, setPagosHistorial] = useState<Pago[]>([])
  
  // Dialog para ver comprobante
  const [comprobanteDialogOpen, setComprobanteDialogOpen] = useState(false)
  const [comprobanteVisualizarUrl, setComprobanteVisualizarUrl] = useState("")

  // Filtro por socio
  const [filtroSocio, setFiltroSocio] = useState("")

  useEffect(() => {
    fetchDeudas()
  }, [])

  const fetchDeudas = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from("ventas")
      .select(`
        *,
        socio:socios(id, nombre, apellido, dni),
        pagos(*)
      `)
      .gt("saldo_pendiente", 0)
      .order("created_at", { ascending: false })

    if (!error && data) {
      setDeudas(data as VentaConDeuda[])
      const total = data.reduce((sum, v) => sum + Number(v.saldo_pendiente || 0), 0)
      setTotalDeuda(total)
    }
    setLoading(false)
  }

  const handleOpenPagoDialog = (venta: VentaConDeuda) => {
    setVentaSeleccionada(venta)
    setMontoPago(venta.saldo_pendiente?.toString() || "")
    setMetodoPago("efectivo")
    setNotasPago("")
    setComprobanteUrl("")
    setComprobantePath("")
    setPagoDialogOpen(true)
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadingComprobante(true)
    
    // Subir a Supabase Storage
    const fileExt = file.name.split('.').pop()
    const fileName = `deuda_${Date.now()}.${fileExt}`
    
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('comprobantes')
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: false
      })
    
    if (uploadError) {
      console.error('Error al subir comprobante:', uploadError)
      setUploadingComprobante(false)
      return
    }
    
    // Obtener URL pública
    const { data: urlData } = supabase.storage
      .from('comprobantes')
      .getPublicUrl(fileName)
    
    setComprobanteUrl(urlData.publicUrl)
    setComprobantePath(fileName)
    setUploadingComprobante(false)
  }

  // Si ya se subió un comprobante a Storage pero la escritura en base de
  // datos falla, borramos el archivo para no dejar comprobantes huérfanos.
  // Best-effort: un fallo acá no debe tapar el error original.
  const limpiarComprobanteHuerfano = async (path: string) => {
    try {
      const { error } = await supabase.storage.from("comprobantes").remove([path])
      if (error) console.error("No se pudo eliminar el comprobante huérfano:", error)
    } catch (e) {
      console.error("No se pudo eliminar el comprobante huérfano:", e)
    }
  }

  // Descarta un comprobante recién subido que todavía no quedó asociado a
  // ningún pago. Limpia el estado visual de inmediato (sin esperar a
  // Storage): si se esperara la respuesta de Storage antes de limpiar
  // comprobanteUrl/comprobantePath, el usuario todavía podría confirmar el
  // pago en esa ventana con una URL que se está borrando en paralelo. El
  // borrado en Storage se dispara best-effort, sin bloquear la UI.
  const descartarComprobantePendiente = () => {
    const pathAEliminar = comprobantePath
    setComprobanteUrl("")
    setComprobantePath("")
    if (pathAEliminar) void limpiarComprobanteHuerfano(pathAEliminar)
  }

  // Cierre controlado de los diálogos de pago: si hay un comprobante
  // pendiente, se descarta. No se permite cerrar (Cancelar, Escape, clic
  // afuera o el botón de cierre, todos pasan por acá vía onOpenChange)
  // mientras se está subiendo un archivo o procesando el pago — en ese
  // último caso porque el comprobante ya viajó como parte de la llamada en
  // curso y borrarlo ahora sería una condición de carrera con la RPC.
  const cerrarPagoDialog = () => {
    if (uploadingComprobante || procesandoPago) return
    descartarComprobantePendiente()
    setPagoDialogOpen(false)
  }

  const cerrarPagoSocioDialog = () => {
    if (uploadingComprobante || procesandoPagoSocio) return
    descartarComprobantePendiente()
    setPagoSocioDialogOpen(false)
  }

  const handleRegistrarPago = async () => {
    if (!ventaSeleccionada || !montoPago || Number(montoPago) <= 0) return

    const montoNum = Number(montoPago)
    if (montoNum > Number(ventaSeleccionada.saldo_pendiente)) {
      alert("El monto no puede ser mayor al saldo pendiente")
      return
    }

    setProcesandoPago(true)

    const { error } = await supabase
      .rpc("registrar_pago_venta", {
        p_venta_id: ventaSeleccionada.id,
        p_monto: montoNum,
        p_metodo_pago: metodoPago,
        p_notas: notasPago || null,
        p_comprobante_url: comprobanteUrl || null,
        p_fecha: new Date().toISOString(),
      })
      .single()

    if (error) {
      descartarComprobantePendiente()
      if (/^VP0\d{2}$/.test(error.code || "")) {
        alert(error.message)
      } else {
        console.error("Error inesperado al registrar el pago:", error)
        alert("Ocurrió un error inesperado al registrar el pago. Intentá nuevamente.")
      }
      setProcesandoPago(false)
      return
    }

    setPagoDialogOpen(false)
    fetchDeudas()
    setProcesandoPago(false)
  }

  const handleOpenPagoSocioDialog = (grupo: {
    socio: VentaConDeuda["socio"]
    deudas: VentaConDeuda[]
    totalDeuda: number
  }) => {
    setSocioPago(grupo)
    setMontoPagoSocio(grupo.totalDeuda.toString())
    setMetodoPago("efectivo")
    setNotasPago("")
    setComprobanteUrl("")
    setComprobantePath("")
    setPagoSocioDialogOpen(true)
  }

  const handleRegistrarPagoSocio = async () => {
    if (!socioPago || !montoPagoSocio || Number(montoPagoSocio) <= 0) return

    const montoNum = Number(montoPagoSocio)
    if (montoNum > socioPago.totalDeuda) {
      alert("El monto no puede ser mayor a la deuda total del socio")
      return
    }

    setProcesandoPagoSocio(true)

    const { error } = await supabase.rpc("registrar_pago_socio", {
      p_socio_id: socioPago.socio.id,
      p_monto: montoNum,
      p_metodo_pago: metodoPago,
      p_notas: notasPago || null,
      p_comprobante_url: comprobanteUrl || null,
      p_fecha: new Date().toISOString(),
    })

    if (error) {
      descartarComprobantePendiente()
      if (/^VP0\d{2}$/.test(error.code || "")) {
        alert(error.message)
      } else {
        console.error("Error inesperado al registrar el pago del socio:", error)
        alert("Ocurrió un error inesperado al registrar el pago. Intentá nuevamente.")
      }
      fetchDeudas()
      setProcesandoPagoSocio(false)
      return
    }

    setPagoSocioDialogOpen(false)
    fetchDeudas()
    setProcesandoPagoSocio(false)
  }

  const handleVerHistorial = async (venta: VentaConDeuda) => {
    setVentaSeleccionada(venta)
    const { data } = await supabase
      .from("pagos")
      .select("*")
      .eq("venta_id", venta.id)
      .order("fecha", { ascending: false })

    setPagosHistorial(data || [])
    setHistorialDialogOpen(true)
  }

  const handleVerComprobante = (url: string) => {
    setComprobanteVisualizarUrl(url)
    setComprobanteDialogOpen(true)
  }

  const deudasFiltradas = deudas.filter((d) => {
    if (!filtroSocio) return true
    const nombreCompleto = `${d.socio?.apellido}, ${d.socio?.nombre}`.toLowerCase()
    const dni = d.socio?.dni || ""
    return nombreCompleto.includes(filtroSocio.toLowerCase()) || dni.includes(filtroSocio)
  })

  // Agrupar deudas por socio
  const deudasPorSocio = deudasFiltradas.reduce((acc, deuda) => {
    const socioId = deuda.socio_id
    if (!acc[socioId]) {
      acc[socioId] = {
        socio: deuda.socio,
        deudas: [],
        totalDeuda: 0,
      }
    }
    acc[socioId].deudas.push(deuda)
    acc[socioId].totalDeuda += Number(deuda.saldo_pendiente || 0)
    return acc
  }, {} as Record<string, { socio: VentaConDeuda["socio"]; deudas: VentaConDeuda[]; totalDeuda: number }>)

  return (
    <div className="min-w-0 space-y-5">
      <div><h1 className="text-[26px] font-semibold">Deudas</h1><p className="text-sm text-muted-foreground">Saldos pendientes y pagos por socio</p></div>
      {/* Resumen */}
      <div className="grid gap-4 md:grid-cols-[2fr_1fr_1fr]">
        <Card className="gap-3 border-amber-200 bg-amber-50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total pendiente</CardTitle>
            <AlertCircle className="h-4 w-4 text-amber-700" />
          </CardHeader>
          <CardContent>
            <div className="break-words text-2xl font-semibold tabular-nums text-amber-900">{loading ? "—" : formatCurrency(totalDeuda)}</div>
          </CardContent>
        </Card>

        <Card className="gap-3 bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{filtroSocio ? "Socios encontrados" : "Socios con deuda"}</CardTitle>
            <User className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="break-words text-2xl font-semibold tabular-nums text-foreground">{loading ? "—" : Object.keys(deudasPorSocio).length}</div>
          </CardContent>
        </Card>

        <Card className="gap-3 bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Ventas pendientes</CardTitle>
            <CreditCard className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="break-words text-2xl font-semibold tabular-nums text-foreground">{loading ? "—" : deudas.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filtro */}
      <Card>
        <CardContent>
          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <Label htmlFor="buscar-deuda" className="mb-2">Buscar socio</Label>
              <Input
                id="buscar-deuda"
                className="bg-white"
                placeholder="Nombre, apellido o DNI..."
                value={filtroSocio}
                onChange={(e) => setFiltroSocio(e.target.value)}
              />
            </div>
            {filtroSocio && (
              <Button variant="ghost" size="icon" aria-label="Limpiar búsqueda" onClick={() => setFiltroSocio("")}>
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Lista de deudas por socio */}
      {loading ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Cargando deudas...
          </CardContent>
        </Card>
      ) : Object.keys(deudasPorSocio).length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <CheckCircle className="h-12 w-12 mx-auto mb-4 text-primary" />
            <p className="text-lg font-medium">{filtroSocio ? "No hay socios que coincidan con la búsqueda" : "No hay deudas pendientes"}</p>
          </CardContent>
        </Card>
      ) : (
        Object.values(deudasPorSocio).map((grupo) => {
          const { socio, deudas: deudasSocio, totalDeuda: totalSocio } = grupo
          return (
          <details key={socio?.id} className="group min-w-0 overflow-hidden rounded-xl border bg-card shadow-sm">
            <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-4 p-5 transition-colors hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden">
              <div className="flex min-w-0 items-center gap-3">
                <div className="rounded-full bg-primary/10 p-2 text-primary"><User className="h-5 w-5" /></div>
                <div className="min-w-0">
                  <h2 className="break-words font-semibold">{socio?.apellido}, {socio?.nombre}</h2>
                  <p className="text-xs text-muted-foreground">DNI: {socio?.dni} · {deudasSocio.length} {deudasSocio.length === 1 ? "venta pendiente" : "ventas pendientes"}</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right"><p className="text-xs text-muted-foreground">Saldo pendiente</p><p className="text-xl font-semibold tabular-nums text-amber-900">{formatCurrency(totalSocio)}</p></div>
                <ChevronDown className="h-5 w-5 shrink-0 text-primary transition-transform group-open:rotate-180" />
              </div>
            </summary>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-primary/5 px-5 py-3">
              <p className="text-sm text-muted-foreground">Ventas pendientes de este socio</p>
              <Button onClick={() => handleOpenPagoSocioDialog(grupo)}><DollarSign className="h-4 w-4" />Pagar deuda del socio</Button>
            </div>
            {/* Desktop/tablet: tabla completa (sin cambios de comportamiento). */}
            <div className="hidden sm:block min-w-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-primary/10">
                    <TableHead>Fecha</TableHead>
                    <TableHead className="text-right">Total venta</TableHead>
                    <TableHead className="text-right">Pagado</TableHead>
                    <TableHead className="text-right">Pendiente</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deudasSocio.map((deuda) => (
                    <TableRow key={deuda.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          {format(new Date(deuda.created_at), "dd/MM/yyyy", { locale: es })}
                        </div>
                        {deuda.notas && (
                          <p className="text-xs text-muted-foreground mt-1 ml-6 italic">{deuda.notas}</p>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatCurrency(Number(deuda.total))}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <span className="text-primary">
                          {formatCurrency(Number(deuda.monto_pagado || 0))}
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-900">
                          {formatCurrency(Number(deuda.saldo_pendiente || 0))}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-2 justify-end">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleVerHistorial(deuda)}
                          >
                            <History className="h-4 w-4 mr-1" />
                            Historial
                          </Button>
                          <Button
                            size="sm"
                            variant="outline" className="border-primary/25 bg-white text-primary hover:bg-primary/10"
                            onClick={() => handleOpenPagoDialog(deuda)}
                          >
                            <Plus className="h-4 w-4 mr-1" />
                            Pagar esta venta
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Mobile (<sm): tarjetas apiladas en vez de la tabla, que en pantallas
                angostas escondía Pendiente y las acciones (Historial/Pagar) fuera de
                vista sin ninguna señal de que había más columnas. */}
            <div className="sm:hidden divide-y divide-border">
              {deudasSocio.map((deuda) => (
                <div key={deuda.id} className="space-y-2 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Calendar className="h-4 w-4 shrink-0" />
                      {format(new Date(deuda.created_at), "dd/MM/yyyy", { locale: es })}
                    </div>
                    <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-900">
                      {formatCurrency(Number(deuda.saldo_pendiente || 0))}
                    </Badge>
                  </div>
                  {deuda.notas && <p className="text-xs italic text-muted-foreground">{deuda.notas}</p>}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                    <span className="text-muted-foreground">
                      Total <span className="font-medium tabular-nums text-foreground">{formatCurrency(Number(deuda.total))}</span>
                    </span>
                    <span className="text-muted-foreground">
                      Pagado <span className="tabular-nums text-primary">{formatCurrency(Number(deuda.monto_pagado || 0))}</span>
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => handleVerHistorial(deuda)}
                    >
                      <History className="h-4 w-4 mr-1" />
                      Historial
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 border-primary/25 bg-white text-primary hover:bg-primary/10"
                      onClick={() => handleOpenPagoDialog(deuda)}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Pagar esta venta
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </details>
          )
        })
      )}

      {/* Dialog Registrar Pago */}
      <Dialog
        open={pagoDialogOpen}
        onOpenChange={(open) => {
          if (open) setPagoDialogOpen(true)
          else cerrarPagoDialog()
        }}
      >
        <DialogContent className="monarca-theme flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[640px]">
          <DialogHeader className="shrink-0 border-b bg-white p-5 pr-12 text-left">
            <DialogTitle>Registrar Pago</DialogTitle>
            <DialogDescription>
              {ventaSeleccionada?.socio?.apellido}, {ventaSeleccionada?.socio?.nombre}
              <br />Saldo pendiente de esta venta: {formatCurrency(Number(ventaSeleccionada?.saldo_pendiente || 0))}
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 space-y-4 overflow-y-auto p-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div>
              <Label className="mb-2">Monto a pagar</Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="number"
                  placeholder="0"
                  value={montoPago}
                  onChange={(e) => setMontoPago(e.target.value)}
                  aria-label="Monto a pagar"
                  className="h-12 bg-white pl-9 text-xl font-semibold tabular-nums"
                />
              </div>
            </div>

            <div>
              <Label>Método de pago</Label>
              <Select
                value={metodoPago}
                disabled={procesandoPago}
                onValueChange={(v) => {
                  const nuevoMetodo = v as "efectivo" | "transferencia"
                  if (nuevoMetodo !== "transferencia" && comprobantePath) {
                    descartarComprobantePendiente()
                  }
                  setMetodoPago(nuevoMetodo)
                }}
              >
                <SelectTrigger aria-label="Método de pago" className="mt-2 w-full bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="monarca-theme">
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

            {metodoPago === "transferencia" && (
              <div>
                <Label>Comprobante (opcional)</Label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  ref={fileInputRef}
                  className="hidden"
                />
                {comprobanteUrl ? (
                  <div className="relative mt-2">
                    <img
                      src={comprobanteUrl || "/placeholder.svg"}
                      alt="Comprobante"
                      className="w-full h-32 object-contain rounded-md border bg-white"
                    />
                    <Button
                      variant="destructive"
                      size="icon"
                      className="absolute top-2 right-2 h-6 w-6"
                      aria-label="Quitar comprobante"
                      onClick={descartarComprobantePendiente}
                      disabled={procesandoPago}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    className="w-full mt-2 border-dashed bg-white"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingComprobante || procesandoPago}
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    {uploadingComprobante ? "Subiendo..." : "Adjuntar comprobante"}
                  </Button>
                )}
              </div>
            )}

            <div>
              <Label>Notas (opcional)</Label>
              <Textarea aria-label="Notas del pago" className="mt-2 bg-white"
                placeholder="Notas adicionales..."
                value={notasPago}
                onChange={(e) => setNotasPago(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter className="shrink-0 border-t bg-white p-4">
            <Button variant="outline" onClick={cerrarPagoDialog} disabled={uploadingComprobante || procesandoPago}>
              Cancelar
            </Button>
            <Button
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={handleRegistrarPago}
              disabled={!montoPago || Number(montoPago) <= 0 || procesandoPago || uploadingComprobante}
            >
              {procesandoPago ? "Procesando..." : "Registrar Pago"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Registrar Pago por monto del socio */}
      <Dialog
        open={pagoSocioDialogOpen}
        onOpenChange={(open) => {
          if (open) setPagoSocioDialogOpen(true)
          else cerrarPagoSocioDialog()
        }}
      >
        <DialogContent className="monarca-theme flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[640px]">
          <DialogHeader className="shrink-0 border-b bg-white p-5 pr-12 text-left">
            <DialogTitle>Pagar deuda del socio</DialogTitle>
            <DialogDescription>
              {socioPago?.socio?.apellido}, {socioPago?.socio?.nombre} — Deuda total: {formatCurrency(Number(socioPago?.totalDeuda || 0))}
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 space-y-4 overflow-y-auto p-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground">
              El monto se aplica automáticamente a los pedidos pendientes, empezando por el más antiguo.
              Los pedidos que queden cubiertos se marcan como pagados.
            </div>

            <div>
              <Label className="mb-2">Monto a pagar</Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="number"
                  placeholder="0"
                  value={montoPagoSocio}
                  onChange={(e) => setMontoPagoSocio(e.target.value)}
                  aria-label="Monto a pagar"
                  className="h-12 bg-white pl-9 text-xl font-semibold tabular-nums"
                />
              </div>
              {socioPago && Number(montoPagoSocio) > socioPago.totalDeuda && (
                <p className="text-xs text-amber-700 mt-1">
                  El monto supera la deuda total ({formatCurrency(socioPago.totalDeuda)}).
                </p>
              )}
            </div>

            <div>
              <Label>Método de pago</Label>
              <Select
                value={metodoPago}
                disabled={procesandoPagoSocio}
                onValueChange={(v) => {
                  const nuevoMetodo = v as "efectivo" | "transferencia"
                  if (nuevoMetodo !== "transferencia" && comprobantePath) {
                    descartarComprobantePendiente()
                  }
                  setMetodoPago(nuevoMetodo)
                }}
              >
                <SelectTrigger aria-label="Método de pago" className="mt-2 w-full bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="monarca-theme">
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

            {metodoPago === "transferencia" && (
              <div>
                <Label>Comprobante (opcional)</Label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  ref={fileInputRef}
                  className="hidden"
                />
                {comprobanteUrl ? (
                  <div className="relative mt-2">
                    <img
                      src={comprobanteUrl || "/placeholder.svg"}
                      alt="Comprobante"
                      className="w-full h-32 object-contain rounded-md border bg-white"
                    />
                    <Button
                      variant="destructive"
                      size="icon"
                      className="absolute top-2 right-2 h-6 w-6"
                      aria-label="Quitar comprobante"
                      onClick={descartarComprobantePendiente}
                      disabled={procesandoPagoSocio}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    className="w-full mt-2 border-dashed bg-white"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingComprobante || procesandoPagoSocio}
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    {uploadingComprobante ? "Subiendo..." : "Adjuntar comprobante"}
                  </Button>
                )}
              </div>
            )}

            <div>
              <Label>Notas (opcional)</Label>
              <Textarea aria-label="Notas del pago" className="mt-2 bg-white"
                placeholder="Notas adicionales..."
                value={notasPago}
                onChange={(e) => setNotasPago(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter className="shrink-0 border-t bg-white p-4">
            <Button
              variant="outline"
              onClick={cerrarPagoSocioDialog}
              disabled={uploadingComprobante || procesandoPagoSocio}
            >
              Cancelar
            </Button>
            <Button
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={handleRegistrarPagoSocio}
              disabled={
                procesandoPagoSocio ||
                uploadingComprobante ||
                !montoPagoSocio ||
                Number(montoPagoSocio) <= 0 ||
                (socioPago ? Number(montoPagoSocio) > socioPago.totalDeuda : false)
              }
            >
              {procesandoPagoSocio ? "Procesando..." : "Registrar Pago"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Historial de Pagos */}
      <Dialog open={historialDialogOpen} onOpenChange={setHistorialDialogOpen}>
        <DialogContent className="monarca-theme max-h-[90dvh] overflow-y-auto sm:max-w-[680px]">
          <DialogHeader>
            <DialogTitle>Historial de Pagos</DialogTitle>
            <DialogDescription>
              Venta del {ventaSeleccionada && format(new Date(ventaSeleccionada.created_at), "dd/MM/yyyy", { locale: es })} - Total: {formatCurrency(Number(ventaSeleccionada?.total || 0))}
            </DialogDescription>
          </DialogHeader>

          {pagosHistorial.length === 0 ? (
            <p className="text-center text-muted-foreground py-4">No hay pagos registrados</p>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {pagosHistorial.map((pago) => (
                <div key={pago.id} className="flex flex-wrap items-center justify-between gap-3 border bg-white p-3 rounded-lg">
                  <div className="flex items-center gap-3">
                    {pago.metodo_pago === "efectivo" ? (
                      <Banknote className="h-5 w-5 text-primary" />
                    ) : (
                      <CreditCard className="h-5 w-5 text-primary" />
                    )}
                    <div>
                      <p className="font-medium">{formatCurrency(Number(pago.monto))}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(pago.fecha), "dd/MM/yyyy HH:mm", { locale: es })}
                      </p>
                      {pago.notas && (
                        <p className="text-xs text-muted-foreground mt-1">{pago.notas}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={pago.metodo_pago === "efectivo" ? "default" : "secondary"}>
                      {pago.metodo_pago === "efectivo" ? "Efectivo" : "Transferencia"}
                    </Badge>
                    {pago.comprobante_url && (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Ver comprobante"
                        title="Ver comprobante"
                        onClick={() => handleVerComprobante(pago.comprobante_url!)}
                      >
                        <ImageIcon className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setHistorialDialogOpen(false)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Ver Comprobante */}
      <Dialog open={comprobanteDialogOpen} onOpenChange={setComprobanteDialogOpen}>
        <DialogContent className="monarca-theme max-h-[90dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Comprobante de Transferencia</DialogTitle>
          </DialogHeader>
          {comprobanteVisualizarUrl && (
            <img
              src={comprobanteVisualizarUrl || "/placeholder.svg"}
              alt="Comprobante"
              className="w-full max-h-[70vh] object-contain rounded-md"
            />
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setComprobanteDialogOpen(false)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
