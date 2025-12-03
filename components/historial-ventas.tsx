"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import type { Venta, DetalleVenta, Socio, Genetica, LineaVenta } from "@/lib/types"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
  Cigarette,
  Scale,
  Search,
  Pencil,
  X,
  Plus,
  Trash2,
  FileText,
  AlertTriangle,
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
import { Textarea } from "@/components/ui/textarea"
import { useRouter } from "next/navigation"
import React from "react" // Import React
// Imported AlertDialog components
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

interface VentaConDetalles extends Venta {
  detalles?: DetalleVenta[]
  socio?: Socio // Asegúrate de que Socio tenga es_miembro
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
  const [filtroSocio, setFiltroSocio] = useState("")
  const [socios, setSocios] = useState<Socio[]>([])
  const [geneticas, setGeneticas] = useState<Genetica[]>([])
  const [editingFullVenta, setEditingFullVenta] = useState<VentaConDetalles | null>(null)
  const [editFormData, setEditFormData] = useState({
    socio_id: "",
    metodo_pago: "efectivo" as "efectivo" | "transferencia" | "pendiente",
    notas: "",
    fecha: new Date(),
  })
  const [editLineas, setEditLineas] = useState<LineaVenta[]>([])
  const [savingEdit, setSavingEdit] = useState(false)
  const [popoverEditFechaOpen, setPopoverEditFechaOpen] = useState(false)
  const router = useRouter()

  const [ventaABorrar, setVentaABorrar] = useState<VentaConDetalles | null>(null)
  const [borrando, setBorrando] = useState(false)

  const fetchVentas = async () => {
    if (!fechaDesde || !fechaHasta) return

    setLoading(true)
    const supabase = createClient()

    const desdeStr = format(fechaDesde, "yyyy-MM-dd")
    const hastaStr = format(fechaHasta, "yyyy-MM-dd")

    const { data, error } = await supabase
      .from("ventas")
      .select(
        "*, socio:socios(nombre, apellido, dni, es_miembro), genetica:geneticas(nombre, precio_por_gramo, precio_por_enrolado), detalles:detalle_venta(id, genetica_id, gramos, cantidad_enrolados, peso_por_enrolado, peso_enrolados, precio_unitario, precio_enrolado, subtotal, genetica:geneticas(nombre, precio_por_gramo, precio_por_enrolado))",
      )
      .gte("created_at", `${desdeStr}T00:00:00`)
      .lte("created_at", `${hastaStr}T23:59:59`)
      .order("created_at", { ascending: false })

    if (!error && data) {
      setVentas(data)
    }
    setLoading(false)
  }

  const fetchGeneticas = async () => {
    const supabase = createClient()
    const { data, error } = await supabase.from("geneticas").select("*").order("nombre")
    if (!error && data) {
      setGeneticas(data)
    }
  }

  useEffect(() => {
    const hoy = new Date()
    const hace30Dias = new Date()
    hace30Dias.setDate(hoy.getDate() - 30)

    setFechaHasta(hoy)
    setFechaDesde(hace30Dias)

    const loadData = async () => {
      const supabase = createClient()
      const [sociosRes, geneticasRes] = await Promise.all([
        supabase.from("socios").select("*").eq("activo", true).order("apellido"),
        supabase.from("geneticas").select("*").order("nombre"),
      ])
      if (sociosRes.data) setSocios(sociosRes.data)
      if (geneticasRes.data) setGeneticas(geneticasRes.data)
    }
    loadData()
  }, [])

  useEffect(() => {
    if (fechaDesde && fechaHasta) {
      fetchVentas()
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

  const openEditVenta = (venta: VentaConDetalles) => {
    setEditingFullVenta(venta)
    setEditFormData({
      socio_id: venta.socio_id,
      metodo_pago: venta.metodo_pago as "efectivo" | "transferencia" | "pendiente",
      notas: venta.notas || "",
      fecha: new Date(venta.created_at),
    })

    if (venta.detalles && venta.detalles.length > 0) {
      const lineas = venta.detalles.map((d: any) => ({
        genetica_id: d.genetica_id || "",
        gramos: Number(d.gramos) || 0,
        cantidad_enrolados: Number(d.cantidad_enrolados) || 0,
        peso_por_enrolado: Number(d.peso_por_enrolado) || 0,
      }))
      setEditLineas(lineas)
    } else {
      // Ventas legacy sin detalle_venta - usar datos de la tabla ventas
      const lineaLegacy = {
        genetica_id: venta.genetica_id || "",
        gramos: Number(venta.gramos) || 0,
        cantidad_enrolados: 0,
        peso_por_enrolado: 0,
      }
      setEditLineas([lineaLegacy])
    }
  }

  const handleSaveEdit = async () => {
    if (!editingFullVenta) return
    setSavingEdit(true)
    const supabase = createClient()

    const gramosOriginales: Record<string, number> = {}
    if (editingFullVenta.detalles && editingFullVenta.detalles.length > 0) {
      for (const detalle of editingFullVenta.detalles) {
        const geneticaId = detalle.genetica_id
        const gramosDetalle = Number(detalle.gramos) || 0
        const pesoEnrolados = (Number(detalle.cantidad_enrolados) || 0) * (Number(detalle.peso_por_enrolado) || 0)
        gramosOriginales[geneticaId] = (gramosOriginales[geneticaId] || 0) + gramosDetalle + pesoEnrolados
      }
    } else if (editingFullVenta.genetica_id) {
      gramosOriginales[editingFullVenta.genetica_id] = Number(editingFullVenta.gramos) || 0
    }

    // Calcular totales nuevos
    let totalGramos = 0
    let totalVenta = 0
    const lineasValidas = editLineas.filter((l) => l.genetica_id && (l.gramos > 0 || l.cantidad_enrolados > 0))

    const gramosNuevos: Record<string, number> = {}
    for (const linea of lineasValidas) {
      const genetica = geneticas.find((g) => g.id === linea.genetica_id)
      const pesoEnrolados = linea.cantidad_enrolados * linea.peso_por_enrolado
      const gramosTotalesLinea = linea.gramos + pesoEnrolados
      totalGramos += gramosTotalesLinea
      totalVenta +=
        linea.gramos * (genetica?.precio_por_gramo || 0) +
        linea.cantidad_enrolados * (genetica?.precio_por_enrolado || 0)
      gramosNuevos[linea.genetica_id] = (gramosNuevos[linea.genetica_id] || 0) + gramosTotalesLinea
    }

    const todasLasGeneticas = new Set([...Object.keys(gramosOriginales), ...Object.keys(gramosNuevos)])
    for (const geneticaId of todasLasGeneticas) {
      const original = gramosOriginales[geneticaId] || 0
      const nuevo = gramosNuevos[geneticaId] || 0
      const diferencia = original - nuevo // Positivo = devolver, Negativo = descontar más

      if (diferencia !== 0) {
        const genetica = geneticas.find((g) => g.id === geneticaId)
        if (genetica) {
          await supabase
            .from("geneticas")
            .update({
              gramos_disponibles: genetica.gramos_disponibles + diferencia,
              updated_at: new Date().toISOString(),
            })
            .eq("id", geneticaId)
        }
      }
    }

    // Actualizar venta principal
    const { error: ventaError } = await supabase
      .from("ventas")
      .update({
        socio_id: editFormData.socio_id,
        metodo_pago: editFormData.metodo_pago,
        notas: editFormData.notas || null,
        created_at: editFormData.fecha.toISOString(),
        gramos: totalGramos,
        total: totalVenta,
        genetica_id: lineasValidas[0]?.genetica_id || null,
        tipo_venta:
          lineasValidas.some((l) => l.gramos > 0) && lineasValidas.some((l) => l.cantidad_enrolados > 0)
            ? "mixto"
            : lineasValidas.some((l) => l.cantidad_enrolados > 0)
              ? "enrolados"
              : "gramos",
      })
      .eq("id", editingFullVenta.id)

    if (ventaError) {
      console.error("Error al actualizar venta:", ventaError)
      setSavingEdit(false)
      return
    }

    // Eliminar detalles antiguos y crear nuevos
    await supabase.from("detalle_venta").delete().eq("venta_id", editingFullVenta.id)

    for (const linea of lineasValidas) {
      const genetica = geneticas.find((g) => g.id === linea.genetica_id)
      const pesoEnrolados = linea.cantidad_enrolados * linea.peso_por_enrolado
      const subtotal =
        linea.gramos * (genetica?.precio_por_gramo || 0) +
        linea.cantidad_enrolados * (genetica?.precio_por_enrolado || 0)

      await supabase.from("detalle_venta").insert({
        venta_id: editingFullVenta.id,
        genetica_id: linea.genetica_id,
        gramos: linea.gramos,
        cantidad_enrolados: linea.cantidad_enrolados > 0 ? linea.cantidad_enrolados : null,
        peso_por_enrolado: linea.peso_por_enrolado > 0 ? linea.peso_por_enrolado : null,
        peso_enrolados: pesoEnrolados > 0 ? pesoEnrolados : null,
        precio_unitario: genetica?.precio_por_gramo || 0,
        precio_enrolado: genetica?.precio_por_enrolado || null,
        subtotal: subtotal,
      })
    }

    setEditingFullVenta(null)
    setSavingEdit(false)
    fetchVentas()
    fetchGeneticas()
    router.refresh()
  }

  const handleDeleteVenta = async () => {
    if (!ventaABorrar) return
    setBorrando(true)
    const supabase = createClient()

    // Calcular gramos a devolver por genética
    const gramosADevolver: Record<string, number> = {}
    if (ventaABorrar.detalles && ventaABorrar.detalles.length > 0) {
      for (const detalle of ventaABorrar.detalles) {
        const geneticaId = detalle.genetica_id
        const gramosDetalle = Number(detalle.gramos) || 0
        const pesoEnrolados = (Number(detalle.cantidad_enrolados) || 0) * (Number(detalle.peso_por_enrolado) || 0)
        gramosADevolver[geneticaId] = (gramosADevolver[geneticaId] || 0) + gramosDetalle + pesoEnrolados
      }
    } else if (ventaABorrar.genetica_id) {
      gramosADevolver[ventaABorrar.genetica_id] = Number(ventaABorrar.gramos) || 0
    }

    // Devolver stock a cada genética
    for (const [geneticaId, gramos] of Object.entries(gramosADevolver)) {
      const genetica = geneticas.find((g) => g.id === geneticaId)
      if (genetica) {
        await supabase
          .from("geneticas")
          .update({
            gramos_disponibles: genetica.gramos_disponibles + gramos,
            updated_at: new Date().toISOString(),
          })
          .eq("id", geneticaId)
      }
    }

    // Eliminar detalles
    await supabase.from("detalle_venta").delete().eq("venta_id", ventaABorrar.id)

    // Eliminar venta
    const { error } = await supabase.from("ventas").delete().eq("id", ventaABorrar.id)

    if (error) {
      console.error("Error al borrar venta:", error)
    }

    setVentaABorrar(null)
    setBorrando(false)
    fetchVentas()
    fetchGeneticas()
  }

  const agregarLineaEdit = () => {
    setEditLineas([...editLineas, { genetica_id: "", gramos: 0, cantidad_enrolados: 0, peso_por_enrolado: 0 }])
  }

  const eliminarLineaEdit = (index: number) => {
    if (editLineas.length > 1) {
      setEditLineas(editLineas.filter((_, i) => i !== index))
    }
  }

  const actualizarLineaEdit = (index: number, campo: keyof LineaVenta, valor: string | number) => {
    const nuevasLineas = [...editLineas]
    if (campo === "genetica_id") {
      nuevasLineas[index][campo] = valor as string
    } else {
      nuevasLineas[index][campo] = Number(valor) || 0
    }
    setEditLineas(nuevasLineas)
  }

  const initialVentasFiltradas = ventas.filter((v) => {
    if (soloNoPagados && v.metodo_pago !== "pendiente") return false
    if (filtroSocio) {
      const nombreCompleto = `${v.socio?.nombre} ${v.socio?.apellido} ${v.socio?.dni}`.toLowerCase()
      if (!nombreCompleto.includes(filtroSocio.toLowerCase())) return false
    }
    return true
  })

  const totalVentas = initialVentasFiltradas.reduce((sum, v) => sum + Number(v.total), 0)
  const totalGramos = initialVentasFiltradas.reduce((sum, v) => {
    const info = getVentaInfo(v)
    return sum + info.gramos
  }, 0)
  const ventasEfectivo = initialVentasFiltradas
    .filter((v) => v.metodo_pago === "efectivo")
    .reduce((sum, v) => sum + Number(v.total), 0)
  const ventasTransferencia = initialVentasFiltradas
    .filter((v) => v.metodo_pago === "transferencia")
    .reduce((sum, v) => sum + Number(v.total), 0)
  const ventasPendientes = initialVentasFiltradas
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
      doc.text(`Transacciones: ${initialVentasFiltradas.length}`, 14, 108)
      doc.text(`Efectivo: $${ventasEfectivo.toFixed(2)}`, 100, 96)
      doc.text(`Transferencia: $${ventasTransferencia.toFixed(2)}`, 100, 102)
      doc.text(`Pendiente: $${ventasPendientes.toFixed(2)}`, 100, 108)

      const tableData: string[][] = []
      initialVentasFiltradas.forEach((venta) => {
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
    const esMiembro = venta.socio?.es_miembro || false

    if (venta.detalles && venta.detalles.length > 0) {
      const rows: React.ReactNode[] = []

      venta.detalles.forEach((detalle, idx) => {
        const pesoTotal = detalle.peso_enrolados || 0
        const cantEnrolados = detalle.cantidad_enrolados || 0
        const pesoPorEnrolado = cantEnrolados > 0 ? Math.round((pesoTotal / cantEnrolados) * 10) / 10 : 0
        const precioGramo = esMiembro ? 0 : detalle.genetica?.precio_por_gramo || 0
        const precioEnrolado = esMiembro ? 0 : detalle.genetica?.precio_por_enrolado || 0

        rows.push(
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
                      {detalle.gramos}g x ${precioGramo}/g
                    </span>
                  </div>
                )}
                {cantEnrolados > 0 && (
                  <div className="flex items-center gap-1 text-sm text-amber-600">
                    <Cigarette className="h-3 w-3" />
                    <span>
                      {cantEnrolados} enr. ({pesoPorEnrolado}g c/u) x ${precioEnrolado}
                    </span>
                  </div>
                )}
              </div>
            </TableCell>
            <TableCell></TableCell>
            <TableCell className="text-right text-muted-foreground">
              ${((detalle.gramos || 0) * precioGramo + cantEnrolados * precioEnrolado).toFixed(2)}
            </TableCell>
            <TableCell></TableCell>
          </TableRow>,
        )
      })

      if (venta.notas) {
        rows.push(
          <TableRow key={`${venta.id}-notas`} className="bg-muted/20 border-l-4 border-l-blue-500">
            <TableCell colSpan={8} className="py-2">
              <div className="flex items-start gap-2 text-sm">
                <FileText className="h-4 w-4 text-blue-500 mt-0.5" />
                <div>
                  <span className="font-medium text-blue-600">Nota:</span>{" "}
                  <span className="text-muted-foreground">{venta.notas}</span>
                </div>
              </div>
            </TableCell>
          </TableRow>,
        )
      }

      return rows
    } else {
      const gramos = Number(venta.gramos) || 0
      const enrolados = venta.cantidad_enrolados || 0
      const pesoTotal = Number(venta.peso_enrolados) || 0
      const pesoPorEnrolado = enrolados > 0 ? Math.round((pesoTotal / enrolados) * 10) / 10 : 0
      const precioGramo = esMiembro ? 0 : venta.precio_unitario || 0
      const precioEnrolado = esMiembro ? 0 : venta.genetica?.precio_por_enrolado || 0

      const rows: React.ReactNode[] = [
        <TableRow key={`${venta.id}-legacy`} className="bg-muted/30 border-l-4 border-l-emerald-500">
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
                    {gramos}g x ${precioGramo}/g
                  </span>
                </div>
              )}
              {enrolados > 0 && (
                <div className="flex items-center gap-1 text-sm text-amber-600">
                  <Cigarette className="h-3 w-3" />
                  <span>
                    {enrolados} enr. ({pesoPorEnrolado}g c/u) x ${precioEnrolado}
                  </span>
                </div>
              )}
            </div>
          </TableCell>
          <TableCell></TableCell>
          <TableCell></TableCell>
          <TableCell></TableCell>
        </TableRow>,
      ]

      if (venta.notas) {
        rows.push(
          <TableRow key={`${venta.id}-legacy-notas`} className="bg-muted/20 border-l-4 border-l-blue-500">
            <TableCell colSpan={8} className="py-2">
              <div className="flex items-start gap-2 text-sm">
                <FileText className="h-4 w-4 text-blue-500 mt-0.5" />
                <div>
                  <span className="font-medium text-blue-600">Nota:</span>{" "}
                  <span className="text-muted-foreground">{venta.notas}</span>
                </div>
              </div>
            </TableCell>
          </TableRow>,
        )
      }

      return rows
    }
  }

  const ventasFiltradas = ventas.filter((v) => {
    if (soloNoPagados && v.metodo_pago !== "pendiente") return false
    if (filtroSocio) {
      const nombreCompleto = `${v.socio?.nombre} ${v.socio?.apellido} ${v.socio?.dni}`.toLowerCase()
      if (!nombreCompleto.includes(filtroSocio.toLowerCase())) return false
    }
    return true
  })

  const totalVentasFiltradas = ventasFiltradas.reduce((sum, v) => sum + Number(v.total), 0)
  const totalGramosFiltradas = ventasFiltradas.reduce((sum, v) => {
    const info = getVentaInfo(v)
    return sum + info.gramos
  }, 0)

  return (
    <div className="space-y-6">
      {/* Dialog para confirmar pago (existente) */}
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

      <Dialog open={!!editingFullVenta} onOpenChange={(open) => !open && setEditingFullVenta(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
                <Pencil className="h-6 w-6 text-emerald-600" />
              </div>
              <div>
                <DialogTitle className="text-foreground">Editar Venta</DialogTitle>
                <DialogDescription className="text-muted-foreground">
                  Modificar los datos de esta venta
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="py-4 space-y-4">
            {/* Fecha */}
            <div className="space-y-2">
              <Label>Fecha de Venta</Label>
              <Popover open={popoverEditFechaOpen} onOpenChange={setPopoverEditFechaOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-start text-left font-normal border-border bg-transparent"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4 text-emerald-600" />
                    {format(editFormData.fecha, "dd 'de' MMMM, yyyy", { locale: es })}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={editFormData.fecha}
                    onSelect={(date) => {
                      if (date) {
                        setEditFormData({ ...editFormData, fecha: date })
                      }
                      setPopoverEditFechaOpen(false)
                    }}
                    locale={es}
                    disabled={(date) => date > new Date()}
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Socio */}
            <div className="space-y-2">
              <Label>Socio</Label>
              <Select
                value={editFormData.socio_id}
                onValueChange={(value) => setEditFormData({ ...editFormData, socio_id: value })}
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
            </div>

            {/* Productos */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Productos</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={agregarLineaEdit}
                  className="h-8 text-xs border-emerald-300 text-emerald-700 hover:bg-emerald-50 bg-transparent"
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Agregar
                </Button>
              </div>

              {editLineas.map((linea, index) => {
                const genetica = geneticas.find((g) => g.id === linea.genetica_id)
                return (
                  <div key={index} className="p-3 rounded-lg bg-muted/50 border border-border space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Producto {index + 1}</span>
                      {editLineas.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => eliminarLineaEdit(index)}
                          className="h-7 w-7 p-0 text-red-500 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>

                    <Select
                      value={linea.genetica_id}
                      onValueChange={(value) => actualizarLineaEdit(index, "genetica_id", value)}
                    >
                      <SelectTrigger className="bg-background border-border">
                        <SelectValue placeholder="Seleccionar genética" />
                      </SelectTrigger>
                      <SelectContent>
                        {geneticas.map((g) => (
                          <SelectItem key={g.id} value={g.id}>
                            {g.nombre} (${g.precio_por_gramo}/g)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Gramos</Label>
                        <Input
                          type="number"
                          step="0.1"
                          min="0"
                          value={linea.gramos || ""}
                          onChange={(e) => actualizarLineaEdit(index, "gramos", e.target.value)}
                          className="bg-background border-border"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Enrolados</Label>
                        <Input
                          type="number"
                          min="0"
                          value={linea.cantidad_enrolados || ""}
                          onChange={(e) => actualizarLineaEdit(index, "cantidad_enrolados", e.target.value)}
                          className="bg-background border-border"
                        />
                      </div>
                    </div>

                    {linea.cantidad_enrolados > 0 && (
                      <div className="space-y-1">
                        <Label className="text-xs">Peso por enrolado (g)</Label>
                        <Input
                          type="number"
                          step="0.1"
                          min="0"
                          value={linea.peso_por_enrolado || ""}
                          onChange={(e) => actualizarLineaEdit(index, "peso_por_enrolado", e.target.value)}
                          className="bg-background border-border"
                        />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Método de pago */}
            <div className="space-y-2">
              <Label>Método de Pago</Label>
              <Select
                value={editFormData.metodo_pago}
                onValueChange={(value: "efectivo" | "transferencia" | "pendiente") =>
                  setEditFormData({ ...editFormData, metodo_pago: value })
                }
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
                  <SelectItem value="pendiente">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      Pendiente
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Notas */}
            <div className="space-y-2">
              <Label>Notas</Label>
              <Textarea
                value={editFormData.notas}
                onChange={(e) => setEditFormData({ ...editFormData, notas: e.target.value })}
                placeholder="Notas adicionales..."
                className="bg-background border-border"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingFullVenta(null)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveEdit} disabled={savingEdit} className="bg-emerald-600 hover:bg-emerald-700">
              {savingEdit ? "Guardando..." : "Guardar Cambios"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!ventaABorrar} onOpenChange={(open) => !open && setVentaABorrar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              ¿Eliminar esta venta?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Se eliminará la venta y se devolverán los gramos al stock de las
              genéticas correspondientes.
              {ventaABorrar && (
                <div className="mt-3 p-3 bg-muted rounded-lg text-sm">
                  <p>
                    <strong>Socio:</strong> {ventaABorrar.socio?.apellido}, {ventaABorrar.socio?.nombre}
                  </p>
                  <p>
                    <strong>Total:</strong> ${ventaABorrar.total?.toLocaleString()}
                  </p>
                  <p>
                    <strong>Gramos a devolver:</strong> {ventaABorrar.gramos}g
                  </p>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteVenta} disabled={borrando} className="bg-red-600 hover:bg-red-700">
              {borrando ? "Eliminando..." : "Eliminar Venta"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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

            <Button onClick={fetchVentas} className="bg-emerald-600 hover:bg-emerald-700" disabled={loading}>
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

          <div className="mt-4 flex flex-col sm:flex-row gap-4 items-end">
            <div className="flex-1 space-y-2">
              <Label className="text-sm font-medium text-foreground">Buscar Socio</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Nombre, apellido o DNI..."
                  value={filtroSocio}
                  onChange={(e) => setFiltroSocio(e.target.value)}
                  className="pl-10 bg-background border-border"
                />
                {filtroSocio && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setFiltroSocio("")}
                    className="absolute right-1 top-1/2 transform -translate-y-1/2 h-7 w-7 p-0"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>

            <Button
              variant={soloNoPagados ? "default" : "outline"}
              onClick={() => setSoloNoPagados(!soloNoPagados)}
              className={cn(
                soloNoPagados
                  ? "bg-red-600 hover:bg-red-700 text-white"
                  : "border-border hover:border-red-300 hover:bg-red-50/50",
              )}
            >
              <Filter className="h-4 w-4 mr-2" />
              {soloNoPagados ? "Mostrando Pendientes" : "Ver Pendientes"}
            </Button>

            {/* ... existing export button ... */}
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
            <div className="text-2xl font-bold text-emerald-600">${totalVentasFiltradas.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">{ventasFiltradas.length} transacciones</p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Gramos</CardTitle>
            <Package className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{totalGramosFiltradas.toFixed(1)}g</div>
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
            {filtroSocio && (
              <Badge variant="outline" className="ml-2 text-emerald-600 border-emerald-300">
                Filtrado por: {filtroSocio}
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
            <div className="rounded-md border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="text-foreground">Fecha</TableHead>
                    <TableHead className="text-foreground">Socio</TableHead>
                    <TableHead className="text-foreground">DNI</TableHead>
                    <TableHead className="text-foreground">Genética</TableHead>
                    <TableHead className="text-foreground">Gramos</TableHead>
                    <TableHead className="text-foreground">Pago</TableHead>
                    <TableHead className="text-right text-foreground">Total</TableHead>
                    <TableHead className="text-center text-foreground w-20">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ventasFiltradas.map((venta) => {
                    const info = getVentaInfo(venta)
                    const isExpanded = expandedVentas.has(venta.id)

                    return (
                      <React.Fragment key={venta.id}>
                        <TableRow className="hover:bg-muted/50 cursor-pointer" onClick={() => toggleExpand(venta.id)}>
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
                          <TableCell className="text-foreground">
                            {venta.socio?.dni ? formatDni(venta.socio.dni) : "-"}
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
                          <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openEditVenta(venta)}
                                className="h-8 w-8 p-0 hover:bg-emerald-100"
                              >
                                <Pencil className="h-4 w-4 text-emerald-600" />
                              </Button>
                              {/* Botón de borrar */}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setVentaABorrar(venta)}
                                className="h-8 w-8 p-0 text-red-500 hover:bg-red-100 hover:text-red-700"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                        {isExpanded && renderDetalleVenta(venta)}
                      </React.Fragment>
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
