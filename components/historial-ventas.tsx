"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import type { Venta, DetalleVenta, Socio, Genetica, LineaVenta, Producto } from "@/lib/types"
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
  ShoppingCart,
  ImageIcon,
  ArrowLeftRight,
  Upload,
} from "lucide-react"
import { format, startOfDay, endOfDay } from "date-fns"
import { es } from "date-fns/locale"
import { cn } from "@/lib/utils"
import { formatCurrency, formatGramos } from "@/lib/format"
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
  const [expandedVentas, setExpandedVentas] = useState<Set<string>>(new Set())
  const [filtroSocio, setFiltroSocio] = useState("")
  const [filtroProducto, setFiltroProducto] = useState("")
  const [socios, setSocios] = useState<Socio[]>([])
  const [geneticas, setGeneticas] = useState<Genetica[]>([])
  const [productos, setProductos] = useState<Producto[]>([]) // Added state for products
  const [editingFullVenta, setEditingFullVenta] = useState<VentaConDetalles | null>(null)
  const [editFormData, setEditFormData] = useState({
    socio_id: "",
    notas: "",
    fecha: new Date(),
  })
  const [editingPagosVenta, setEditingPagosVenta] = useState<VentaConDetalles | null>(null)
  const [metodoPagoCorregido, setMetodoPagoCorregido] = useState<Record<string, "efectivo" | "transferencia">>({})
  const [guardandoMetodoPagoId, setGuardandoMetodoPagoId] = useState<string | null>(null)
  const [editLineas, setEditLineas] = useState<LineaVenta[]>([])
  const [savingEdit, setSavingEdit] = useState(false)
  const [popoverEditFechaOpen, setPopoverEditFechaOpen] = useState(false)
  const router = useRouter()

  const [ventaABorrar, setVentaABorrar] = useState<VentaConDetalles | null>(null)
  const [comprobanteUrl, setComprobanteUrl] = useState<string | null>(null)
  const [borrando, setBorrando] = useState(false)
  const [ventaParaComprobante, setVentaParaComprobante] = useState<VentaConDetalles | null>(null)
  const [subiendoComprobante, setSubiendoComprobante] = useState(false)

  const fetchVentas = async () => {
    if (!fechaDesde || !fechaHasta) return

    setLoading(true)
    const supabase = createClient()

    const { data, error } = await supabase
      .from("ventas")
      .select(
        "*, socio:socios(nombre, apellido, dni, es_miembro), genetica:geneticas(nombre, precio_por_gramo, precio_por_enrolado), detalles:detalle_venta(id, genetica_id, producto_id, gramos, cantidad_enrolados, peso_por_enrolado, peso_enrolados, precio_unitario, precio_enrolado, subtotal, genetica:geneticas(nombre, precio_por_gramo, precio_por_enrolado), producto:productos(nombre)), pagos(id, monto, metodo_pago, comprobante_url, fecha)",
      )
      .gte("created_at", startOfDay(fechaDesde).toISOString())
      .lte("created_at", endOfDay(fechaHasta).toISOString())
      .order("created_at", { ascending: false })

    if (!error && data) {
      setVentas(data)
    }
    setLoading(false)
  }

  const fetchGeneticasAndProductos = async () => {
    const supabase = createClient()
    const [geneticasRes, productosRes] = await Promise.all([
      supabase.from("geneticas").select("*").order("nombre"),
      supabase.from("productos").select("*").order("nombre"),
    ])
    if (!geneticasRes.error && geneticasRes.data) {
      setGeneticas(geneticasRes.data)
    }
    if (!productosRes.error && productosRes.data) {
      setProductos(productosRes.data)
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
      const [sociosRes, geneticasRes, productosRes] = await Promise.all([
        supabase.from("socios").select("*").eq("activo", true).order("apellido"),
        supabase.from("geneticas").select("*").order("nombre"),
        supabase.from("productos").select("*").order("nombre"),
      ])
      if (sociosRes.data) setSocios(sociosRes.data)
      if (geneticasRes.data) setGeneticas(geneticasRes.data)
      if (productosRes.data) setProductos(productosRes.data)
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

    const { error } = await supabase
      .rpc("registrar_pago_venta", {
        p_venta_id: editingVenta.id,
        p_monto: Number(editingVenta.saldo_pendiente),
        p_metodo_pago: nuevoMetodoPago,
        p_notas: null,
        p_comprobante_url: null,
        p_fecha: new Date().toISOString(),
      })
      .single()

    if (!error) {
      setEditingVenta(null)
      await fetchVentas()
      router.refresh()
    } else if (/^VP0\d{2}$/.test(error.code || "")) {
      alert(error.message)
    } else {
      console.error("Error inesperado al confirmar el pago:", error)
      alert("Ocurrió un error inesperado al confirmar el pago. Intentá nuevamente.")
    }
    setUpdatingPago(false)
  }

  // Único lugar que limpia el estado del diálogo de corrección de pagos —
  // lo usan tanto el cierre normal (cerrarCorreccionPagos) como el cierre
  // automático al terminar una corrección con éxito.
  const limpiarCorreccionPagos = () => {
    setEditingPagosVenta(null)
    setMetodoPagoCorregido({})
  }

  const abrirCorreccionPagos = (venta: VentaConDetalles) => {
    setMetodoPagoCorregido({})
    setEditingPagosVenta(venta)
  }

  // Cierre pedido por el usuario (botón Cerrar, Escape, click afuera, X).
  // Mientras haya un guardado en curso no cierra: al ser un Dialog
  // controlado, si no limpiamos editingPagosVenta el diálogo se mantiene
  // abierto sin importar qué haya intentado cerrarlo.
  const cerrarCorreccionPagos = () => {
    if (guardandoMetodoPagoId) return
    limpiarCorreccionPagos()
  }

  const handleCorregirMetodoPago = async (pagoId: string, nuevoMetodo: "efectivo" | "transferencia") => {
    setGuardandoMetodoPagoId(pagoId)
    const supabase = createClient()

    const { error } = await supabase.rpc("corregir_metodo_pago", {
      p_pago_id: pagoId,
      p_metodo_pago: nuevoMetodo,
    })

    if (!error) {
      // No usamos cerrarCorreccionPagos acá: guardandoMetodoPagoId todavía no
      // se actualizó en este mismo tick (setState es asíncrono), así que su
      // guard de "no cerrar mientras se guarda" lo bloquearía.
      limpiarCorreccionPagos()
      setGuardandoMetodoPagoId(null)
      await fetchVentas()
      router.refresh()
    } else {
      setGuardandoMetodoPagoId(null)
      if (/^MP\d{3}$/.test(error.code || "")) {
        alert(error.message)
      } else {
        console.error("Error al corregir el método de pago:", error)
        alert("Ocurrió un error inesperado al corregir el método de pago. Intentá nuevamente.")
      }
    }
  }

  const toggleExpand = (ventaId: string) => {
    const newExpanded = new Set(expandedVentas)
    if (newExpanded.has(ventaId)) {
      newExpanded.delete(ventaId)
    } else {
      newExpanded.add(ventaId)
    }
    setExpandedVentas(newExpanded)
  }

  const handleSubirComprobante = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0] || !ventaParaComprobante) return

    const venta = ventaParaComprobante
    const supabase = createClient()
    const resetInput = () => {
      const inputEl = document.getElementById('input-comprobante-historial') as HTMLInputElement
      if (inputEl) inputEl.value = ''
    }

    const saldoPendiente = Number(venta.saldo_pendiente) || 0
    const pagoTransferencia = venta.pagos?.find((p) => p.metodo_pago === 'transferencia')

    // Rama 4: la venta ya está completamente paga con otro método (no
    // transferencia) — no corresponde crear un pago duplicado. Se corta acá,
    // antes de subir nada a Storage.
    if (!pagoTransferencia && saldoPendiente <= 0 && venta.pagos && venta.pagos.length > 0) {
      alert(
        "Esta venta ya está completamente paga con otro método; no corresponde asociar un comprobante de transferencia.",
      )
      resetInput()
      return
    }

    const file = e.target.files[0]
    setSubiendoComprobante(true)

    // Generar nombre único para el archivo
    const fileExt = file.name.split('.').pop()
    const fileName = `${venta.id}_${Date.now()}.${fileExt}`

    // Subir a Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('comprobantes')
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: false
      })

    if (uploadError) {
      console.error('Error al subir comprobante:', uploadError)
      setSubiendoComprobante(false)
      resetInput()
      return
    }

    // Obtener URL pública
    const { data: urlData } = supabase.storage
      .from('comprobantes')
      .getPublicUrl(fileName)

    const publicUrl = urlData.publicUrl

    let dbError: { code?: string; message: string } | null = null

    if (pagoTransferencia) {
      // Rama 1: ya existe un pago de transferencia — sólo actualizar el
      // comprobante. No toca saldos, no hace falta RPC.
      const { error } = await supabase
        .from("pagos")
        .update({ comprobante_url: publicUrl })
        .eq("id", pagoTransferencia.id)
      dbError = error
    } else if (saldoPendiente > 0) {
      // Rama 2: no hay pago de transferencia y todavía hay saldo pendiente —
      // se registra un pago nuevo por el saldo pendiente real (no por el
      // total ciego, como hacía el código viejo).
      const { error } = await supabase.rpc("registrar_pago_venta", {
        p_venta_id: venta.id,
        p_monto: saldoPendiente,
        p_metodo_pago: "transferencia",
        p_notas: null,
        p_comprobante_url: publicUrl,
        p_fecha: new Date().toISOString(),
      })
      dbError = error
    } else {
      // Rama 3: venta legacy ya paga y sin ninguna fila en `pagos` — se
      // reconstruye el registro histórico del cobro sin volver a tocar
      // saldo_pendiente ni monto_pagado (ya están correctos). INSERT directo:
      // una sola sentencia, atómica por sí misma, no toca `ventas`.
      const { error } = await supabase.from("pagos").insert({
        venta_id: venta.id,
        monto: Number(venta.total),
        metodo_pago: "transferencia",
        comprobante_url: publicUrl,
        notas: "Comprobante asociado retroactivamente a venta histórica ya paga",
        fecha: venta.created_at,
      })
      dbError = error
    }

    if (dbError) {
      // Storage ya se subió con éxito pero la escritura en base falló:
      // borrar el archivo recién subido para no dejar comprobantes huérfanos.
      const { error: removeError } = await supabase.storage.from('comprobantes').remove([fileName])
      if (removeError) console.error("No se pudo eliminar el comprobante huérfano:", removeError)

      if (/^VP0\d{2}$/.test(dbError.code || "")) {
        alert(dbError.message)
      } else {
        console.error("Error al asociar el comprobante:", dbError)
        alert("Ocurrió un error al asociar el comprobante. Intentá nuevamente.")
      }
      setSubiendoComprobante(false)
      resetInput()
      return
    }

    // Refrescar desde la base en vez de parchear el estado local a mano: esta
    // acción puede haber cambiado saldo_pendiente/monto_pagado además de
    // comprobante_url.
    await fetchVentas()

    setVentaParaComprobante(null)
    setSubiendoComprobante(false)
    resetInput()
  }

  const getVentaInfo = (venta: VentaConDetalles) => {
    if (venta.detalles && venta.detalles.length > 0) {
      const items = venta.detalles
        .map((d) => {
          if (d.genetica_id && d.genetica) {
            const totalGramosSueltos = d.gramos || 0
            const totalEnrolados = d.cantidad_enrolados || 0
            const totalPesoEnrolados = d.peso_enrolados || 0
            return {
              nombre: d.genetica.nombre,
              gramos: totalGramosSueltos + totalPesoEnrolados,
              enrolados: totalEnrolados,
            }
          } else if (d.producto_id && d.producto) {
            return {
              nombre: d.producto.nombre,
              cantidad: d.cantidad_enrolados || 0, // Reutilizamos cantidad_enrolados para cantidad de producto
            }
          }
          return null
        })
        .filter(Boolean) as Array<{ nombre: string; gramos?: number; enrolados?: number; cantidad?: number }>

      const nombresUnicos = [...new Set(items.map((item) => item.nombre))]

      const totalGramos = items.reduce((sum, item) => sum + (item.gramos || 0), 0)
      const totalEnrolados = items.reduce((sum, item) => sum + (item.enrolados || 0), 0)
      const totalCantidadProductos = items.reduce((sum, item) => sum + (item.cantidad || 0), 0)

      const tieneGenetica = items.some((item) => item.gramos !== undefined || item.enrolados !== undefined)
      const tieneProducto = items.some((item) => item.cantidad !== undefined)

      let detalleString = ""
      if (tieneGenetica) {
        detalleString += formatGramos(totalGramos)
        if (totalEnrolados > 0) detalleString += ` + ${totalEnrolados} enr.`
      }
      if (tieneProducto) {
        if (detalleString) detalleString += " | "
        detalleString += `${totalCantidadProductos} producto${totalCantidadProductos === 1 ? "" : "s"}`
      }

      return {
        genetica: nombresUnicos.length > 1 ? `${nombresUnicos.length} ítems` : nombresUnicos[0] || "-",
        esMultiple: nombresUnicos.length > 1,
        gramos: totalGramos,
        enrolados: totalEnrolados,
        tieneDetalle: true,
        detalleString: detalleString,
        totalCantidadProductos: totalCantidadProductos,
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
      detalleString:
        formatGramos(totalGramos) + (venta.cantidad_enrolados || 0 > 0 ? ` + ${venta.cantidad_enrolados} enr.` : ""),
      totalCantidadProductos: 0,
    }
  }

  const openEditVenta = (venta: VentaConDetalles) => {
    setEditingFullVenta(venta)
    setEditFormData({
      socio_id: venta.socio_id,
      notas: venta.notas || "",
      fecha: new Date(venta.created_at),
    })

    if (venta.detalles && venta.detalles.length > 0) {
      const lineas: LineaVenta[] = venta.detalles.map((d) => ({
        detalle_id: d.id,
        tipo: d.producto_id ? "producto" : "genetica",
        genetica_id: d.genetica_id || "",
        producto_id: d.producto_id || "", // Added for products
        gramos: Number(d.gramos) || 0,
        cantidad_enrolados: d.producto_id ? 0 : Number(d.cantidad_enrolados) || 0,
        peso_por_enrolado: Number(d.peso_por_enrolado) || 0,
        cantidad_producto: d.producto_id ? Number(d.cantidad_enrolados) || 0 : 0,
      }))
      setEditLineas(lineas)
    } else {
      // Ventas legacy sin detalle_venta - usar datos de la tabla ventas.
      // Sin detalle_id: editar_venta la reconoce como la línea legacy
      // original sólo si mantiene el mismo genetica_id y gramos.
      const lineaLegacy: LineaVenta = {
        detalle_id: null,
        tipo: "genetica",
        genetica_id: venta.genetica_id || "",
        producto_id: "", // No hay producto en legacy
        gramos: Number(venta.gramos) || 0,
        cantidad_enrolados: 0,
        peso_por_enrolado: 0,
        cantidad_producto: 0,
      }
      setEditLineas([lineaLegacy])
    }
  }

  const handleSaveEdit = async () => {
    if (!editingFullVenta) return

    const lineasValidas = editLineas.filter(
      (l) =>
        (l.tipo === "genetica" &&
          l.genetica_id &&
          (l.gramos > 0 || (l.cantidad_enrolados > 0 && l.peso_por_enrolado > 0))) ||
        (l.tipo === "producto" && l.producto_id && l.cantidad_producto > 0),
    )

    if (lineasValidas.length === 0) {
      alert("Agregá al menos un producto con cantidad válida")
      return
    }

    setSavingEdit(true)
    const supabase = createClient()

    const { error } = await supabase
      .rpc("editar_venta", {
        p_venta_id: editingFullVenta.id,
        p_socio_id: editFormData.socio_id,
        p_lineas: lineasValidas.map((l) => ({
          detalle_id: l.detalle_id || null,
          tipo: l.tipo,
          genetica_id: l.genetica_id || null,
          producto_id: l.producto_id || null,
          gramos: l.gramos,
          cantidad_enrolados: l.cantidad_enrolados,
          peso_por_enrolado: l.peso_por_enrolado,
          cantidad_producto: l.cantidad_producto,
        })),
        p_notas: editFormData.notas || null,
        p_fecha: editFormData.fecha.toISOString(),
      })
      .single()

    if (!error) {
      setEditingFullVenta(null)
      await fetchVentas()
      await fetchGeneticasAndProductos()
      router.refresh()
    } else if (/^VE0\d{2}$/.test(error.code || "")) {
      alert(error.message)
    } else {
      console.error("Error inesperado al editar la venta:", error)
      alert("Ocurrió un error inesperado al editar la venta. Intentá nuevamente.")
    }
    setSavingEdit(false)
  }

  const handleDeleteVenta = async () => {
    if (!ventaABorrar) return
    setBorrando(true)
    const supabase = createClient()

    const { error } = await supabase.rpc("eliminar_venta", { p_venta_id: ventaABorrar.id })

    if (!error) {
      setVentaABorrar(null)
      await fetchVentas()
      await fetchGeneticasAndProductos()
    } else if (/^VD0\d{2}$/.test(error.code || "")) {
      alert(error.message)
    } else {
      console.error("Error inesperado al eliminar la venta:", error)
      alert("Ocurrió un error inesperado al eliminar la venta. Intentá nuevamente.")
    }
    setBorrando(false)
  }

  const agregarLineaEdit = () => {
    setEditLineas([
      ...editLineas,
      {
        detalle_id: null,
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

  const eliminarLineaEdit = (index: number) => {
    if (editLineas.length > 1) {
      setEditLineas(editLineas.filter((_, i) => i !== index))
    }
  }

  const actualizarLineaEdit = (index: number, campo: keyof LineaVenta, valor: string | number) => {
    const nuevasLineas = [...editLineas]
    if (campo === "genetica_id" || campo === "producto_id") {
      nuevasLineas[index] = { ...nuevasLineas[index], [campo]: String(valor) }
    } else if (campo === "tipo") {
      nuevasLineas[index] = { ...nuevasLineas[index], tipo: valor as LineaVenta["tipo"] }
    } else {
      nuevasLineas[index] = { ...nuevasLineas[index], [campo]: Number(valor) || 0 }
    }
    setEditLineas(nuevasLineas)
  }

  // Normaliza nombres: sin tildes, sin mayúsculas y sin espacios sobrantes,
  // para agrupar variantes como "Apricot Mimosa" y "apricot mímosa".
  const normalizar = (texto?: string | null) =>
    (texto || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim()

  // Mapas de id -> nombre normalizado (hay genéticas/productos con el mismo nombre)
  const geneticaNombrePorId = new Map(geneticas.map((g) => [g.id, normalizar(g.nombre)]))
  const productoNombrePorId = new Map(productos.map((p) => [p.id, normalizar(p.nombre)]))

  const coincideConProducto = (v: VentaConDetalles) => {
    if (!filtroProducto) return true
    const sep = filtroProducto.indexOf(":")
    const tipo = filtroProducto.slice(0, sep)
    const nombre = normalizar(filtroProducto.slice(sep + 1))
    if (v.detalles && v.detalles.length > 0) {
      return v.detalles.some((d) =>
        tipo === "genetica"
          ? d.genetica_id && geneticaNombrePorId.get(d.genetica_id) === nombre
          : d.producto_id && productoNombrePorId.get(d.producto_id) === nombre,
      )
    }
    // Ventas legacy sin detalle_venta
    if (tipo === "genetica") return v.genetica_id && geneticaNombrePorId.get(v.genetica_id) === nombre
    return false
  }

  const initialVentasFiltradas = ventas.filter((v) => {
    if (soloNoPagados && !(Number(v.saldo_pendiente || 0) > 0)) return false
    if (filtroSocio) {
      const nombreCompleto = `${v.socio?.nombre} ${v.socio?.apellido} ${v.socio?.dni}`.toLowerCase()
      if (!nombreCompleto.includes(filtroSocio.toLowerCase())) return false
    }
    if (!coincideConProducto(v)) return false
    return true
  })

  const totalVentas = initialVentasFiltradas.reduce((sum, v) => sum + Number(v.total), 0)
  const totalGramos = initialVentasFiltradas.reduce((sum, v) => {
    const info = getVentaInfo(v)
    return sum + info.gramos
  }, 0)
  // Efectivo/Transferencia usan ventas.metodo_pago (campo agregado, sincronizado
  // por las RPC de pago para el caso simple de "un solo método por venta").
  // Una venta con pagos parciales o de métodos distintos no queda representada
  // con exactitud por este único campo — para eso habría que sumar directo
  // desde `pagos`, fuera del alcance de esta corrección.
  const ventasEfectivo = initialVentasFiltradas
    .filter((v) => v.metodo_pago === "efectivo")
    .reduce((sum, v) => sum + Number(v.total), 0)
  const ventasTransferencia = initialVentasFiltradas
    .filter((v) => v.metodo_pago === "transferencia")
    .reduce((sum, v) => sum + Number(v.total), 0)
  // Pendiente se deriva de saldo_pendiente > 0 (no de metodo_pago === "pendiente"):
  // ver etapa 4B2, "pendiente" no es un método de pago real.
  const ventasPendientes = initialVentasFiltradas
    .filter((v) => Number(v.saldo_pendiente || 0) > 0)
    .reduce((sum, v) => sum + Number(v.saldo_pendiente || 0), 0)

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
            let detalleItemStr = ""
            if (detalle.genetica_id) {
              const gramosStr = detalle.gramos
                ? `${detalle.gramos}g x $${detalle.precio_unitario || 0}/g`
                : ""
              const enroladosStr = detalle.cantidad_enrolados
                ? `${detalle.cantidad_enrolados} enr. x $${detalle.precio_enrolado || 0}`
                : ""
              detalleItemStr = [gramosStr, enroladosStr].filter(Boolean).join(" + ")
            } else if (detalle.producto_id) {
              const cantidadProducto = detalle.cantidad_enrolados || 0
              const precioProducto = detalle.precio_unitario || 0
              detalleItemStr = `${cantidadProducto} x $${precioProducto}`
            }

            tableData.push([
              idx === 0 ? new Date(venta.created_at).toLocaleDateString("es-AR") : "",
              idx === 0 ? `${venta.socio?.apellido}, ${venta.socio?.nombre}` : "",
              idx === 0 ? (venta.socio?.dni ? formatDni(venta.socio.dni) : "-") : "",
              detalle.genetica?.nombre || detalle.producto?.nombre || "",
              detalleItemStr,
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
            venta.socio?.dni ? formatDni(venta.socio.dni) : "-",
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
        head: [["Fecha", "Socio", "DNI", "Item", "Detalle", "Pago", "Total"]],
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
          1: { cellWidth: 40 },
          2: { cellWidth: 20 },
          3: { cellWidth: 40 },
          4: { cellWidth: 50 },
          5: { cellWidth: 20 },
          6: { halign: "right", fontStyle: "bold", cellWidth: 25 },
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
      const rows: React.ReactNode[] = []

      venta.detalles.forEach((detalle, idx) => {
        if (detalle.genetica_id) {
          // Es una genética
          const pesoTotal = detalle.peso_enrolados || 0
          const cantEnrolados = detalle.cantidad_enrolados || 0
          const pesoPorEnrolado = cantEnrolados > 0 ? Math.round((pesoTotal / cantEnrolados) * 10) / 10 : 0
          const precioGramo = detalle.precio_unitario || 0
          const precioEnrolado = detalle.precio_enrolado || 0

          rows.push(
            <TableRow key={`${venta.id}-detail-${idx}`} className="bg-muted/30 border-l-4 border-l-primary">
              <TableCell></TableCell>
              <TableCell></TableCell>
              <TableCell className="font-medium text-foreground">{detalle.genetica?.nombre}</TableCell>
              <TableCell>
                <div className="flex flex-col gap-1">
                  {detalle.gramos > 0 && (
                    <div className="flex items-center gap-1 text-sm">
                      <Scale className="h-3 w-3 text-primary" />
                      <span>
                        {formatGramos(detalle.gramos)} x {formatCurrency(precioGramo)}/g
                      </span>
                    </div>
                  )}
                  {cantEnrolados > 0 && (
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <Cigarette className="h-3 w-3 text-accent" />
                      <span>
                        {cantEnrolados} enr. ({formatGramos(pesoPorEnrolado)} c/u) x {formatCurrency(precioEnrolado)}
                      </span>
                    </div>
                  )}
                </div>
              </TableCell>
              <TableCell></TableCell>
              <TableCell className="text-right text-muted-foreground tabular-nums">
                {formatCurrency(Number(detalle.subtotal || 0))}
              </TableCell>
              <TableCell></TableCell>
            </TableRow>,
          )
        } else if (detalle.producto_id) {
          // Es un producto
          const cantidadProducto = detalle.cantidad_enrolados || 0 // Reutilizamos este campo para cantidad
          const precioProducto = detalle.precio_unitario || 0

          rows.push(
            <TableRow key={`${venta.id}-detail-${idx}`} className="bg-muted/30 border-l-4 border-l-accent">
              <TableCell></TableCell>
              <TableCell></TableCell>
              <TableCell className="font-medium text-foreground">{detalle.producto?.nombre}</TableCell>
              <TableCell>
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <ShoppingCart className="h-3 w-3 text-accent" />
                  <span>
                    {cantidadProducto} x {formatCurrency(precioProducto)}
                  </span>
                </div>
              </TableCell>
              <TableCell></TableCell>
              <TableCell className="text-right text-muted-foreground tabular-nums">
                {formatCurrency(Number(detalle.subtotal || 0))}
              </TableCell>
              <TableCell></TableCell>
            </TableRow>,
          )
        }
      })

      if (venta.notas) {
        rows.push(
          <TableRow key={`${venta.id}-notas`} className="bg-muted/20 border-l-4 border-l-border">
            <TableCell colSpan={7} className="py-2">
              <div className="flex items-start gap-2 text-sm">
                <FileText className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div>
                  <span className="font-medium text-foreground">Nota:</span>{" "}
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
      const precioGramo = venta.precio_unitario || 0
      const precioEnrolado = venta.genetica?.precio_por_enrolado || 0

      const rows: React.ReactNode[] = [
        <TableRow key={`${venta.id}-legacy`} className="bg-muted/30 border-l-4 border-l-primary">
          <TableCell></TableCell>
          <TableCell></TableCell>
          <TableCell className="font-medium text-foreground">{venta.genetica?.nombre}</TableCell>
          <TableCell>
            <div className="flex flex-col gap-1">
              {gramos > 0 && (
                <div className="flex items-center gap-1 text-sm">
                  <Scale className="h-3 w-3 text-primary" />
                  <span>
                    {formatGramos(gramos)} x {formatCurrency(precioGramo)}/g
                  </span>
                </div>
              )}
              {enrolados > 0 && (
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <Cigarette className="h-3 w-3 text-accent" />
                  <span>
                    {enrolados} enr. ({formatGramos(pesoPorEnrolado)} c/u) x {formatCurrency(precioEnrolado)}
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
          <TableRow key={`${venta.id}-legacy-notas`} className="bg-muted/20 border-l-4 border-l-border">
            <TableCell colSpan={7} className="py-2">
              <div className="flex items-start gap-2 text-sm">
                <FileText className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div>
                  <span className="font-medium text-foreground">Nota:</span>{" "}
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
    if (soloNoPagados && !(Number(v.saldo_pendiente || 0) > 0)) return false
    if (filtroSocio) {
      const nombreCompleto = `${v.socio?.nombre} ${v.socio?.apellido} ${v.socio?.dni}`.toLowerCase()
      if (!nombreCompleto.includes(filtroSocio.toLowerCase())) return false
    }
    if (!coincideConProducto(v)) return false
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
        <DialogContent className="sm:max-w-md bg-card">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <Check className="h-6 w-6 text-primary" />
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
                    Total: <strong className="text-primary">{formatCurrency(Number(editingVenta.total))}</strong>
                  </p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Método de pago</label>
                  <Select
                    value={nuevoMetodoPago}
                    onValueChange={(value: "efectivo" | "transferencia") => setNuevoMetodoPago(value)}
                  >
                    <SelectTrigger className="bg-card">
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
            <Button variant="outline" onClick={() => setEditingVenta(null)} className="bg-card">
              Cancelar
            </Button>
            <Button
              onClick={handleUpdateMetodoPago}
              disabled={updatingPago}
                          >
              {updatingPago ? "Guardando..." : "Confirmar Pago"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog para corregir el método de un pago puntual (no toca la venta completa) */}
      <Dialog open={!!editingPagosVenta} onOpenChange={(open) => !open && cerrarCorreccionPagos()}>
        <DialogContent className="sm:max-w-md bg-card">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <ArrowLeftRight className="h-6 w-6 text-primary" />
              </div>
              <div>
                <DialogTitle className="text-foreground">Corregir Método de Pago</DialogTitle>
                <DialogDescription className="text-muted-foreground">
                  Corrige el método de un cobro puntual. No modifica el total, el saldo ni el resto de la venta.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="py-4 space-y-3">
            {editingPagosVenta && (
              <>
                <div className="bg-muted/50 rounded-lg p-3 space-y-1">
                  <p className="text-sm text-muted-foreground">
                    Socio:{" "}
                    <strong className="text-foreground">
                      {editingPagosVenta.socio?.apellido}, {editingPagosVenta.socio?.nombre}
                    </strong>
                  </p>
                </div>
                {(editingPagosVenta.pagos || []).length === 0 && (
                  <p className="text-sm text-muted-foreground">Esta venta no tiene pagos registrados para corregir.</p>
                )}
                {(editingPagosVenta.pagos || []).map((pago) => {
                  const valorSeleccionado = metodoPagoCorregido[pago.id] ?? pago.metodo_pago
                  return (
                    <div key={pago.id} className="flex items-center gap-2 p-3 rounded-lg border border-border">
                      <div className="flex-1 space-y-1">
                        <p className="text-xs text-muted-foreground">
                          {new Date(pago.fecha).toLocaleDateString("es-AR", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                          })}
                        </p>
                        <p className="text-sm font-medium text-foreground tabular-nums">
                          {formatCurrency(Number(pago.monto))}
                        </p>
                      </div>
                      <Select
                        value={valorSeleccionado}
                        onValueChange={(value: "efectivo" | "transferencia") =>
                          setMetodoPagoCorregido((prev) => ({ ...prev, [pago.id]: value }))
                        }
                        disabled={guardandoMetodoPagoId !== null}
                      >
                        <SelectTrigger className="w-[160px] bg-card">
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
                      <Button
                        size="sm"
                        disabled={guardandoMetodoPagoId !== null || valorSeleccionado === pago.metodo_pago}
                        onClick={() => handleCorregirMetodoPago(pago.id, valorSeleccionado)}
                                              >
                        {guardandoMetodoPagoId === pago.id ? "..." : "Guardar"}
                      </Button>
                    </div>
                  )
                })}
              </>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={cerrarCorreccionPagos}
              disabled={guardandoMetodoPagoId !== null}
              className="bg-card"
            >
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingFullVenta} onOpenChange={(open) => !open && setEditingFullVenta(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto bg-card">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <Pencil className="h-6 w-6 text-primary" />
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
                    <CalendarIcon className="mr-2 h-4 w-4 text-primary" />
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
                <SelectTrigger className="bg-card">
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
                <Label>Items</Label> {/* Changed from "Productos" to "Items" */}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={agregarLineaEdit}
                  className="h-8 text-xs border-primary/30 text-primary hover:bg-primary/5 bg-card"
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Agregar
                </Button>
              </div>

              {editLineas.map((linea, index) => {
                const genetica = geneticas.find((g) => g.id === linea.genetica_id)
                const producto = productos.find((p) => p.id === linea.producto_id)
                const isGenetica = !!linea.genetica_id
                const isProducto = !!linea.producto_id

                return (
                  <div key={index} className="p-3 rounded-lg bg-muted/50 border border-border space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Item {index + 1}</span>
                      {editLineas.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => eliminarLineaEdit(index)}
                          className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>

                    <Select
                      value={linea.genetica_id || linea.producto_id}
                      onValueChange={(value) => {
                        // Determinar si es genética o producto y actualizar todo en un
                        // único setEditLineas funcional: dos llamadas consecutivas a
                        // actualizarLineaEdit leerían el mismo estado ya cerrado y la
                        // segunda pisaría lo que hizo la primera. detalle_id se
                        // conserva (no se toca acá) para que editar_venta reconozca
                        // esto como "cambió el ítem de una línea existente" (clase B).
                        const esGenetica = geneticas.some((g) => g.id === value)
                        const esProducto = productos.some((p) => p.id === value)

                        setEditLineas((prev) =>
                          prev.map((l, i) => {
                            if (i !== index) return l
                            if (esGenetica) {
                              return {
                                ...l,
                                tipo: "genetica",
                                genetica_id: value,
                                producto_id: "",
                                cantidad_producto: 0,
                              }
                            }
                            if (esProducto) {
                              return {
                                ...l,
                                tipo: "producto",
                                producto_id: value,
                                genetica_id: "",
                                gramos: 0,
                                cantidad_enrolados: 0,
                                peso_por_enrolado: 0,
                              }
                            }
                            return l
                          }),
                        )
                      }}
                    >
                      <SelectTrigger className="bg-card">
                        <SelectValue placeholder="Seleccionar genética o producto" />
                      </SelectTrigger>
                      <SelectContent>
                        <div className="text-sm font-semibold text-muted-foreground px-2 py-1">Genéticas</div>
                        {geneticas.map((g) => (
                          <SelectItem key={g.id} value={g.id}>
                            {g.nombre} ({formatCurrency(g.precio_por_gramo)}/g)
                          </SelectItem>
                        ))}
                        <div className="text-sm font-semibold text-muted-foreground px-2 py-1 mt-2">Productos</div>
                        {productos.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.nombre} ({formatCurrency(p.precio)})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {isGenetica && (
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">Gramos</Label>
                          <Input
                            type="number"
                            step="0.1"
                            min="0"
                            value={linea.gramos || ""}
                            onChange={(e) => actualizarLineaEdit(index, "gramos", e.target.value)}
                            className="bg-card"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Enrolados</Label>
                          <Input
                            type="number"
                            min="0"
                            value={linea.cantidad_enrolados || ""}
                            onChange={(e) => actualizarLineaEdit(index, "cantidad_enrolados", e.target.value)}
                            className="bg-card"
                          />
                        </div>
                      </div>
                    )}

                    {isGenetica && linea.cantidad_enrolados > 0 && (
                      <div className="space-y-1">
                        <Label className="text-xs">Peso por enrolado (g)</Label>
                        <Input
                          type="number"
                          step="0.1"
                          min="0"
                          value={linea.peso_por_enrolado || ""}
                          onChange={(e) => actualizarLineaEdit(index, "peso_por_enrolado", e.target.value)}
                          className="bg-card"
                        />
                      </div>
                    )}

                    {isProducto && (
                      <div className="space-y-1">
                        <Label className="text-xs">Cantidad</Label>
                        <Input
                          type="number"
                          min="0"
                          value={linea.cantidad_producto || ""}
                          onChange={(e) => actualizarLineaEdit(index, "cantidad_producto", e.target.value)}
                          className="bg-card"
                        />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Notas */}
            <div className="space-y-2">
              <Label>Notas</Label>
              <Textarea
                value={editFormData.notas}
                onChange={(e) => setEditFormData({ ...editFormData, notas: e.target.value })}
                placeholder="Notas adicionales..."
                className="bg-card"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingFullVenta(null)} className="bg-card">
              Cancelar
            </Button>
            <Button onClick={handleSaveEdit} disabled={savingEdit} >
              {savingEdit ? "Guardando..." : "Guardar Cambios"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!ventaABorrar} onOpenChange={(open) => !open && setVentaABorrar(null)}>
        <AlertDialogContent className="bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              ¿Eliminar esta venta?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Se eliminará la venta y se devolverán los gramos/stock al inventario de
              las genéticas/productos correspondientes.
              {ventaABorrar && (
                <div className="mt-3 p-3 bg-muted rounded-lg text-sm">
                  <div>
                    <strong>Socio:</strong> {ventaABorrar.socio?.apellido}, {ventaABorrar.socio?.nombre}
                  </div>
                  <div>
                    <strong>Total:</strong> {formatCurrency(Number(ventaABorrar.total))}
                  </div>
                  {ventaABorrar.detalles && ventaABorrar.detalles.length > 0 ? (
                    <div>
                      <strong>Items a devolver:</strong> {ventaABorrar.detalles.length}
                    </div>
                  ) : (
                    <div>
                      <strong>Gramos a devolver:</strong> {formatGramos(ventaABorrar.gramos)}
                    </div>
                  )}
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-card">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteVenta}
              disabled={borrando}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {borrando ? "Eliminando..." : "Eliminar Venta"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Encabezado */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[26px] font-semibold leading-tight text-foreground">Historial de ventas</h1>
          {fechaDesde && fechaHasta && (
            <p className="text-sm text-muted-foreground">
              {format(fechaDesde, "dd/MM/yyyy")} – {format(fechaHasta, "dd/MM/yyyy")}
            </p>
          )}
        </div>
        <Button
          onClick={exportarPDF}
          variant="outline"
          className="bg-card"
          disabled={exportando || ventas.length === 0}
        >
          <FileDown className="h-4 w-4 mr-2" />
          {exportando ? "Exportando..." : "Exportar PDF"}
        </Button>
      </div>

      {/* Filtros compactos */}
      <Card className="bg-card border-border py-4">
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Desde</label>
              <Popover open={popoverDesdeOpen} onOpenChange={setPopoverDesdeOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start bg-card text-left font-normal",
                      !fechaDesde && "text-muted-foreground",
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4 text-primary" />
                    {fechaDesde ? format(fechaDesde, "dd/MM/yyyy") : <span>Seleccionar</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={fechaDesde}
                    onSelect={(date) => {
                      setFechaDesde(date)
                      setPopoverDesdeOpen(false)
                    }}
                    locale={es}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Hasta</label>
              <Popover open={popoverHastaOpen} onOpenChange={setPopoverHastaOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start bg-card text-left font-normal",
                      !fechaHasta && "text-muted-foreground",
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4 text-primary" />
                    {fechaHasta ? format(fechaHasta, "dd/MM/yyyy") : <span>Seleccionar</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={fechaHasta}
                    onSelect={(date) => {
                      setFechaHasta(date)
                      setPopoverHastaOpen(false)
                    }}
                    locale={es}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-foreground">Buscar Socio</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Nombre, apellido o DNI..."
                  value={filtroSocio}
                  onChange={(e) => setFiltroSocio(e.target.value)}
                  className="pl-10 bg-card"
                />
                {filtroSocio && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setFiltroSocio("")}
                    className="absolute right-1 top-1/2 transform -translate-y-1/2 h-7 w-7 p-0"
                    title="Limpiar búsqueda de socio"
                    aria-label="Limpiar búsqueda de socio"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-foreground">Producto</Label>
              <div className="flex gap-2">
                <Select
                  value={filtroProducto || "todos"}
                  onValueChange={(value) => setFiltroProducto(value === "todos" ? "" : value)}
                >
                  <SelectTrigger className="bg-card">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos los productos</SelectItem>
                    {Array.from(new Map(geneticas.map((g) => [normalizar(g.nombre), g.nombre])).values())
                      .sort((a, b) => a.localeCompare(b))
                      .map((nombre) => (
                        <SelectItem key={`genetica:${nombre}`} value={`genetica:${nombre}`}>
                          {nombre} (genética)
                        </SelectItem>
                      ))}
                    {Array.from(new Map(productos.map((p) => [normalizar(p.nombre), p.nombre])).values())
                      .sort((a, b) => a.localeCompare(b))
                      .map((nombre) => (
                        <SelectItem key={`producto:${nombre}`} value={`producto:${nombre}`}>
                          {nombre} (producto)
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                {filtroProducto && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setFiltroProducto("")}
                    className="h-9 w-9 p-0 shrink-0"
                    title="Limpiar filtro de producto"
                    aria-label="Limpiar filtro de producto"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                type="button"
                onClick={() => setSoloNoPagados(!soloNoPagados)}
                variant={soloNoPagados ? "default" : "outline"}
                className={cn(
                  "flex-1",
                  soloNoPagados
                    ? "bg-amber-600 hover:bg-amber-700 text-white border-amber-600"
                    : "bg-card border-amber-300 text-amber-700 hover:bg-amber-50",
                )}
              >
                <Filter className="h-4 w-4 mr-2" />
                {soloNoPagados ? "Pendientes" : "Ver pendientes"}
              </Button>
              <Button onClick={fetchVentas} disabled={loading} className="shrink-0">
                <Search className="h-4 w-4 mr-2" />
                {loading ? "..." : "Buscar"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Indicadores */}
      <div className="grid gap-3 md:grid-cols-5">
        <Card className="border-primary bg-primary text-primary-foreground shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-primary-foreground/70">Total ventas</CardTitle>
            <DollarSign className="h-4 w-4 text-primary-foreground/70" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">{formatCurrency(totalVentasFiltradas)}</div>
            <p className="text-xs text-primary-foreground/70">{ventasFiltradas.length} transacciones</p>
          </CardContent>
        </Card>

        <Card className="border-border bg-card py-4 shadow-none">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Gramos</CardTitle>
            <Package className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground tabular-nums">{formatGramos(totalGramosFiltradas)}</div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card py-4 shadow-none">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Efectivo</CardTitle>
            <Banknote className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground tabular-nums">{formatCurrency(ventasEfectivo)}</div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card py-4 shadow-none">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Transferencia</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground tabular-nums">
              {formatCurrency(ventasTransferencia)}
            </div>
          </CardContent>
        </Card>

        <Card className="border-amber-200 bg-amber-50 py-4 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-amber-800/70">Pendiente</CardTitle>
            <Clock className="h-4 w-4 text-amber-700" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-900 tabular-nums">{formatCurrency(ventasPendientes)}</div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card border-border gap-3">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <Package className="h-5 w-5 text-primary" />
            Detalle de Ventas
            {soloNoPagados && (
              <Badge variant="outline" className="ml-2 border-amber-300 text-amber-700">
                <Clock className="h-3 w-3 mr-1" />
                Solo Pendientes
              </Badge>
            )}
            {filtroSocio && (
              <Badge variant="outline" className="ml-2 border-primary/30 text-primary">
                Filtrado por: {filtroSocio}
              </Badge>
            )}
            {filtroProducto && (
              <Badge variant="outline" className="ml-2 border-primary/30 text-primary">
                Producto: {filtroProducto.slice(filtroProducto.indexOf(":") + 1)}
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
            <div className="rounded-md border border-border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-primary/10 hover:bg-primary/10"><TableHead className="text-foreground">Fecha</TableHead><TableHead className="text-foreground">Socio</TableHead><TableHead className="text-foreground">Item</TableHead><TableHead className="text-foreground">Detalle</TableHead><TableHead className="text-foreground">Pago</TableHead><TableHead className="text-right text-foreground">Total</TableHead><TableHead className="text-center text-foreground w-20">Acciones</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {ventasFiltradas.map((venta) => {
                    const info = getVentaInfo(venta)
                    const isExpanded = expandedVentas.has(venta.id)

                    return (
                      <React.Fragment key={venta.id}>
                        <TableRow className="hover:bg-muted/40 cursor-pointer" onClick={() => toggleExpand(venta.id)}>
                          <TableCell className="text-foreground">
                            <div className="flex flex-col">
                              <span>
                                {new Date(venta.created_at).toLocaleDateString("es-AR", {
                                  day: "2-digit",
                                  month: "2-digit",
                                  year: "numeric",
                                })}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {new Date(venta.created_at).toLocaleTimeString("es-AR", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                  hourCycle: "h23",
                                })}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="font-medium text-foreground">
                                {venta.socio?.apellido}, {venta.socio?.nombre}
                              </span>
                              <span className="text-xs text-muted-foreground select-text">
                                {venta.socio?.dni ? formatDni(venta.socio.dni) : "-"}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            {info.esMultiple ? (
                              <Badge variant="outline" className="border-primary/30 text-primary">
                                {info.genetica}
                              </Badge>
                            ) : (
                              <span className="text-foreground">{info.genetica}</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {/* Display aggregated detail string */}
                            <span className="text-foreground">{info.detalleString}</span>
                          </TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            {(() => {
                              const saldoPendiente = Number(venta.saldo_pendiente) || 0
                              const tieneDeuda = saldoPendiente > 0
                              
                              // Verificar pagos registrados en la tabla pagos
                              const pagosEfectivo = venta.pagos?.filter(p => p.metodo_pago === 'efectivo') || []
                              const pagosTransferencia = venta.pagos?.filter(p => p.metodo_pago === 'transferencia') || []
                              
                              // Si no hay pagos registrados en la tabla, usar el metodo_pago de la venta (ventas antiguas)
                              const tieneEfectivo = pagosEfectivo.length > 0 || ((!venta.pagos || venta.pagos.length === 0) && venta.metodo_pago === 'efectivo' && !tieneDeuda)
                              const tieneTransferencia = pagosTransferencia.length > 0 || ((!venta.pagos || venta.pagos.length === 0) && venta.metodo_pago === 'transferencia' && !tieneDeuda)

                              if (venta.metodo_pago === "pendiente" && saldoPendiente >= Number(venta.total)) {
                                return (
                                  <Badge
                                    variant="outline"
                                    className="border-amber-300 text-amber-700 cursor-pointer hover:bg-amber-50"
                                    onClick={() => {
                                      setEditingVenta(venta)
                                      setNuevoMetodoPago("efectivo")
                                    }}
                                  >
                                    <Clock className="h-3 w-3 mr-1" />
                                    Pendiente
                                  </Badge>
                                )
                              }

                              return (
                                <div className="flex flex-col gap-1.5">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    {tieneEfectivo && (
                                      <Badge variant="outline" className="border-primary/30 text-primary text-xs">
                                        <Banknote className="h-3 w-3 mr-1" />
                                        Efectivo
                                      </Badge>
                                    )}
                                    {tieneTransferencia && (
                                      <Badge variant="outline" className="text-xs">
                                        <CreditCard className="h-3 w-3 mr-1" />
                                        Transf.
                                      </Badge>
                                    )}
                                    {tieneTransferencia &&
                                      (venta.pagos && venta.pagos.some(p => p.comprobante_url) ? (
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-6 w-6 p-0 hover:bg-muted"
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            const pagoConComprobante = venta.pagos?.find(p => p.comprobante_url)
                                            if (pagoConComprobante?.comprobante_url) {
                                              setComprobanteUrl(pagoConComprobante.comprobante_url)
                                            }
                                          }}
                                          title="Ver comprobante"
                                          aria-label="Ver comprobante de transferencia"
                                        >
                                          <ImageIcon className="h-3 w-3 text-muted-foreground" />
                                        </Button>
                                      ) : (
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-6 w-6 p-0 hover:bg-muted"
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            setVentaParaComprobante(venta)
                                            document.getElementById('input-comprobante-historial')?.click()
                                          }}
                                          title="Cargar comprobante"
                                          aria-label="Cargar comprobante de transferencia"
                                        >
                                          <Upload className="h-3 w-3 text-muted-foreground" />
                                        </Button>
                                      ))}
                                    {venta.pagos && venta.pagos.length > 0 && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 w-6 p-0 hover:bg-muted"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          abrirCorreccionPagos(venta)
                                        }}
                                        title="Corregir método de un pago"
                                        aria-label="Corregir método de un pago"
                                      >
                                        <ArrowLeftRight className="h-3 w-3 text-muted-foreground" />
                                      </Button>
                                    )}
                                  </div>
                                  {tieneDeuda && (
                                    <Badge variant="outline" className="w-fit border-amber-300 bg-amber-50 text-amber-700 text-xs">
                                      <Clock className="h-3 w-3 mr-1" />
                                      Debe {formatCurrency(saldoPendiente)}
                                    </Badge>
                                  )}
                                </div>
                              )
                            })()}
                          </TableCell>
                          <TableCell className="text-right font-bold text-foreground tabular-nums">
                            {formatCurrency(Number(venta.total))}
                          </TableCell>
                          <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openEditVenta(venta)}
                                className="h-9 w-9 p-0 hover:bg-primary/10"
                                title="Editar venta"
                                aria-label="Editar venta"
                              >
                                <Pencil className="h-4 w-4 text-primary" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setVentaABorrar(venta)}
                                className="h-9 w-9 p-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                title="Eliminar venta"
                                aria-label="Eliminar venta"
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

      {/* Dialog para ver comprobante */}
      <Dialog open={!!comprobanteUrl} onOpenChange={(open) => !open && setComprobanteUrl(null)}>
        <DialogContent className="max-w-2xl bg-card">
          <DialogHeader>
            <DialogTitle>Comprobante de Transferencia</DialogTitle>
          </DialogHeader>
          <div className="flex justify-center">
            {comprobanteUrl && (
              <img
                src={comprobanteUrl || "/placeholder.svg"}
                alt="Comprobante de transferencia"
                className="max-h-[70vh] object-contain rounded-lg"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Input oculto para cargar comprobante */}
      <input
        type="file"
        id="input-comprobante-historial"
        accept="image/*"
        className="hidden"
        onChange={handleSubirComprobante}
        disabled={subiendoComprobante}
      />
    </div>
  )
}
