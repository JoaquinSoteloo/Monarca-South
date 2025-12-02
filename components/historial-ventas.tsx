"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import type { Venta } from "@/lib/types"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  CalendarIcon,
  TrendingUp,
  Package,
  DollarSign,
  FileDown,
  Clock,
  Banknote,
  CreditCard,
  Check,
  Filter,
} from "lucide-react"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { cn } from "@/lib/utils"
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useRouter } from "next/navigation"

export function HistorialVentas() {
  const [ventas, setVentas] = useState<Venta[]>([])
  const [loading, setLoading] = useState(false)
  const [fechaDesde, setFechaDesde] = useState<Date | undefined>(undefined)
  const [fechaHasta, setFechaHasta] = useState<Date | undefined>(undefined)
  const [exportando, setExportando] = useState(false)
  const [popoverDesdeOpen, setPopoverDesdeOpen] = useState(false)
  const [popoverHastaOpen, setPopoverHastaOpen] = useState(false)
  const [editingVenta, setEditingVenta] = useState<Venta | null>(null)
  const [nuevoMetodoPago, setNuevoMetodoPago] = useState<"efectivo" | "transferencia">("efectivo")
  const [updatingPago, setUpdatingPago] = useState(false)
  const [soloNoPagados, setSoloNoPagados] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const hoy = new Date()
    const hace30Dias = new Date()
    hace30Dias.setDate(hoy.getDate() - 30)

    setFechaHasta(hoy)
    setFechaDesde(hace30Dias)
  }, [])

  const buscarVentas = async () => {
    if (!fechaDesde || !fechaHasta) return

    setLoading(true)
    const supabase = createClient()

    const desdeStr = format(fechaDesde, "yyyy-MM-dd")
    const hastaStr = format(fechaHasta, "yyyy-MM-dd")

    const { data, error } = await supabase
      .from("ventas")
      .select("*, socio:socios(nombre, apellido, dni), genetica:geneticas(nombre)")
      .gte("created_at", `${desdeStr}T00:00:00`)
      .lte("created_at", `${hastaStr}T23:59:59`)
      .order("created_at", { ascending: false })

    if (!error && data) {
      setVentas(data)
    }
    setLoading(false)
  }

  useEffect(() => {
    if (fechaDesde && fechaHasta) {
      buscarVentas()
    }
  }, [fechaDesde, fechaHasta])

  const handleUpdateMetodoPago = async () => {
    if (!editingVenta) return

    setUpdatingPago(true)
    const supabase = createClient()

    const { error } = await supabase.from("ventas").update({ metodo_pago: nuevoMetodoPago }).eq("id", editingVenta.id)

    if (!error) {
      setVentas(ventas.map((v) => (v.id === editingVenta.id ? { ...v, metodo_pago: nuevoMetodoPago } : v)))
      setEditingVenta(null)
      router.refresh()
    }
    setUpdatingPago(false)
  }

  const ventasFiltradas = soloNoPagados ? ventas.filter((v) => v.metodo_pago === "pendiente") : ventas

  const totalVentas = ventasFiltradas.reduce((sum, v) => sum + Number(v.total), 0)
  const totalGramos = ventasFiltradas.reduce((sum, v) => sum + Number(v.gramos), 0)
  const ventasEfectivo = ventas.filter((v) => v.metodo_pago === "efectivo").reduce((sum, v) => sum + Number(v.total), 0)
  const ventasTransferencia = ventas
    .filter((v) => v.metodo_pago === "transferencia")
    .reduce((sum, v) => sum + Number(v.total), 0)
  const ventasPendientes = ventas
    .filter((v) => v.metodo_pago === "pendiente")
    .reduce((sum, v) => sum + Number(v.total), 0)

  const exportarPDF = async () => {
    if (!fechaDesde || !fechaHasta) return
    setExportando(true)

    try {
      const doc = new jsPDF()

      const logoImg = new Image()
      logoImg.crossOrigin = "anonymous"
      logoImg.src = "/logo-monarca.png"

      await new Promise((resolve, reject) => {
        logoImg.onload = resolve
        logoImg.onerror = reject
      })

      const logoWidth = 40
      const logoHeight = 40
      const pageWidth = doc.internal.pageSize.getWidth()
      doc.addImage(logoImg, "PNG", (pageWidth - logoWidth) / 2, 10, logoWidth, logoHeight)

      doc.setFontSize(20)
      doc.setTextColor(34, 87, 49)
      doc.text("MONARCA SOUTH", pageWidth / 2, 58, { align: "center" })

      doc.setFontSize(14)
      doc.setTextColor(100)
      doc.text("Reporte de Ventas", pageWidth / 2, 66, { align: "center" })

      const desdeStr = format(fechaDesde, "dd/MM/yyyy")
      const hastaStr = format(fechaHasta, "dd/MM/yyyy")
      doc.setFontSize(10)
      doc.text(`Período: ${desdeStr} al ${hastaStr}`, pageWidth / 2, 74, { align: "center" })

      doc.setFontSize(12)
      doc.setTextColor(0)
      doc.text("Resumen del Período", 14, 88)

      doc.setFontSize(10)
      doc.text(`Total Ventas: $${totalVentas.toFixed(2)}`, 14, 96)
      doc.text(`Total Gramos: ${totalGramos.toFixed(1)}g`, 14, 102)
      doc.text(`Transacciones: ${ventasFiltradas.length}`, 14, 108)
      doc.text(`Efectivo: $${ventasEfectivo.toFixed(2)}`, 100, 96)
      doc.text(`Transferencia: $${ventasTransferencia.toFixed(2)}`, 100, 102)
      doc.text(`Pendiente: $${ventasPendientes.toFixed(2)}`, 100, 108)

      const tableData = ventasFiltradas.map((venta) => [
        new Date(venta.created_at).toLocaleDateString("es-AR"),
        `${venta.socio?.apellido}, ${venta.socio?.nombre}`,
        venta.genetica?.nombre || "",
        `${venta.gramos}g`,
        `$${venta.precio_unitario}`,
        venta.metodo_pago === "efectivo"
          ? "Efectivo"
          : venta.metodo_pago === "transferencia"
            ? "Transferencia"
            : "Pendiente",
        `$${Number(venta.total).toFixed(2)}`,
      ])

      autoTable(doc, {
        startY: 118,
        head: [["Fecha", "Socio", "Genética", "Cantidad", "Precio/g", "Pago", "Total"]],
        body: tableData,
        theme: "striped",
        headStyles: {
          fillColor: [34, 87, 49],
          textColor: 255,
          fontStyle: "bold",
        },
        alternateRowStyles: {
          fillColor: [245, 245, 245],
        },
        styles: {
          fontSize: 8,
          cellPadding: 3,
        },
        columnStyles: {
          0: { cellWidth: 22 },
          3: { halign: "right" },
          4: { halign: "right" },
          6: { halign: "right", fontStyle: "bold" },
        },
      })

      const pageCount = doc.internal.pages.length - 1
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i)
        doc.setFontSize(8)
        doc.setTextColor(150)
        doc.text(
          `Generado el ${new Date().toLocaleString("es-AR")} - Página ${i} de ${pageCount}`,
          pageWidth / 2,
          doc.internal.pageSize.getHeight() - 10,
          { align: "center" },
        )
      }

      const desdeFile = format(fechaDesde, "yyyy-MM-dd")
      const hastaFile = format(fechaHasta, "yyyy-MM-dd")
      doc.save(`reporte-ventas-${desdeFile}-${hastaFile}.pdf`)
    } catch (error) {
      console.error("Error al exportar PDF:", error)
    }

    setExportando(false)
  }

  return (
    <div className="space-y-6">
      <Dialog open={!!editingVenta} onOpenChange={(open) => !open && setEditingVenta(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
                <Check className="h-6 w-6 text-emerald-600" />
              </div>
              <div>
                <DialogTitle className="text-foreground">Confirmar Pago</DialogTitle>
                <DialogDescription className="text-muted-foreground">Registrar el pago de esta venta</DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="py-4">
            {editingVenta && (
              <div className="space-y-4">
                <div className="bg-muted/50 rounded-lg p-3 space-y-1">
                  <p className="text-sm text-muted-foreground">
                    Socio:{" "}
                    <strong className="text-foreground">
                      {editingVenta.socio?.apellido}, {editingVenta.socio?.nombre}
                    </strong>
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Total: <strong className="text-emerald-600">${Number(editingVenta.total).toFixed(2)}</strong>
                  </p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Método de pago</label>
                  <Select
                    value={nuevoMetodoPago}
                    onValueChange={(value: "efectivo" | "transferencia") => setNuevoMetodoPago(value)}
                  >
                    <SelectTrigger className="bg-background border-border">
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
              </div>
            )}
          </div>
          <DialogFooter className="flex gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setEditingVenta(null)} className="border-border">
              Cancelar
            </Button>
            <Button
              onClick={handleUpdateMetodoPago}
              disabled={updatingPago}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {updatingPago ? "Guardando..." : "Confirmar Pago"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <CalendarIcon className="h-5 w-5 text-emerald-600" />
            Filtrar por Período
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4 items-end">
            <div className="flex-1 space-y-2">
              <label className="text-sm font-medium text-foreground">Desde</label>
              <Popover open={popoverDesdeOpen} onOpenChange={setPopoverDesdeOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal border-emerald-200 hover:border-emerald-400 hover:bg-emerald-50/50",
                      !fechaDesde && "text-muted-foreground",
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4 text-emerald-600" />
                    {fechaDesde ? (
                      format(fechaDesde, "dd 'de' MMMM, yyyy", { locale: es })
                    ) : (
                      <span>Seleccionar fecha</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 border-emerald-200" align="start">
                  <Calendar
                    mode="single"
                    selected={fechaDesde}
                    onSelect={(date) => {
                      setFechaDesde(date)
                      setPopoverDesdeOpen(false)
                    }}
                    locale={es}
                    className="rounded-md"
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="flex-1 space-y-2">
              <label className="text-sm font-medium text-foreground">Hasta</label>
              <Popover open={popoverHastaOpen} onOpenChange={setPopoverHastaOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal border-emerald-200 hover:border-emerald-400 hover:bg-emerald-50/50",
                      !fechaHasta && "text-muted-foreground",
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4 text-emerald-600" />
                    {fechaHasta ? (
                      format(fechaHasta, "dd 'de' MMMM, yyyy", { locale: es })
                    ) : (
                      <span>Seleccionar fecha</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 border-emerald-200" align="start">
                  <Calendar
                    mode="single"
                    selected={fechaHasta}
                    onSelect={(date) => {
                      setFechaHasta(date)
                      setPopoverHastaOpen(false)
                    }}
                    locale={es}
                    className="rounded-md"
                  />
                </PopoverContent>
              </Popover>
            </div>

            <Button
              onClick={() => setSoloNoPagados(!soloNoPagados)}
              variant={soloNoPagados ? "default" : "outline"}
              className={cn(
                soloNoPagados
                  ? "bg-red-600 hover:bg-red-700 text-white"
                  : "border-red-300 text-red-600 hover:bg-red-50",
              )}
            >
              <Filter className="h-4 w-4 mr-2" />
              {soloNoPagados ? "Mostrando Pendientes" : "Ver Pendientes"}
            </Button>

            <Button onClick={buscarVentas} className="bg-emerald-600 hover:bg-emerald-700" disabled={loading}>
              <FileDown className="h-4 w-4 mr-2" />
              {loading ? "Buscando..." : "Buscar"}
            </Button>
            <Button
              onClick={exportarPDF}
              variant="outline"
              className="border-emerald-600 text-emerald-600 hover:bg-emerald-50 bg-transparent"
              disabled={exportando || ventas.length === 0}
            >
              <FileDown className="h-4 w-4 mr-2" />
              {exportando ? "Exportando..." : "Exportar PDF"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-5">
        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Ventas</CardTitle>
            <DollarSign className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">${totalVentas.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">{ventasFiltradas.length} transacciones</p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Gramos</CardTitle>
            <Package className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{totalGramos.toFixed(1)}g</div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Efectivo</CardTitle>
            <Banknote className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">${ventasEfectivo.toFixed(2)}</div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Transferencia</CardTitle>
            <CreditCard className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">${ventasTransferencia.toFixed(2)}</div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border border-red-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-red-600">Pendiente</CardTitle>
            <Clock className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">${ventasPendientes.toFixed(2)}</div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <TrendingUp className="h-5 w-5 text-emerald-600" />
            Detalle de Ventas
            {soloNoPagados && (
              <Badge variant="outline" className="ml-2 bg-red-100 text-red-700 border-red-200">
                Solo Pendientes
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {ventasFiltradas.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              {loading
                ? "Cargando ventas..."
                : soloNoPagados
                  ? "No hay ventas pendientes de pago"
                  : "No hay ventas en el período seleccionado"}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border">
                    <TableHead className="text-muted-foreground">Fecha</TableHead>
                    <TableHead className="text-muted-foreground">Socio</TableHead>
                    <TableHead className="text-muted-foreground">DNI</TableHead>
                    <TableHead className="text-muted-foreground">Genética</TableHead>
                    <TableHead className="text-muted-foreground text-right">Cantidad</TableHead>
                    <TableHead className="text-muted-foreground text-right">Precio/g</TableHead>
                    <TableHead className="text-muted-foreground">Pago</TableHead>
                    <TableHead className="text-muted-foreground text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ventasFiltradas.map((venta) => (
                    <TableRow key={venta.id} className="border-border">
                      <TableCell className="text-muted-foreground text-sm">
                        {new Date(venta.created_at).toLocaleDateString("es-AR", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </TableCell>
                      <TableCell className="text-foreground font-medium">
                        {venta.socio?.apellido}, {venta.socio?.nombre}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{venta.socio?.dni}</TableCell>
                      <TableCell className="text-foreground">{venta.genetica?.nombre}</TableCell>
                      <TableCell className="text-right text-foreground">{venta.gramos}g</TableCell>
                      <TableCell className="text-right text-muted-foreground">${venta.precio_unitario}</TableCell>
                      <TableCell>
                        {venta.metodo_pago === "pendiente" ? (
                          <Badge
                            variant="outline"
                            className="bg-red-100 text-red-700 border-red-200 cursor-pointer hover:bg-red-200"
                            onClick={() => {
                              setEditingVenta(venta)
                              setNuevoMetodoPago("efectivo")
                            }}
                          >
                            <Clock className="h-3 w-3 mr-1" />
                            Pendiente
                          </Badge>
                        ) : venta.metodo_pago === "efectivo" ? (
                          <Badge variant="outline" className="bg-emerald-100 text-emerald-700 border-emerald-200">
                            <Banknote className="h-3 w-3 mr-1" />
                            Efectivo
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-blue-100 text-blue-700 border-blue-200">
                            <CreditCard className="h-3 w-3 mr-1" />
                            Transferencia
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-bold text-emerald-600">
                        ${Number(venta.total).toFixed(2)}
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
