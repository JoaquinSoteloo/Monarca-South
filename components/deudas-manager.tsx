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
  Eye,
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
  const [uploadingComprobante, setUploadingComprobante] = useState(false)
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
    setUploadingComprobante(false)
  }

  const handleRegistrarPago = async () => {
    if (!ventaSeleccionada || !montoPago || Number(montoPago) <= 0) return
    
    const montoNum = Number(montoPago)
    if (montoNum > Number(ventaSeleccionada.saldo_pendiente)) {
      alert("El monto no puede ser mayor al saldo pendiente")
      return
    }

    // Insertar el pago
    const { error: pagoError } = await supabase
      .from("pagos")
      .insert({
        venta_id: ventaSeleccionada.id,
        monto: montoNum,
        metodo_pago: metodoPago,
        comprobante_url: comprobanteUrl || null,
        notas: notasPago || null,
        fecha: new Date().toISOString(),
      })

    if (pagoError) {
      alert("Error al registrar el pago: " + pagoError.message)
      return
    }

    // Actualizar la venta
    const nuevoSaldo = Number(ventaSeleccionada.saldo_pendiente) - montoNum
    const nuevoMontoPagado = Number(ventaSeleccionada.monto_pagado || 0) + montoNum
    const nuevoMetodoPago = nuevoSaldo <= 0 ? metodoPago : "pendiente"

    const { error: ventaError } = await supabase
      .from("ventas")
      .update({
        saldo_pendiente: nuevoSaldo,
        monto_pagado: nuevoMontoPagado,
        metodo_pago: nuevoMetodoPago,
      })
      .eq("id", ventaSeleccionada.id)

    if (ventaError) {
      alert("Error al actualizar la venta: " + ventaError.message)
      return
    }

    setPagoDialogOpen(false)
    fetchDeudas()
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

    // Aplicar el monto a los pedidos pendientes del socio, del más antiguo al más nuevo
    const ventasOrdenadas = [...socioPago.deudas].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    )

    const fecha = new Date().toISOString()
    let restante = montoNum

    for (const venta of ventasOrdenadas) {
      if (restante <= 0) break

      const saldo = Number(venta.saldo_pendiente || 0)
      if (saldo <= 0) continue

      const aplicar = Math.min(restante, saldo)

      const { error: pagoError } = await supabase.from("pagos").insert({
        venta_id: venta.id,
        monto: aplicar,
        metodo_pago: metodoPago,
        comprobante_url: comprobanteUrl || null,
        notas: notasPago || "Pago aplicado a cuenta del socio",
        fecha,
      })

      if (pagoError) {
        alert("Error al registrar el pago: " + pagoError.message)
        setProcesandoPagoSocio(false)
        fetchDeudas()
        return
      }

      const nuevoSaldo = saldo - aplicar
      const nuevoMontoPagado = Number(venta.monto_pagado || 0) + aplicar
      const nuevoMetodoPago = nuevoSaldo <= 0 ? metodoPago : "pendiente"

      const { error: ventaError } = await supabase
        .from("ventas")
        .update({
          saldo_pendiente: nuevoSaldo,
          monto_pagado: nuevoMontoPagado,
          metodo_pago: nuevoMetodoPago,
        })
        .eq("id", venta.id)

      if (ventaError) {
        alert("Error al actualizar la venta: " + ventaError.message)
        setProcesandoPagoSocio(false)
        fetchDeudas()
        return
      }

      restante -= aplicar
    }

    setProcesandoPagoSocio(false)
    setPagoSocioDialogOpen(false)
    fetchDeudas()
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
    <div className="space-y-6">
      {/* Resumen */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-gradient-to-br from-red-50 to-white border-red-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Deudas</CardTitle>
            <AlertCircle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-700">${totalDeuda.toLocaleString()}</div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-amber-50 to-white border-amber-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Socios con Deuda</CardTitle>
            <User className="h-4 w-4 text-amber-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-700">{Object.keys(deudasPorSocio).length}</div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-blue-50 to-white border-blue-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Ventas Pendientes</CardTitle>
            <CreditCard className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-700">{deudas.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filtro */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <Label>Buscar socio</Label>
              <Input
                placeholder="Nombre, apellido o DNI..."
                value={filtroSocio}
                onChange={(e) => setFiltroSocio(e.target.value)}
              />
            </div>
            {filtroSocio && (
              <Button variant="ghost" size="icon" onClick={() => setFiltroSocio("")}>
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
            <CheckCircle className="h-12 w-12 mx-auto mb-4 text-emerald-500" />
            <p className="text-lg font-medium">No hay deudas pendientes</p>
          </CardContent>
        </Card>
      ) : (
        Object.values(deudasPorSocio).map((grupo) => {
          const { socio, deudas: deudasSocio, totalDeuda: totalSocio } = grupo
          return (
          <Card key={socio?.id} className="overflow-hidden">
            <CardHeader className="bg-muted/30">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <User className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <CardTitle className="text-lg">
                      {socio?.apellido}, {socio?.nombre}
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">DNI: {socio?.dni}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">Deuda total</p>
                    <p className="text-xl font-bold text-red-600">${totalSocio.toLocaleString()}</p>
                  </div>
                  <Button
                    className="bg-emerald-600 hover:bg-emerald-700"
                    onClick={() => handleOpenPagoSocioDialog(grupo)}
                  >
                    <DollarSign className="h-4 w-4 mr-1" />
                    Pagar deuda
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/20">
                    <TableHead>Fecha</TableHead>
                    <TableHead>Total Venta</TableHead>
                    <TableHead>Pagado</TableHead>
                    <TableHead>Pendiente</TableHead>
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
                      <TableCell className="font-medium">
                        ${Number(deuda.total).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <span className="text-emerald-600">
                          ${Number(deuda.monto_pagado || 0).toLocaleString()}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="destructive">
                          ${Number(deuda.saldo_pendiente || 0).toLocaleString()}
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
                            className="bg-emerald-600 hover:bg-emerald-700"
                            onClick={() => handleOpenPagoDialog(deuda)}
                          >
                            <Plus className="h-4 w-4 mr-1" />
                            Registrar Pago
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          )
        })
      )}

      {/* Dialog Registrar Pago */}
      <Dialog open={pagoDialogOpen} onOpenChange={setPagoDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar Pago</DialogTitle>
            <DialogDescription>
              Saldo pendiente: ${Number(ventaSeleccionada?.saldo_pendiente || 0).toLocaleString()}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Monto a pagar</Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="number"
                  placeholder="0"
                  value={montoPago}
                  onChange={(e) => setMontoPago(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            <div>
              <Label>Método de pago</Label>
              <Select value={metodoPago} onValueChange={(v) => setMetodoPago(v as "efectivo" | "transferencia")}>
                <SelectTrigger>
                  <SelectValue />
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
                      className="w-full h-32 object-cover rounded-md border"
                    />
                    <Button
                      variant="destructive"
                      size="icon"
                      className="absolute top-2 right-2 h-6 w-6"
                      onClick={() => setComprobanteUrl("")}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    className="w-full mt-2 bg-transparent"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingComprobante}
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    {uploadingComprobante ? "Subiendo..." : "Adjuntar comprobante"}
                  </Button>
                )}
              </div>
            )}

            <div>
              <Label>Notas (opcional)</Label>
              <Textarea
                placeholder="Notas adicionales..."
                value={notasPago}
                onChange={(e) => setNotasPago(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPagoDialogOpen(false)}>
              Cancelar
            </Button>
            <Button 
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={handleRegistrarPago}
              disabled={!montoPago || Number(montoPago) <= 0}
            >
              Registrar Pago
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Registrar Pago por monto del socio */}
      <Dialog open={pagoSocioDialogOpen} onOpenChange={setPagoSocioDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Pagar deuda del socio</DialogTitle>
            <DialogDescription>
              {socioPago?.socio?.apellido}, {socioPago?.socio?.nombre} — Deuda total: $
              {Number(socioPago?.totalDeuda || 0).toLocaleString()}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground">
              El monto se aplica automáticamente a los pedidos pendientes, empezando por el más antiguo.
              Los pedidos que queden cubiertos se marcan como pagados.
            </div>

            <div>
              <Label>Monto a pagar</Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="number"
                  placeholder="0"
                  value={montoPagoSocio}
                  onChange={(e) => setMontoPagoSocio(e.target.value)}
                  className="pl-9"
                />
              </div>
              {socioPago && Number(montoPagoSocio) > socioPago.totalDeuda && (
                <p className="text-xs text-red-600 mt-1">
                  El monto supera la deuda total (${socioPago.totalDeuda.toLocaleString()}).
                </p>
              )}
            </div>

            <div>
              <Label>Método de pago</Label>
              <Select value={metodoPago} onValueChange={(v) => setMetodoPago(v as "efectivo" | "transferencia")}>
                <SelectTrigger>
                  <SelectValue />
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
                      className="w-full h-32 object-cover rounded-md border"
                    />
                    <Button
                      variant="destructive"
                      size="icon"
                      className="absolute top-2 right-2 h-6 w-6"
                      onClick={() => setComprobanteUrl("")}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    className="w-full mt-2 bg-transparent"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingComprobante}
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    {uploadingComprobante ? "Subiendo..." : "Adjuntar comprobante"}
                  </Button>
                )}
              </div>
            )}

            <div>
              <Label>Notas (opcional)</Label>
              <Textarea
                placeholder="Notas adicionales..."
                value={notasPago}
                onChange={(e) => setNotasPago(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPagoSocioDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={handleRegistrarPagoSocio}
              disabled={
                procesandoPagoSocio ||
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
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Historial de Pagos</DialogTitle>
            <DialogDescription>
              Venta del {ventaSeleccionada && format(new Date(ventaSeleccionada.created_at), "dd/MM/yyyy", { locale: es })} - Total: ${Number(ventaSeleccionada?.total || 0).toLocaleString()}
            </DialogDescription>
          </DialogHeader>

          {pagosHistorial.length === 0 ? (
            <p className="text-center text-muted-foreground py-4">No hay pagos registrados</p>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {pagosHistorial.map((pago) => (
                <div key={pago.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                  <div className="flex items-center gap-3">
                    {pago.metodo_pago === "efectivo" ? (
                      <Banknote className="h-5 w-5 text-emerald-600" />
                    ) : (
                      <CreditCard className="h-5 w-5 text-blue-600" />
                    )}
                    <div>
                      <p className="font-medium">${Number(pago.monto).toLocaleString()}</p>
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
        <DialogContent className="sm:max-w-xl">
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
