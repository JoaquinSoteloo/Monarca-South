"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import type { Venta, DetalleVenta } from "@/lib/types"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  CalendarIcon,
  Package,
  DollarSign,
  FileDown,
  Clock,
  Banknote,
  CreditCard,
  Check,
  Filter,
  ChevronDown,
  ChevronRight,
  Cigarette,
  Scale,
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

interface VentaConDetalles extends Venta {
  detalles?: DetalleVenta[]
}

export function HistorialVentas() {
  const [ventas, setVentas] = useState<VentaConDetalles[]>([])
  const [loading, setLoading] = useState(false)
  const [fechaDesde, setFechaDesde] = useState<Date | undefined>(undefined)
  const [fechaHasta, setFechaHasta] = useState<Date | undefined>(undefined)
  const [exportando, setExportando] = useState(false)
  const [popoverDesdeOpen, setPopoverDesdeOpen] = useState(false)
  const [popoverHastaOpen, setPopoverHastaOpen] = useState(false)
  const [editingVenta, setEditingVenta] = useState<VentaConDetalles | null>(null)
  const [nuevoMetodoPago, setNuevoMetodoPago] = useState<"efectivo" | "transferencia">("efectivo")
  const [updatingPago, setUpdatingPago] = useState(false)
  const [soloNoPagados, setSoloNoPagados] = useState(false)
  const [expandedVentas, setExpandedVentas] = useState<Set<number>>(new Set())
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
      .select(
        "*, socio:socios(nombre, apellido, dni), genetica:geneticas(nombre, precio_por_gramo, precio_por_enrolado), detalles:detalle_venta(id, gramos, cantidad_enrolados, peso_por_enrolado, peso_enrolados, precio_unitario, precio_enrolado, subtotal, genetica:geneticas(nombre, precio_por_gramo, precio_por_enrolado))",
      )
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

  const toggleExpand = (ventaId: number) => {
    const newExpanded = new Set(expandedVentas)
    if (newExpanded.has(ventaId)) {
      newExpanded.delete(ventaId)
    } else {
      newExpanded.add(ventaId)
    }
    setExpandedVentas(newExpanded)
  }

  const getVentaInfo = (venta: VentaConDetalles) => {
    if (venta.detalles && venta.detalles.length > 0) {
      const geneticas = venta.detalles.map((d) => d.genetica?.nombre).filter(Boolean)
      const geneticasUnicas = [...new Set(geneticas)]
      const totalGramosSueltos = venta.detalles.reduce((sum, d) => sum + (d.gramos || 0), 0)
      const totalEnrolados = venta.detalles.reduce((sum, d) => sum + (d.cantidad_enrolados || 0), 0)
      const totalPesoEnrolados = venta.detalles.reduce((sum, d) => sum + (d.peso_enrolados || 0), 0)
      const totalGramos = totalGramosSueltos + totalPesoEnrolados
      return {
        genetica: geneticasUnicas.length > 1 ? `${geneticasUnicas.length} genéticas` : geneticasUnicas[0] || "-",
        esMultiple: geneticasUnicas.length > 1,
        gramos: totalGramos,
        enrolados: totalEnrolados,
        tieneDetalle: true,
      }
    }
    const gramosSueltos = Number(venta.gramos) || 0
    const pesoEnrolados = Number(venta.peso_enrolados) || 0
    const totalGramos = gramosSueltos + pesoEnrolados
    return {
      genetica: venta.genetica?.nombre || "-",
      esMultiple: false,
      gramos: totalGramos,
      enrolados: venta.cantidad_enrolados || 0,
      tieneDetalle: (venta.cantidad_enrolados || 0) > 0 || (Number(venta.gramos) || 0) > 0,
    }
  }

  const ventasFiltradas = soloNoPagados ? ventas.filter((v) => v.metodo_pago === "pendiente") : ventas

  const totalVentas = ventasFiltradas.reduce((sum, v) => sum + Number(v.total), 0)
  const totalGramos = ventasFiltradas.reduce((sum, v) => {
    const info = getVentaInfo(v)
    return sum + info.gramos
  }, 0)
  const ventasEfectivo = ventas.filter((v) => v.metodo_pago === "efectivo").reduce((sum, v) => sum + Number(v.total), 0)
  const ventasTransferencia = ventas
    .filter((v) => v.metodo_pago === "transferencia")
    .reduce((sum, v) => sum + Number(v.total), 0)
  const ventasPendientes = ventas
    .filter((v) => v.metodo_pago === "pendiente")
    .reduce((sum, v) => sum + Number(v.total), 0)

  const formatDni = (dni: string) => {
    const cleaned = dni.replace(/\D/g, "")
    if (cleaned.length <= 6) return cleaned
    if (cleaned.length === 7) {
      return `${cleaned.slice(0, 1)}.${cleaned.slice(1, 4)}.${cleaned.slice(4)}`
    }
    return `${cleaned.slice(0, 2)}.${cleaned.slice(2, 5)}.${cleaned.slice(5, 8)}`
  }

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

      const tableData: string[][] = []
      ventasFiltradas.forEach((venta) => {
        const info = getVentaInfo(venta)
        if (venta.detalles && venta.detalles.length > 0) {
          venta.detalles.forEach((detalle, idx) => {
            const gramosStr = detalle.gramos ? `${detalle.gramos}g x $${detalle.genetica?.precio_por_gramo || 0}/g` : ""
            const enroladosStr = detalle.cantidad_enrolados
              ? `${detalle.cantidad_enrolados} enr. x $${detalle.genetica?.precio_por_enrolado || 0}`
              : ""
            const cantidadStr = [gramosStr, enroladosStr].filter(Boolean).join(" + ")
            tableData.push([
              idx === 0 ? new Date(venta.created_at).toLocaleDateString("es-AR") : "",
              idx === 0 ? `${venta.socio?.apellido}, ${venta.socio?.nombre}` : "",
              detalle.genetica?.nombre || "",
              cantidadStr,
              idx === 0
                ? venta.metodo_pago === "efectivo"
                  ? "Efectivo"
                  : venta.metodo_pago === "transferencia"
                    ? "Transferencia"
                    : "Pendiente"
                : "",
              idx === 0 ? `$${Number(venta.total).toFixed(2)}` : "",
            ])
          })
        } else {
          const gramosStr = info.gramos ? `${info.gramos}g x $${venta.precio_unitario}/g` : ""
          const enroladosStr = info.enrolados
            ? `${info.enrolados} enr. x $${venta.genetica?.precio_por_enrolado || 0}`
            : ""
          const cantidadStr = [gramosStr, enroladosStr].filter(Boolean).join(" + ")
          tableData.push([
            new Date(venta.created_at).toLocaleDateString("es-AR"),
            `${venta.socio?.apellido}, ${venta.socio?.nombre}`,
            info.genetica,
            cantidadStr,
            venta.metodo_pago === "efectivo"
              ? "Efectivo"
              : venta.metodo_pago === "transferencia"
                ? "Transferencia"
                : "Pendiente",
            `$${Number(venta.total).toFixed(2)}`,
          ])
        }
      })

      autoTable(doc, {
        startY: 118,
        head: [["Fecha", "Socio", "Genética", "Detalle", "Pago", "Total"]],
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
          5: { halign: "right", fontStyle: "bold" },
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

  const renderDetalleVenta = (venta: VentaConDetalles) => {
    const isExpanded = expandedVentas.has(venta.id)

    if (venta.detalles && venta.detalles.length > 0) {
      return venta.detalles.map((detalle, idx) => {
        const pesoTotal = detalle.peso_enrolados || 0
        const cantEnrolados = detalle.cantidad_enrolados || 0
        const pesoPorEnrolado = cantEnrolados > 0 ? Math.round((pesoTotal / cantEnrolados) * 10) / 10 : 0

        return (
          <TableRow key={`${venta.id}-detail-${idx}`} className="bg-muted/30 border-l-4 border-l-emerald-500">
            <TableCell></TableCell>
            <TableCell></TableCell>
            <TableCell></TableCell>
            <TableCell className="font-medium text-foreground">{detalle.genetica?.nombre}</TableCell>
            <TableCell>
              <div className="flex flex-col gap-1">
                {detalle.gramos > 0 && (
                  <div className="flex items-center gap-1 text-sm">
                    <Scale className="h-3 w-3 text-emerald-600" />
                    <span>
                      {detalle.gramos}g x ${detalle.genetica?.precio_por_gramo || 0}/g
                    </span>
                  </div>
                )}
                {cantEnrolados > 0 && (
                  <div className="flex items-center gap-1 text-sm text-amber-600">
                    <Cigarette className="h-3 w-3" />
                    <span>
                      {cantEnrolados} enr. ({pesoPorEnrolado}g c/u) x ${detalle.genetica?.precio_por_enrolado || 0}
                    </span>
                  </div>
                )}
              </div>
            </TableCell>
            <TableCell></TableCell>
            <TableCell className="text-right text-muted-foreground">
              $
              {(
                (detalle.gramos || 0) * (detalle.genetica?.precio_por_gramo || 0) +
                cantEnrolados * (detalle.genetica?.precio_por_enrolado || 0)
              ).toFixed(2)}
            </TableCell>
          </TableRow>
        )
      })
    } else {
      const gramos = Number(venta.gramos) || 0
      const enrolados = venta.cantidad_enrolados || 0
      const pesoTotal = Number(venta.peso_enrolados) || 0
      const pesoPorEnrolado = enrolados > 0 ? Math.round((pesoTotal / enrolados) * 10) / 10 : 0

      return (
        <TableRow className="bg-muted/30 border-l-4 border-l-emerald-500">
          <TableCell></TableCell>
          <TableCell></TableCell>
          <TableCell></TableCell>
          <TableCell className="font-medium text-foreground">{venta.genetica?.nombre}</TableCell>
          <TableCell>
            <div className="flex flex-col gap-1">
              {gramos > 0 && (
                <div className="flex items-center gap-1 text-sm">
                  <Scale className="h-3 w-3 text-emerald-600" />
                  <span>
                    {gramos}g x ${venta.precio_unitario}/g
                  </span>
                </div>
              )}
              {enrolados > 0 && (
                <div className="flex items-center gap-1 text-sm text-amber-600">
                  <Cigarette className="h-3 w-3" />
                  <span>
                    {enrolados} enr. ({pesoPorEnrolado}g c/u) x ${venta.genetica?.precio_por_enrolado || 0}
                  </span>
                </div>
              )}
            </div>
          </TableCell>
          <TableCell></TableCell>
          <TableCell></TableCell>
        </TableRow>
      )
    }
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
            <CardTitle className="text-sm font-medium text-muted-foreground">Pendiente</CardTitle>
            <Clock className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-500">${ventasPendientes.toFixed(2)}</div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <Package className="h-5 w-5 text-emerald-600" />
            Detalle de Ventas
            {soloNoPagados && (
              <Badge variant="outline" className="ml-2 border-red-300 text-red-600">
                Solo Pendientes
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Cargando ventas...</div>
          ) : ventasFiltradas.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {soloNoPagados ? "No hay ventas pendientes de pago en este período" : "No hay ventas en este período"}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border">
                    <TableHead className="w-8"></TableHead>
                    <TableHead className="text-muted-foreground">Fecha</TableHead>
                    <TableHead className="text-muted-foreground">Socio</TableHead>
                    <TableHead className="text-muted-foreground">Genética</TableHead>
                    <TableHead className="text-muted-foreground">Gramos</TableHead>
                    <TableHead className="text-muted-foreground">Pago</TableHead>
                    <TableHead className="text-muted-foreground text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ventasFiltradas.map((venta) => {
                    const info = getVentaInfo(venta)
                    const isExpanded = expandedVentas.has(venta.id)

                    return (
                      <>
                        <TableRow
                          key={venta.id}
                          className="border-border hover:bg-muted/50 cursor-pointer"
                          onClick={() => toggleExpand(venta.id)}
                        >
                          <TableCell className="w-8">
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4 text-emerald-600" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                              )}
                            </Button>
                          </TableCell>
                          <TableCell className="text-foreground">
                            {new Date(venta.created_at).toLocaleDateString("es-AR", {
                              day: "2-digit",
                              month: "2-digit",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </TableCell>
                          <TableCell className="font-medium text-foreground">
                            {venta.socio?.apellido}, {venta.socio?.nombre}
                          </TableCell>
                          <TableCell>
                            {info.esMultiple ? (
                              <Badge variant="outline" className="border-emerald-300 text-emerald-600">
                                {info.genetica}
                              </Badge>
                            ) : (
                              <span className="text-foreground">{info.genetica}</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span className="text-foreground">{info.gramos}g</span>
                              {info.enrolados > 0 && (
                                <Badge variant="outline" className="border-amber-300 text-amber-600">
                                  +{info.enrolados} enr.
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            {venta.metodo_pago === "pendiente" ? (
                              <Badge
                                variant="outline"
                                className="border-red-300 text-red-600 cursor-pointer hover:bg-red-50"
                                onClick={() => {
                                  setEditingVenta(venta)
                                  setNuevoMetodoPago("efectivo")
                                }}
                              >
                                <Clock className="h-3 w-3 mr-1" />
                                Pendiente
                              </Badge>
                            ) : venta.metodo_pago === "efectivo" ? (
                              <Badge variant="outline" className="border-emerald-300 text-emerald-600">
                                <Banknote className="h-3 w-3 mr-1" />
                                Efectivo
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="border-blue-300 text-blue-600">
                                <CreditCard className="h-3 w-3 mr-1" />
                                Transferencia
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-bold text-emerald-600">
                            ${Number(venta.total).toFixed(2)}
                          </TableCell>
                        </TableRow>
                        {isExpanded && renderDetalleVenta(venta)}
                      </>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
