"use client"

import type React from "react"

import { useState, useEffect, useMemo } from "react"
import { createClient } from "@/lib/supabase/client"
import type { Gasto, CategoriaGasto, EnResultado, AporteCapital } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import {
  CalendarIcon,
  Plus,
  DollarSign,
  Pencil,
  Trash2,
  Tag,
  Banknote,
  CreditCard,
  FolderKanban,
  AlertTriangle,
  Check,
  X,
} from "lucide-react"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { cn } from "@/lib/utils"
import { ReclasificarGastosDialog } from "@/components/reclasificar-gastos-dialog"
import { formatCurrency, formatMoneda } from "@/lib/format"

const SIN_CLASIFICAR = "Sin clasificar"
const SIN_PROYECTO = "__sin_proyecto__"
const TODOS = "todos"

// Cómo cuenta cada categoría en el resultado del mes (scripts/069).
const EN_RESULTADO_LABEL: Record<EnResultado, string> = {
  resultado: "Cuenta en el resultado",
  inversion: "Aparte, como inversión",
  aparte: "No cuenta, aparte en Caja",
}

interface GastosManagerProps {
  /** Sólo la comisión crea, renombra o borra categorías. */
  esComision: boolean
}

type Aviso = { ok: boolean; texto: string } | null

function AvisoBox({ aviso, onClose }: { aviso: Aviso; onClose: () => void }) {
  if (!aviso) return null
  return (
    <div
      role={aviso.ok ? "status" : "alert"}
      className={cn(
        "flex items-start justify-between gap-3 rounded-lg border px-4 py-3 text-sm",
        aviso.ok ? "border-primary/30 bg-primary/5 text-foreground" : "border-red-200 bg-red-50 text-destructive",
      )}
    >
      <span>{aviso.texto}</span>
      <button type="button" onClick={onClose} aria-label="Cerrar aviso" className="shrink-0 opacity-70 hover:opacity-100">
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

export function GastosManager({ esComision }: GastosManagerProps) {
  const [gastos, setGastos] = useState<Gasto[]>([])
  const [categorias, setCategorias] = useState<CategoriaGasto[]>([])
  const [aportes, setAportes] = useState<AporteCapital[]>([])
  const [loading, setLoading] = useState(true)
  const [aviso, setAviso] = useState<Aviso>(null)
  const [showForm, setShowForm] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [showCategoriasDialog, setShowCategoriasDialog] = useState(false)
  const [editingGasto, setEditingGasto] = useState<Gasto | null>(null)
  const [mesSeleccionado, setMesSeleccionado] = useState<string>(TODOS)
  const [categoriaFiltro, setCategoriaFiltro] = useState<string>(TODOS)
  const [proyectoFiltro, setProyectoFiltro] = useState<string>(TODOS)
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set())
  const [categoriaLote, setCategoriaLote] = useState<string>("")
  const [aplicandoLote, setAplicandoLote] = useState(false)
  // Gastos sin clasificar que se recorren uno por uno (null = cerrado).
  const [reclasificando, setReclasificando] = useState<Gasto[] | null>(null)
  const [formData, setFormData] = useState({
    descripcion: "",
    monto: "",
    categoria: "",
    proyecto: "",
    aporte_id: "",
    metodo_pago: "efectivo" as "efectivo" | "transferencia",
    fecha: new Date(),
  })
  const supabase = createClient()

  useEffect(() => {
    fetchGastos()
    fetchCategorias()
    fetchAportes()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function fetchGastos() {
    setLoading(true)
    const { data, error } = await supabase
      .from("gastos")
      .select("*")
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false })

    if (error) {
      setAviso({ ok: false, texto: "No se pudieron cargar los gastos." })
    } else {
      setGastos(data || [])
    }
    setLoading(false)
  }

  async function fetchCategorias() {
    const { data } = await supabase.from("categorias_gasto").select("*").order("orden").order("nombre")
    if (data) setCategorias(data)
  }

  async function fetchAportes() {
    const { data } = await supabase.from("aportes_capital_resumen").select("*").order("fecha", { ascending: false })
    if (data) setAportes(data)
  }

  // Categorías que se ofrecen al cargar un gasto: "Sin clasificar" queda sólo
  // para los gastos viejos que todavía no se reclasificaron.
  const categoriasElegibles = categorias.filter((c) => c.nombre !== SIN_CLASIFICAR)
  const categoriaPorNombre = useMemo(() => new Map(categorias.map((c) => [c.nombre, c])), [categorias])
  // Una devolución necesita su aporte: no se reclasifica en lote a esas categorías.
  const categoriasLote = categoriasElegibles.filter((c) => c.en_resultado !== "aparte")
  const esDevolucion = (nombre: string) => categoriaPorNombre.get(nombre)?.en_resultado === "aparte"

  const proyectos = useMemo(() => {
    const set = new Set<string>()
    for (const g of gastos) if (g.proyecto) set.add(g.proyecto)
    return Array.from(set).sort((a, b) => a.localeCompare(b, "es"))
  }, [gastos])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)

    if (!formData.descripcion.trim() || !formData.monto) {
      setFormError("Completá la descripción y el monto.")
      return
    }
    if (!formData.categoria) {
      setFormError("Elegí una categoría.")
      return
    }
    const devolucion = esDevolucion(formData.categoria)
    if (devolucion && !formData.aporte_id) {
      setFormError("Elegí a qué aporte corresponde la devolución.")
      return
    }

    const gastoData = {
      descripcion: formData.descripcion.trim(),
      monto: Number.parseFloat(formData.monto),
      categoria: formData.categoria,
      proyecto: formData.proyecto.trim() || null,
      // La moneda la pone la base: la del aporte en una devolución, pesos en el resto.
      aporte_id: devolucion ? formData.aporte_id : null,
      metodo_pago: formData.metodo_pago,
      fecha: format(formData.fecha, "yyyy-MM-dd"),
    }

    const { error } = editingGasto
      ? await supabase.from("gastos").update(gastoData).eq("id", editingGasto.id)
      : await supabase.from("gastos").insert([gastoData])

    if (error) {
      setFormError(
        /^GA00\d$/.test(error.code || "")
          ? error.message
          : editingGasto
            ? "No se pudo actualizar el gasto."
            : "No se pudo registrar el gasto.",
      )
      return
    }
    setAviso({ ok: true, texto: editingGasto ? "Gasto actualizado." : "Gasto registrado." })
    resetForm()
    fetchGastos()
    if (devolucion || editingGasto?.aporte_id) fetchAportes()
  }

  function resetForm() {
    setFormData({
      descripcion: "",
      monto: "",
      categoria: "",
      proyecto: "",
      aporte_id: "",
      metodo_pago: "efectivo",
      fecha: new Date(),
    })
    setFormError(null)
    setShowForm(false)
    setEditingGasto(null)
  }

  function handleEdit(gasto: Gasto) {
    setEditingGasto(gasto)
    setFormData({
      descripcion: gasto.descripcion,
      monto: gasto.monto.toString(),
      // Un gasto sin clasificar obliga a elegir una categoría al editarlo.
      categoria: gasto.categoria === SIN_CLASIFICAR ? "" : gasto.categoria,
      proyecto: gasto.proyecto || "",
      aporte_id: gasto.aporte_id || "",
      metodo_pago: gasto.metodo_pago,
      fecha: new Date(gasto.fecha + "T00:00:00"),
    })
    setFormError(null)
    setShowForm(true)
  }

  async function handleDelete(id: string) {
    if (!confirm("¿Estás seguro de eliminar este gasto?")) return

    const { error } = await supabase.from("gastos").delete().eq("id", id)
    if (error) {
      setAviso({ ok: false, texto: "No se pudo eliminar el gasto." })
    } else {
      setAviso({ ok: true, texto: "Gasto eliminado." })
      setSeleccion((s) => {
        const n = new Set(s)
        n.delete(id)
        return n
      })
      fetchGastos()
    }
  }

  // Lista de meses disponibles (a partir de los gastos existentes)
  const mesesDisponibles = useMemo(() => {
    const set = new Set<string>()
    for (const g of gastos) {
      set.add(g.fecha.substring(0, 7)) // yyyy-MM
    }
    return Array.from(set).sort((a, b) => b.localeCompare(a))
  }, [gastos])

  const gastosFiltrados = useMemo(() => {
    return gastos.filter((g) => {
      if (mesSeleccionado !== TODOS && g.fecha.substring(0, 7) !== mesSeleccionado) return false
      if (categoriaFiltro !== TODOS && g.categoria !== categoriaFiltro) return false
      if (proyectoFiltro === SIN_PROYECTO && g.proyecto) return false
      if (proyectoFiltro !== TODOS && proyectoFiltro !== SIN_PROYECTO && g.proyecto !== proyectoFiltro) return false
      return true
    })
  }, [gastos, mesSeleccionado, categoriaFiltro, proyectoFiltro])

  // Los totales son en pesos; las devoluciones de aportes en dólares se suman aparte.
  const gastosPesos = gastosFiltrados.filter((g) => g.moneda !== "USD")
  const totalFiltrado = gastosPesos.reduce((sum, g) => sum + Number(g.monto), 0)
  const totalDolares = gastosFiltrados.filter((g) => g.moneda === "USD").reduce((sum, g) => sum + Number(g.monto), 0)

  // Total del período según cómo cuenta cada categoría en el resultado.
  const totalesPorTipo = useMemo(() => {
    const t: Record<EnResultado, number> = { resultado: 0, inversion: 0, aparte: 0 }
    for (const g of gastosPesos) {
      const tipo = categoriaPorNombre.get(g.categoria)?.en_resultado ?? "resultado"
      t[tipo] += Number(g.monto)
    }
    return t
  }, [gastosPesos, categoriaPorNombre])

  const totalesPorCategoria = useMemo(() => {
    const map = new Map<string, number>()
    for (const g of gastosPesos) {
      map.set(g.categoria, (map.get(g.categoria) || 0) + Number(g.monto))
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1])
  }, [gastosPesos])

  const totalesPorProyecto = useMemo(() => {
    const map = new Map<string, number>()
    for (const g of gastosPesos) {
      if (g.proyecto) map.set(g.proyecto, (map.get(g.proyecto) || 0) + Number(g.monto))
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1])
  }, [gastosPesos])

  const totalOtros = gastosPesos.filter((g) => g.categoria === "Otros").reduce((s, g) => s + Number(g.monto), 0)
  const porcentajeOtros = totalesPorTipo.resultado > 0 ? (totalOtros / totalesPorTipo.resultado) * 100 : 0
  const cantidadSinClasificar = gastos.filter((g) => g.categoria === SIN_CLASIFICAR).length

  const idsVisibles = gastosFiltrados.map((g) => g.id)
  const todosSeleccionados = idsVisibles.length > 0 && idsVisibles.every((id) => seleccion.has(id))

  function toggleSeleccion(id: string) {
    setSeleccion((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  function toggleTodos() {
    setSeleccion(todosSeleccionados ? new Set() : new Set(idsVisibles))
  }

  async function reclasificarSeleccion() {
    if (!categoriaLote || seleccion.size === 0) return
    const ids = Array.from(seleccion)
    if (gastos.some((g) => seleccion.has(g.id) && g.aporte_id)) {
      setAviso({
        ok: false,
        texto: "La selección incluye devoluciones de aportes: esas se cambian una por una con Editar.",
      })
      return
    }
    setAplicandoLote(true)
    const { error } = await supabase.from("gastos").update({ categoria: categoriaLote }).in("id", ids)
    setAplicandoLote(false)
    if (error) {
      setAviso({ ok: false, texto: "No se pudieron reclasificar los gastos." })
      return
    }
    setAviso({
      ok: true,
      texto: `${ids.length} ${ids.length === 1 ? "gasto pasó" : "gastos pasaron"} a ${categoriaLote}.`,
    })
    setSeleccion(new Set())
    setCategoriaLote("")
    fetchGastos()
  }

  function nombreMes(ym: string) {
    const [y, m] = ym.split("-")
    return format(new Date(Number(y), Number(m) - 1, 1), "MMMM yyyy", { locale: es })
  }

  const etiquetaPeriodo = [
    mesSeleccionado === TODOS ? "Todos los meses" : nombreMes(mesSeleccionado),
    categoriaFiltro !== TODOS ? categoriaFiltro : null,
    proyectoFiltro === SIN_PROYECTO ? "Sin proyecto" : proyectoFiltro !== TODOS ? `Proyecto ${proyectoFiltro}` : null,
  ]
    .filter(Boolean)
    .join(" · ")

  const categoriaSeleccionada = categoriaPorNombre.get(formData.categoria)
  const aporteSeleccionado =
    categoriaSeleccionada?.en_resultado === "aparte" ? aportes.find((a) => a.id === formData.aporte_id) : undefined

  const renderCategoriaYProyecto = (gasto: Gasto) => (
    <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
      <span className={cn(gasto.categoria === SIN_CLASIFICAR && "font-medium text-amber-700")}>{gasto.categoria}</span>
      {gasto.proyecto && (
        <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-accent-foreground">
          <FolderKanban className="h-3 w-3" />
          {gasto.proyecto}
        </span>
      )}
    </span>
  )

  const renderAcciones = (gasto: Gasto) => (
    <>
      <Button
        size="icon"
        variant="ghost"
        className="text-primary"
        title="Editar gasto"
        aria-label={`Editar gasto: ${gasto.descripcion}`}
        onClick={() => handleEdit(gasto)}
      >
        <Pencil className="h-4 w-4" />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        className="text-red-600 hover:text-red-700"
        title="Eliminar gasto"
        aria-label={`Eliminar gasto: ${gasto.descripcion}`}
        onClick={() => handleDelete(gasto.id)}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </>
  )

  return (
    <div className="min-w-0 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Gastos</h2>
          <p className="text-muted-foreground">Registrá y administrá los gastos de la asociación</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button className="bg-card" variant="outline" onClick={() => setShowCategoriasDialog(true)}>
            <Tag className="h-4 w-4 mr-2" />
            Categorías
          </Button>
          <Button onClick={() => setShowForm(true)} className="bg-primary text-primary-foreground hover:bg-primary/90">
            <Plus className="h-4 w-4 mr-2" />
            Nuevo gasto
          </Button>
        </div>
      </div>

      <AvisoBox aviso={aviso} onClose={() => setAviso(null)} />

      {cantidadSinClasificar > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {cantidadSinClasificar} {cantidadSinClasificar === 1 ? "gasto está" : "gastos están"} sin clasificar.
          </span>
          <Button
            size="sm"
            className="bg-amber-600 text-white hover:bg-amber-700"
            onClick={() => setReclasificando(gastos.filter((g) => g.categoria === SIN_CLASIFICAR))}
          >
            Reclasificar uno por uno
          </Button>
        </div>
      )}

      {/* Filtros */}
      <div className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="filtro-mes">Período</Label>
          <Select value={mesSeleccionado} onValueChange={setMesSeleccionado}>
            <SelectTrigger id="filtro-mes" className="w-full bg-white capitalize">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="monarca-theme">
              <SelectItem value={TODOS}>Todos los meses</SelectItem>
              {mesesDisponibles.map((ym) => (
                <SelectItem key={ym} value={ym} className="capitalize">
                  {nombreMes(ym)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="filtro-categoria">Categoría</Label>
          <Select value={categoriaFiltro} onValueChange={setCategoriaFiltro}>
            <SelectTrigger id="filtro-categoria" className="w-full bg-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="monarca-theme">
              <SelectItem value={TODOS}>Todas las categorías</SelectItem>
              {categorias.map((cat) => (
                <SelectItem key={cat.id} value={cat.nombre}>
                  {cat.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="filtro-proyecto">Proyecto</Label>
          <Select value={proyectoFiltro} onValueChange={setProyectoFiltro}>
            <SelectTrigger id="filtro-proyecto" className="w-full bg-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="monarca-theme">
              <SelectItem value={TODOS}>Todos</SelectItem>
              <SelectItem value={SIN_PROYECTO}>Sin proyecto</SelectItem>
              {proyectos.map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Resumen y distribución del período seleccionado */}
      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <Card className="min-w-0 justify-center gap-3 border-primary bg-primary text-primary-foreground">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-primary-foreground/80">
              <DollarSign className="h-4 w-4" />
              Total de gastos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="break-words text-3xl font-semibold tabular-nums">
              {loading ? "—" : formatCurrency(totalFiltrado)}
            </div>
            <p className="mt-2 text-sm text-primary-foreground/80">
              {loading
                ? "Cargando gastos…"
                : `${gastosFiltrados.length} ${gastosFiltrados.length === 1 ? "gasto registrado" : "gastos registrados"}`}
            </p>
            <p className="mt-1 text-xs capitalize text-primary-foreground/80">{etiquetaPeriodo}</p>
            {!loading && (
              <dl className="mt-4 space-y-1 border-t border-primary-foreground/20 pt-3 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-primary-foreground/80">Gastos del resultado</dt>
                  <dd className="font-medium tabular-nums">{formatCurrency(totalesPorTipo.resultado)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-primary-foreground/80">Inversión (equipamiento)</dt>
                  <dd className="font-medium tabular-nums">{formatCurrency(totalesPorTipo.inversion)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-primary-foreground/80">Devolución de aportes</dt>
                  <dd className="font-medium tabular-nums">{formatCurrency(totalesPorTipo.aparte)}</dd>
                </div>
                {totalDolares > 0 && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-primary-foreground/80">Devolución de aportes en dólares</dt>
                    <dd className="font-medium tabular-nums">{formatMoneda(totalDolares, "USD")}</dd>
                  </div>
                )}
              </dl>
            )}
          </CardContent>
        </Card>
        <Card className="min-w-0 gap-4 bg-card">
          <CardHeader>
            <CardTitle className="text-base">Distribución por categoría</CardTitle>
          </CardHeader>
          <CardContent className="max-h-80 space-y-4 overflow-y-auto">
            {porcentajeOtros > 5 && (
              <p className="flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                &quot;Otros&quot; es el {porcentajeOtros.toFixed(1)} % de los gastos del resultado: debería quedar por
                debajo del 5 %.
              </p>
            )}
            {loading ? (
              <p className="text-sm text-muted-foreground">Cargando categorías…</p>
            ) : totalesPorCategoria.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin gastos en este período</p>
            ) : (
              totalesPorCategoria.map(([cat, monto]) => {
                const tipo = categoriaPorNombre.get(cat)?.en_resultado ?? "resultado"
                return (
                  <div key={cat} className="space-y-2">
                    <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                      <button
                        type="button"
                        className="text-left font-medium hover:underline"
                        onClick={() => setCategoriaFiltro(cat)}
                        title={`Ver sólo ${cat}`}
                      >
                        {cat}
                        {tipo !== "resultado" && (
                          <span className="ml-2 text-xs font-normal text-muted-foreground">
                            {tipo === "inversion" ? "inversión" : "aparte"}
                          </span>
                        )}
                      </button>
                      <span className="font-semibold tabular-nums">{formatCurrency(monto)}</span>
                    </div>
                    <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-primary/10">
                      <div
                        className={cn("h-full rounded-full", cat === SIN_CLASIFICAR ? "bg-amber-400" : "bg-primary/65")}
                        style={{
                          width: `${totalFiltrado > 0 ? Math.max(0, Math.min(100, (monto / totalFiltrado) * 100)) : 0}%`,
                        }}
                      />
                    </div>
                  </div>
                )
              })
            )}
            {totalesPorProyecto.length > 0 && (
              <div className="space-y-2 border-t pt-3">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                  <FolderKanban className="h-4 w-4 text-primary" />
                  Por proyecto
                </p>
                {totalesPorProyecto.map(([proyecto, monto]) => (
                  <div key={proyecto} className="flex items-baseline justify-between gap-2 text-sm">
                    <button
                      type="button"
                      className="text-left hover:underline"
                      onClick={() => setProyectoFiltro(proyecto)}
                      title={`Ver sólo el proyecto ${proyecto}`}
                    >
                      {proyecto}
                    </button>
                    <span className="font-semibold tabular-nums">{formatCurrency(monto)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {reclasificando && (
        <ReclasificarGastosDialog
          gastos={reclasificando}
          categorias={categoriasElegibles}
          aportes={aportes}
          onClose={(huboCambios) => {
            setReclasificando(null)
            if (huboCambios) {
              fetchGastos()
              fetchAportes()
            }
          }}
        />
      )}

      {showCategoriasDialog && (
        <CategoriasDialog
          categorias={categorias}
          esComision={esComision}
          onClose={() => setShowCategoriasDialog(false)}
          onCambio={() => {
            fetchCategorias()
            fetchGastos()
          }}
        />
      )}

      {/* Dialog nuevo/editar gasto */}
      <Dialog open={showForm} onOpenChange={(open) => (open ? setShowForm(true) : resetForm())}>
        <DialogContent className="monarca-theme flex w-[calc(100%-2rem)] max-h-[90dvh] flex-col gap-0 overflow-hidden bg-white p-0 sm:max-w-[800px]">
          <DialogHeader className="shrink-0 border-b bg-white p-5 pr-12 text-left">
            <DialogTitle>{editingGasto ? "Editar gasto" : "Nuevo gasto"}</DialogTitle>
            <DialogDescription>Completá el detalle, el importe y cómo se pagó.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="flex min-h-0 flex-col overflow-hidden">
            <div className="grid min-h-0 gap-6 overflow-y-auto bg-background/50 p-5 sm:p-6 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div className="min-w-0 space-y-4">
                <h3 className="text-sm font-semibold text-primary">Detalle del gasto</h3>
                <div className="space-y-2">
                  <Label htmlFor="fecha">Fecha del Gasto</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" id="fecha" className="w-full justify-start bg-white text-left font-normal">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {format(formData.fecha, "PPP", { locale: es })}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="monarca-theme w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={formData.fecha}
                        onSelect={(date) => date && setFormData({ ...formData, fecha: date })}
                        locale={es}
                        disabled={(date) => date > new Date()}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="categoria">Categoría</Label>
                  <Select
                    value={formData.categoria}
                    onValueChange={(value) => setFormData({ ...formData, categoria: value })}
                  >
                    <SelectTrigger id="categoria" className="w-full bg-white">
                      <SelectValue placeholder="Seleccionar categoría" />
                    </SelectTrigger>
                    <SelectContent className="monarca-theme">
                      {categoriasElegibles.map((cat) => (
                        <SelectItem key={cat.id} value={cat.nombre}>
                          {cat.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {categoriaSeleccionada?.en_resultado === "aparte" && (
                    <div className="space-y-2 rounded-lg border border-primary/20 bg-primary/5 p-3">
                      <Label htmlFor="aporte">Aporte que se devuelve</Label>
                      <Select
                        value={formData.aporte_id}
                        onValueChange={(value) => setFormData({ ...formData, aporte_id: value })}
                      >
                        <SelectTrigger id="aporte" className="w-full bg-white">
                          <SelectValue placeholder="Seleccionar aporte" />
                        </SelectTrigger>
                        <SelectContent className="monarca-theme">
                          {aportes
                            .filter((a) => Number(a.saldo) > 0 || a.id === formData.aporte_id)
                            .map((a) => (
                              <SelectItem key={a.id} value={a.id}>
                                {a.aportante} · saldo {formatMoneda(Number(a.saldo), a.moneda)}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      {aportes.length === 0 && (
                        <p className="text-xs text-muted-foreground">
                          No hay aportes cargados: la comisión los carga en Aportes de capital.
                        </p>
                      )}
                    </div>
                  )}
                  {categoriaSeleccionada?.descripcion && (
                    <p className="text-xs text-muted-foreground">
                      {categoriaSeleccionada.descripcion}
                      {categoriaSeleccionada.en_resultado !== "resultado" &&
                        ` · ${EN_RESULTADO_LABEL[categoriaSeleccionada.en_resultado]}`}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="descripcion">Descripción</Label>
                  <Textarea
                    id="descripcion"
                    className="min-h-24 bg-white"
                    placeholder="Ej: Luz de la sede, sustrato, contador..."
                    value={formData.descripcion}
                    onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="proyecto">Proyecto (opcional)</Label>
                  <Input
                    id="proyecto"
                    list="proyectos-existentes"
                    className="bg-white"
                    placeholder="Ej: Sala nueva"
                    value={formData.proyecto}
                    onChange={(e) => setFormData({ ...formData, proyecto: e.target.value })}
                  />
                  <datalist id="proyectos-existentes">
                    {proyectos.map((p) => (
                      <option key={p} value={p} />
                    ))}
                  </datalist>
                </div>
              </div>
              <div className="min-w-0 space-y-4 self-start rounded-xl border border-primary/15 bg-primary/5 p-4">
                <h3 className="text-sm font-semibold text-primary">Importe y pago</h3>
                <div className="space-y-2">
                  <Label htmlFor="monto">
                    Monto ({aporteSeleccionado?.moneda === "USD" ? "US$" : "$"})
                  </Label>
                  <Input
                    id="monto"
                    className="h-12 bg-white text-xl font-semibold tabular-nums"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={formData.monto}
                    onChange={(e) => setFormData({ ...formData, monto: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="metodo_pago">Método de Pago</Label>
                  <Select
                    value={formData.metodo_pago}
                    onValueChange={(value: "efectivo" | "transferencia") =>
                      setFormData({ ...formData, metodo_pago: value })
                    }
                  >
                    <SelectTrigger id="metodo_pago" className="w-full bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="monarca-theme">
                      <SelectItem value="efectivo">Efectivo</SelectItem>
                      <SelectItem value="transferencia">Transferencia</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t bg-white p-4">
              {formError && <p className="mr-auto text-sm text-destructive">{formError}</p>}
              <Button type="button" variant="outline" onClick={resetForm}>
                Cancelar
              </Button>
              <Button type="submit">{editingGasto ? "Guardar cambios" : "Registrar gasto"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Card className="min-w-0 gap-4 bg-card">
        <CardHeader>
          <CardTitle className="text-base">Historial de gastos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {seleccion.size > 0 && (
            <div className="flex flex-col gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3 sm:flex-row sm:items-center">
              <span className="text-sm font-medium">
                {seleccion.size} {seleccion.size === 1 ? "gasto seleccionado" : "gastos seleccionados"}
              </span>
              <div className="flex flex-1 flex-wrap items-center gap-2 sm:justify-end">
                <Select value={categoriaLote} onValueChange={setCategoriaLote}>
                  <SelectTrigger aria-label="Nueva categoría para los seleccionados" className="w-full bg-white sm:w-64">
                    <SelectValue placeholder="Pasar a categoría…" />
                  </SelectTrigger>
                  <SelectContent className="monarca-theme">
                    {categoriasLote.map((cat) => (
                      <SelectItem key={cat.id} value={cat.nombre}>
                        {cat.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button onClick={reclasificarSeleccion} disabled={!categoriaLote || aplicandoLote}>
                  {aplicandoLote ? "Reclasificando…" : "Reclasificar"}
                </Button>
                <Button variant="ghost" onClick={() => setSeleccion(new Set())}>
                  Cancelar
                </Button>
              </div>
            </div>
          )}

          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Cargando gastos...</div>
          ) : gastosFiltrados.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No hay gastos con estos filtros</div>
          ) : (
            <>
              {/* Desktop/tablet: tabla completa. */}
              <div className="hidden sm:block min-w-0 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-primary/10 hover:bg-primary/10">
                      <TableHead className="w-10">
                        <Checkbox
                          checked={todosSeleccionados}
                          onCheckedChange={toggleTodos}
                          aria-label="Seleccionar todos los gastos visibles"
                        />
                      </TableHead>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Descripción</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                      <TableHead>Método de Pago</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {gastosFiltrados.map((gasto) => (
                      <TableRow
                        key={gasto.id}
                        data-state={seleccion.has(gasto.id) ? "selected" : undefined}
                        className="hover:bg-primary/5"
                      >
                        <TableCell>
                          <Checkbox
                            checked={seleccion.has(gasto.id)}
                            onCheckedChange={() => toggleSeleccion(gasto.id)}
                            aria-label={`Seleccionar gasto: ${gasto.descripcion}`}
                          />
                        </TableCell>
                        <TableCell>{format(new Date(gasto.fecha + "T00:00:00"), "dd/MM/yyyy", { locale: es })}</TableCell>
                        <TableCell className="min-w-48 max-w-sm whitespace-normal">
                          <p className="font-medium">{gasto.descripcion}</p>
                          {renderCategoriaYProyecto(gasto)}
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">
                          {formatMoneda(Number(gasto.monto), gasto.moneda)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="gap-1.5 border-primary/20 bg-primary/5 font-normal text-primary">
                            {gasto.metodo_pago === "efectivo" ? (
                              <Banknote className="h-3.5 w-3.5" />
                            ) : (
                              <CreditCard className="h-3.5 w-3.5" />
                            )}
                            {gasto.metodo_pago === "efectivo" ? "Efectivo" : "Transferencia"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            {renderAcciones(gasto)}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile (<sm): tarjetas apiladas en vez de la tabla. */}
              <div className="sm:hidden space-y-3">
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Checkbox checked={todosSeleccionados} onCheckedChange={toggleTodos} />
                  Seleccionar todos
                </label>
                {gastosFiltrados.map((gasto) => (
                  <div
                    key={gasto.id}
                    className={cn(
                      "rounded-lg border border-border p-3",
                      seleccion.has(gasto.id) && "border-primary/40 bg-primary/5",
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <Checkbox
                        className="mt-1"
                        checked={seleccion.has(gasto.id)}
                        onCheckedChange={() => toggleSeleccion(gasto.id)}
                        aria-label={`Seleccionar gasto: ${gasto.descripcion}`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate font-medium">{gasto.descripcion}</p>
                            <p className="text-xs text-muted-foreground">
                              {format(new Date(gasto.fecha + "T00:00:00"), "dd/MM/yyyy", { locale: es })}
                            </p>
                            {renderCategoriaYProyecto(gasto)}
                          </div>
                          <p className="shrink-0 font-semibold tabular-nums">{formatMoneda(Number(gasto.monto), gasto.moneda)}</p>
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <Badge variant="outline" className="gap-1.5 border-primary/20 bg-primary/5 font-normal text-primary">
                            {gasto.metodo_pago === "efectivo" ? (
                              <Banknote className="h-3.5 w-3.5" />
                            ) : (
                              <CreditCard className="h-3.5 w-3.5" />
                            )}
                            {gasto.metodo_pago === "efectivo" ? "Efectivo" : "Transferencia"}
                          </Badge>
                          <div className="flex shrink-0 gap-1">
                            {renderAcciones(gasto)}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// Gestión de categorías: la comisión agrega, renombra y borra; el resto ve
// la lista con qué entra en cada una.
function CategoriasDialog({
  categorias,
  esComision,
  onClose,
  onCambio,
}: {
  categorias: CategoriaGasto[]
  esComision: boolean
  onClose: () => void
  onCambio: () => void
}) {
  const supabase = createClient()
  const [nuevo, setNuevo] = useState({ nombre: "", descripcion: "", en_resultado: "resultado" as EnResultado })
  const [editando, setEditando] = useState<{ id: string; nombre: string; descripcion: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function agregar() {
    setError(null)
    const nombre = nuevo.nombre.trim()
    if (!nombre) return
    const { error: dbError } = await supabase.from("categorias_gasto").insert([
      {
        nombre,
        descripcion: nuevo.descripcion.trim() || null,
        en_resultado: nuevo.en_resultado,
        orden: Math.max(0, ...categorias.filter((c) => c.nombre !== SIN_CLASIFICAR).map((c) => c.orden)) + 5,
      },
    ])
    if (dbError) {
      setError(dbError.code === "23505" ? "Ya existe una categoría con ese nombre." : "No se pudo agregar la categoría.")
      return
    }
    setNuevo({ nombre: "", descripcion: "", en_resultado: "resultado" })
    onCambio()
  }

  async function guardarEdicion() {
    if (!editando) return
    setError(null)
    const nombre = editando.nombre.trim()
    if (!nombre) return
    const { error: dbError } = await supabase
      .from("categorias_gasto")
      .update({ nombre, descripcion: editando.descripcion.trim() || null })
      .eq("id", editando.id)
    if (dbError) {
      setError(dbError.code === "23505" ? "Ya existe una categoría con ese nombre." : "No se pudo guardar la categoría.")
      return
    }
    setEditando(null)
    onCambio()
  }

  async function eliminar(cat: CategoriaGasto) {
    setError(null)
    if (!confirm(`¿Eliminar la categoría "${cat.nombre}"?`)) return
    const { error: dbError } = await supabase.from("categorias_gasto").delete().eq("id", cat.id)
    if (dbError) {
      setError(
        dbError.code === "23503"
          ? `"${cat.nombre}" tiene gastos cargados: reclasificalos a otra categoría antes de eliminarla.`
          : "No se pudo eliminar la categoría.",
      )
      return
    }
    onCambio()
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="monarca-theme max-h-[90dvh] overflow-y-auto bg-white sm:max-w-[620px]">
        <DialogHeader>
          <DialogTitle>Categorías de gastos</DialogTitle>
          <DialogDescription>
            {esComision
              ? "Qué entra en cada categoría y cómo cuenta en el resultado del mes."
              : "Qué entra en cada categoría. Sólo la comisión directiva puede cambiar la lista."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-destructive">{error}</p>}

          <div className="space-y-2">
            {categorias.map((cat) =>
              editando?.id === cat.id ? (
                <div key={cat.id} className="space-y-2 rounded-lg border border-primary/40 bg-white p-3">
                  <Input
                    aria-label="Nombre de la categoría"
                    className="bg-white"
                    value={editando.nombre}
                    onChange={(e) => setEditando({ ...editando, nombre: e.target.value })}
                  />
                  <Input
                    aria-label="Qué entra en la categoría"
                    className="bg-white"
                    placeholder="Qué entra"
                    value={editando.descripcion}
                    onChange={(e) => setEditando({ ...editando, descripcion: e.target.value })}
                  />
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setEditando(null)}>
                      Cancelar
                    </Button>
                    <Button size="sm" onClick={guardarEdicion}>
                      <Check className="h-4 w-4" /> Guardar
                    </Button>
                  </div>
                </div>
              ) : (
                <div
                  key={cat.id}
                  className="flex items-start justify-between gap-3 rounded-lg border bg-primary/5 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{cat.nombre}</p>
                    {cat.descripcion && <p className="text-xs text-muted-foreground">{cat.descripcion}</p>}
                    <p className="text-xs text-muted-foreground">{EN_RESULTADO_LABEL[cat.en_resultado]}</p>
                  </div>
                  {esComision && cat.nombre !== SIN_CLASIFICAR && (
                    <div className="flex shrink-0 gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-primary"
                        aria-label={`Editar categoría ${cat.nombre}`}
                        title={`Editar categoría ${cat.nombre}`}
                        onClick={() =>
                          setEditando({ id: cat.id, nombre: cat.nombre, descripcion: cat.descripcion || "" })
                        }
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-red-600 hover:text-red-700"
                        aria-label={`Eliminar categoría ${cat.nombre}`}
                        title={`Eliminar categoría ${cat.nombre}`}
                        onClick={() => eliminar(cat)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              ),
            )}
            {categorias.length === 0 && <p className="text-sm text-muted-foreground text-center py-2">No hay categorías</p>}
          </div>

          {esComision && (
            <div className="space-y-2 rounded-lg border p-3">
              <p className="text-sm font-semibold text-primary">Nueva categoría</p>
              <Input
                aria-label="Nombre de la nueva categoría"
                className="bg-white"
                placeholder="Nombre"
                value={nuevo.nombre}
                onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })}
              />
              <Input
                aria-label="Qué entra en la nueva categoría"
                className="bg-white"
                placeholder="Qué entra (opcional)"
                value={nuevo.descripcion}
                onChange={(e) => setNuevo({ ...nuevo, descripcion: e.target.value })}
              />
              <div className="flex flex-col gap-2 sm:flex-row">
                <Select
                  value={nuevo.en_resultado}
                  onValueChange={(v: EnResultado) => setNuevo({ ...nuevo, en_resultado: v })}
                >
                  <SelectTrigger aria-label="Cómo cuenta en el resultado" className="w-full bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="monarca-theme">
                    {(Object.keys(EN_RESULTADO_LABEL) as EnResultado[]).map((k) => (
                      <SelectItem key={k} value={k}>
                        {EN_RESULTADO_LABEL[k]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button onClick={agregar} disabled={!nuevo.nombre.trim()}>
                  <Plus className="h-4 w-4" /> Agregar
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
