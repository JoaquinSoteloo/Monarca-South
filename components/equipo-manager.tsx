"use client"

/**
 * Retribuciones del equipo (scripts/072). Cada persona tiene su retribución
 * mensual y si la cobra en dinero o en producto. "Liquidar" carga cuánta
 * plata y/o cuántos gramos sueltos y enrolados se le dan: el producto se
 * valora al precio staff de la genética y sale de su stock. Lo que no se
 * retira queda pendiente en ese mes y se liquida después.
 */
import type React from "react"
import { useEffect, useMemo, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import type { Genetica, LiquidacionEquipo, MiembroEquipo } from "@/lib/types"
import { formatCurrency, formatGramos } from "@/lib/format"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Banknote, Leaf, Pencil, Plus, Undo2, Users, Wallet, X } from "lucide-react"
import { format } from "date-fns"
import { es } from "date-fns/locale"

type Aviso = { ok: boolean; texto: string } | null

function hoy() {
  return format(new Date(), "yyyy-MM-dd")
}

function mesActual() {
  return format(new Date(), "yyyy-MM-01")
}

function nombreMes(periodo: string) {
  const [y, m] = periodo.split("-")
  return format(new Date(Number(y), Number(m) - 1, 1), "MMMM yyyy", { locale: es })
}

function fechaCorta(iso: string) {
  const [y, m, d] = iso.split("-")
  return `${d}/${m}/${y}`
}

/** Meses desde `desde` hasta el actual, del más reciente al más viejo (yyyy-mm-01). */
function mesesDesde(desde: string) {
  const meses: string[] = []
  const [y0, m0] = desde.split("-").map(Number)
  const fin = mesActual()
  let y = y0
  let m = m0
  for (let guard = 0; guard < 240; guard++) {
    const p = `${y}-${String(m).padStart(2, "0")}-01`
    if (p > fin) break
    meses.push(p)
    m++
    if (m > 12) {
      m = 1
      y++
    }
  }
  return meses.reverse()
}

function mensajeError(error: { code?: string; message: string }, generico: string) {
  return /^EQ00\d$/.test(error.code || "") ? error.message : generico
}

export function EquipoManager() {
  const supabase = createClient()
  const [equipo, setEquipo] = useState<MiembroEquipo[]>([])
  const [liquidaciones, setLiquidaciones] = useState<LiquidacionEquipo[]>([])
  const [geneticas, setGeneticas] = useState<Genetica[]>([])
  const [loading, setLoading] = useState(true)
  const [aviso, setAviso] = useState<Aviso>(null)
  const [editando, setEditando] = useState<MiembroEquipo | "nuevo" | null>(null)
  const [liquidando, setLiquidando] = useState<MiembroEquipo | null>(null)
  const [historial, setHistorial] = useState<MiembroEquipo | null>(null)

  async function cargar() {
    const [equipoResult, liqResult, genResult] = await Promise.all([
      supabase.from("equipo").select("*").order("activo", { ascending: false }).order("nombre"),
      supabase.from("liquidaciones_equipo").select("*").order("fecha", { ascending: false }).order("created_at", { ascending: false }),
      supabase.from("geneticas").select("*").eq("activo", true).order("nombre"),
    ])
    if (equipoResult.error || liqResult.error) {
      setAviso({ ok: false, texto: "No se pudo cargar el equipo." })
    } else {
      setEquipo(equipoResult.data || [])
      setLiquidaciones(liqResult.data || [])
    }
    setGeneticas(genResult.data || [])
    setLoading(false)
  }

  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Liquidado por persona y mes: "miembro|yyyy-mm-01" -> total.
  const liquidadoPorMes = useMemo(() => {
    const map = new Map<string, number>()
    for (const l of liquidaciones) {
      const k = `${l.miembro_id}|${l.periodo}`
      map.set(k, (map.get(k) || 0) + Number(l.total))
    }
    return map
  }, [liquidaciones])

  function pendientesDe(m: MiembroEquipo) {
    return mesesDesde(m.desde)
      .map((p) => ({ periodo: p, saldo: Number(m.retribucion_mensual) - (liquidadoPorMes.get(`${m.id}|${p}`) || 0) }))
      .filter((x) => x.saldo > 0)
  }

  async function anular(l: LiquidacionEquipo, nombre: string) {
    if (!confirm(`¿Anular la liquidación de ${formatCurrency(Number(l.total))} a ${nombre}? El producto vuelve al stock.`)) return
    const { error } = await supabase.rpc("anular_liquidacion", { p_liquidacion_id: l.id })
    if (error) {
      setAviso({ ok: false, texto: mensajeError(error, "No se pudo anular la liquidación.") })
      return
    }
    setAviso({ ok: true, texto: "Liquidación anulada." })
    cargar()
  }

  const activos = equipo.filter((m) => m.activo)
  const totalMes = activos.reduce((s, m) => s + Number(m.retribucion_mensual), 0)
  const liquidadoMes = activos.reduce((s, m) => s + (liquidadoPorMes.get(`${m.id}|${mesActual()}`) || 0), 0)

  return (
    <div className="min-w-0 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Retribuciones del equipo</h2>
          <p className="text-muted-foreground">Cuánto cobra cada uno y qué se le liquidó</p>
        </div>
        <Button onClick={() => setEditando("nuevo")}>
          <Plus className="mr-2 h-4 w-4" />
          Agregar persona
        </Button>
      </div>

      {aviso && (
        <div
          role={aviso.ok ? "status" : "alert"}
          className={cn(
            "flex items-start justify-between gap-3 rounded-lg border px-4 py-3 text-sm",
            aviso.ok ? "border-primary/30 bg-primary/5 text-foreground" : "border-red-200 bg-red-50 text-destructive",
          )}
        >
          <span>{aviso.texto}</span>
          <button type="button" onClick={() => setAviso(null)} aria-label="Cerrar aviso" className="opacity-70 hover:opacity-100">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="gap-2 border-primary bg-primary text-primary-foreground">
          <CardHeader>
            <CardTitle className="text-sm font-medium capitalize text-primary-foreground/80">
              Retribuciones de {nombreMes(mesActual())}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold tabular-nums">{loading ? "—" : formatCurrency(totalMes)}</CardContent>
        </Card>
        <Card className="gap-2 bg-card">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Liquidado este mes</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold tabular-nums">{loading ? "—" : formatCurrency(liquidadoMes)}</CardContent>
        </Card>
        <Card className="gap-2 bg-card">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Falta liquidar este mes</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold tabular-nums">
            {loading ? "—" : formatCurrency(Math.max(0, totalMes - liquidadoMes))}
          </CardContent>
        </Card>
      </div>

      <Card className="gap-4 bg-card">
        <CardHeader>
          <CardTitle className="text-base">Equipo</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="py-8 text-center text-muted-foreground">Cargando equipo…</p>
          ) : equipo.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
              <Users className="h-8 w-8 text-primary/60" />
              <p>Todavía no hay nadie cargado. Agregá a cada persona con su retribución mensual.</p>
            </div>
          ) : (
            <ul className="space-y-3">
              {equipo.map((m) => {
                const liquidadoActual = liquidadoPorMes.get(`${m.id}|${mesActual()}`) || 0
                const pendientes = pendientesDe(m)
                const anteriores = pendientes.filter((p) => p.periodo !== mesActual())
                const porcentaje =
                  Number(m.retribucion_mensual) > 0 ? Math.min(100, (liquidadoActual / Number(m.retribucion_mensual)) * 100) : 0
                return (
                  <li key={m.id} className={cn("rounded-lg border border-border p-4", !m.activo && "opacity-60")}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2 font-medium text-foreground">
                          {m.nombre}
                          <Badge variant="outline" className="gap-1 font-normal">
                            {m.forma_cobro === "producto" ? <Leaf className="h-3 w-3" /> : <Banknote className="h-3 w-3" />}
                            Cobra en {m.forma_cobro === "producto" ? "producto" : "dinero"}
                          </Badge>
                          {!m.activo && <Badge variant="secondary">Inactivo</Badge>}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatCurrency(Number(m.retribucion_mensual))} por mes · desde {nombreMes(m.desde)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs capitalize text-muted-foreground">Queda de {nombreMes(mesActual())}</p>
                        <p className="text-lg font-semibold tabular-nums">
                          {formatCurrency(Math.max(0, Number(m.retribucion_mensual) - liquidadoActual))}
                        </p>
                      </div>
                    </div>

                    <div aria-hidden="true" className="mt-3 h-1.5 overflow-hidden rounded-full bg-primary/10">
                      <div className="h-full rounded-full bg-primary/65" style={{ width: `${porcentaje}%` }} />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Liquidado este mes {formatCurrency(liquidadoActual)}
                    </p>
                    {anteriores.length > 0 && (
                      <p className="mt-1 text-xs font-medium text-amber-800">
                        Pendiente de meses anteriores:{" "}
                        {anteriores.map((p) => `${nombreMes(p.periodo)} ${formatCurrency(p.saldo)}`).join(" · ")}
                      </p>
                    )}

                    <div className="mt-3 flex flex-wrap gap-2">
                      {m.activo && pendientes.length > 0 && (
                        <Button size="sm" onClick={() => setLiquidando(m)}>
                          <Wallet className="mr-1.5 h-4 w-4" />
                          Liquidar
                        </Button>
                      )}
                      {liquidaciones.some((l) => l.miembro_id === m.id) && (
                        <Button size="sm" variant="outline" className="bg-card" onClick={() => setHistorial(m)}>
                          Ver liquidaciones
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-primary"
                        onClick={() => setEditando(m)}
                        aria-label={`Editar a ${m.nombre}`}
                      >
                        <Pencil className="mr-1.5 h-4 w-4" />
                        Editar
                      </Button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {editando && (
        <MiembroDialog
          miembro={editando === "nuevo" ? null : editando}
          onClose={() => setEditando(null)}
          onGuardado={(texto) => {
            setEditando(null)
            setAviso({ ok: true, texto })
            cargar()
          }}
        />
      )}

      {liquidando && (
        <LiquidarDialog
          miembro={liquidando}
          pendientes={pendientesDe(liquidando)}
          geneticas={geneticas}
          onClose={() => setLiquidando(null)}
          onGuardado={(texto) => {
            setLiquidando(null)
            setAviso({ ok: true, texto })
            cargar()
          }}
        />
      )}

      {historial && (
        <Dialog open onOpenChange={(open) => !open && setHistorial(null)}>
          <DialogContent className="monarca-theme bg-white sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Liquidaciones de {historial.nombre}</DialogTitle>
              <DialogDescription>Anular una liquidación devuelve el producto al stock y borra sus gastos.</DialogDescription>
            </DialogHeader>
            <ul className="max-h-96 divide-y overflow-y-auto">
              {liquidaciones
                .filter((l) => l.miembro_id === historial.id)
                .map((l) => {
                  const gen = geneticas.find((g) => g.id === l.genetica_id)
                  const partes = [
                    Number(l.dinero) > 0 &&
                      `${formatCurrency(Number(l.dinero))} en ${l.metodo_pago === "transferencia" ? "transferencia" : "efectivo"}`,
                    Number(l.gramos) > 0 && `${formatGramos(Number(l.gramos))} sueltos`,
                    l.cantidad_enrolados > 0 && `${l.cantidad_enrolados} enrolados`,
                  ].filter(Boolean)
                  return (
                    <li key={l.id} className="flex items-start justify-between gap-3 py-2 text-sm">
                      <div className="min-w-0">
                        <p className="font-medium capitalize">
                          {nombreMes(l.periodo)} · {fechaCorta(l.fecha)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {partes.join(" + ")}
                          {Number(l.valor_producto) > 0 && gen && ` de ${gen.nombre}`}
                          {l.usuario_nombre && ` · por ${l.usuario_nombre}`}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <span className="font-semibold tabular-nums">{formatCurrency(Number(l.total))}</span>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-red-600 hover:text-red-700"
                          title="Anular liquidación"
                          aria-label="Anular liquidación"
                          onClick={async () => {
                            await anular(l, historial.nombre)
                            setHistorial(null)
                          }}
                        >
                          <Undo2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </li>
                  )
                })}
            </ul>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

function MiembroDialog({
  miembro,
  onClose,
  onGuardado,
}: {
  miembro: MiembroEquipo | null
  onClose: () => void
  onGuardado: (texto: string) => void
}) {
  const supabase = createClient()
  const [form, setForm] = useState({
    nombre: miembro?.nombre ?? "",
    retribucion: miembro ? String(miembro.retribucion_mensual) : "",
    forma_cobro: (miembro?.forma_cobro ?? "dinero") as "dinero" | "producto",
    desde: (miembro?.desde ?? mesActual()).slice(0, 7),
    activo: miembro?.activo ?? true,
  })
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const retribucion = Number.parseFloat(form.retribucion)
    if (!form.nombre.trim()) return setError("Escribí el nombre.")
    if (!(retribucion >= 0)) return setError("Cargá la retribución mensual.")
    if (!form.desde) return setError("Elegí desde qué mes cobra.")
    const datos = {
      nombre: form.nombre.trim(),
      retribucion_mensual: retribucion,
      forma_cobro: form.forma_cobro,
      desde: `${form.desde}-01`,
      activo: form.activo,
    }
    setGuardando(true)
    const { error: dbError } = miembro
      ? await supabase.from("equipo").update({ ...datos, updated_at: new Date().toISOString() }).eq("id", miembro.id)
      : await supabase.from("equipo").insert([datos])
    setGuardando(false)
    if (dbError) return setError("No se pudo guardar.")
    onGuardado(miembro ? "Datos actualizados." : `${datos.nombre} agregado al equipo.`)
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !guardando && onClose()}>
      <DialogContent className="monarca-theme bg-white sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{miembro ? `Editar a ${miembro.nombre}` : "Agregar persona"}</DialogTitle>
          <DialogDescription>Cuánto cobra por mes y si lo cobra en dinero o en producto.</DialogDescription>
        </DialogHeader>
        <form id="miembro-form" onSubmit={guardar} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="miembro-nombre">Nombre</Label>
            <Input
              id="miembro-nombre"
              className="bg-white"
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="miembro-retribucion">Retribución mensual ($)</Label>
            <Input
              id="miembro-retribucion"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              className="bg-white tabular-nums"
              value={form.retribucion}
              onChange={(e) => setForm({ ...form, retribucion: e.target.value })}
            />
            {miembro && (
              <p className="text-xs text-muted-foreground">Si la cambiás, se aplica también a los meses que quedan pendientes.</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="miembro-cobro">Cobra en</Label>
              <Select
                value={form.forma_cobro}
                onValueChange={(v: "dinero" | "producto") => setForm({ ...form, forma_cobro: v })}
              >
                <SelectTrigger id="miembro-cobro" className="w-full bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="monarca-theme">
                  <SelectItem value="dinero">Dinero</SelectItem>
                  <SelectItem value="producto">Producto</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="miembro-desde">Cobra desde</Label>
              <Input
                id="miembro-desde"
                type="month"
                className="bg-white"
                value={form.desde}
                max={mesActual().slice(0, 7)}
                onChange={(e) => setForm({ ...form, desde: e.target.value })}
              />
            </div>
          </div>
          {miembro && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.activo}
                onChange={(e) => setForm({ ...form, activo: e.target.checked })}
              />
              Sigue en el equipo
            </label>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </form>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={guardando}>
            Cancelar
          </Button>
          <Button type="submit" form="miembro-form" disabled={guardando}>
            {guardando ? "Guardando…" : miembro ? "Guardar cambios" : "Agregar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function LiquidarDialog({
  miembro,
  pendientes,
  geneticas,
  onClose,
  onGuardado,
}: {
  miembro: MiembroEquipo
  pendientes: { periodo: string; saldo: number }[]
  geneticas: Genetica[]
  onClose: () => void
  onGuardado: (texto: string) => void
}) {
  const supabase = createClient()
  // El mes más viejo con saldo primero: lo pendiente se liquida antes.
  const ordenados = [...pendientes].sort((a, b) => a.periodo.localeCompare(b.periodo))
  const [periodo, setPeriodo] = useState(ordenados[0]?.periodo ?? mesActual())
  const saldoMes = pendientes.find((p) => p.periodo === periodo)?.saldo ?? 0
  const enProducto = miembro.forma_cobro === "producto"
  const [form, setForm] = useState({
    fecha: hoy(),
    dinero: enProducto ? "" : String(ordenados[0]?.saldo ?? ""),
    metodo_pago: "efectivo" as "efectivo" | "transferencia",
    genetica_id: "",
    gramos: "",
    cantidad_enrolados: "",
    peso_por_enrolado: "",
    nota: "",
  })
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  const genetica = geneticas.find((g) => g.id === form.genetica_id)
  const dinero = Number.parseFloat(form.dinero) || 0
  const gramos = Number.parseFloat(form.gramos) || 0
  const cantEnr = Number.parseInt(form.cantidad_enrolados, 10) || 0
  const pesoEnr = Number.parseFloat(form.peso_por_enrolado) || 0
  const precioGramo = Number(genetica?.precio_gramo_staff || 0)
  const precioEnrolado = Number(genetica?.precio_enrolado_staff || 0)
  const valorGramos = Math.round(gramos * precioGramo * 100) / 100
  const valorEnrolados = Math.round(cantEnr * precioEnrolado * 100) / 100
  const total = Math.round((dinero + valorGramos + valorEnrolados) * 100) / 100
  const queda = Math.round((saldoMes - total) * 100) / 100

  const avisos: string[] = []
  if (genetica && gramos > 0 && precioGramo <= 0) avisos.push(`${genetica.nombre} no tiene precio staff por gramo (cargalo en Stock).`)
  if (genetica && cantEnr > 0 && precioEnrolado <= 0) avisos.push(`${genetica.nombre} no tiene precio staff por enrolado (cargalo en Stock).`)
  if (genetica && gramos > Number(genetica.gramos_disponibles)) avisos.push(`Hay ${formatGramos(Number(genetica.gramos_disponibles))} sueltos de ${genetica.nombre}.`)
  if (genetica && cantEnr * pesoEnr > Number(genetica.gramos_enrolados)) avisos.push(`Hay ${formatGramos(Number(genetica.gramos_enrolados))} para enrolados de ${genetica.nombre}.`)
  if (queda < 0) avisos.push(`Supera lo que queda del mes por ${formatCurrency(-queda)}.`)

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (total <= 0) return setError("Cargá la plata o el producto que se entrega.")
    if ((gramos > 0 || cantEnr > 0) && !genetica) return setError("Elegí la genética.")
    if (cantEnr > 0 && pesoEnr <= 0) return setError("Indicá cuánto pesa cada enrolado.")
    if (avisos.length > 0) return setError(avisos[0])
    setGuardando(true)
    const { error: dbError } = await supabase.rpc("liquidar_retribucion", {
      p_miembro_id: miembro.id,
      p_periodo: periodo,
      p_fecha: form.fecha,
      p_dinero: dinero,
      p_metodo_pago: dinero > 0 ? form.metodo_pago : null,
      p_genetica_id: genetica?.id ?? null,
      p_gramos: gramos,
      p_cantidad_enrolados: cantEnr,
      p_peso_por_enrolado: pesoEnr,
      p_nota: form.nota,
    })
    setGuardando(false)
    if (dbError) return setError(mensajeError(dbError, "No se pudo liquidar."))
    onGuardado(
      `Liquidaste ${formatCurrency(total)} a ${miembro.nombre} (${nombreMes(periodo)}).` +
        (queda > 0 ? ` Quedan ${formatCurrency(queda)} pendientes de ese mes.` : ""),
    )
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !guardando && onClose()}>
      <DialogContent className="monarca-theme max-h-[90dvh] overflow-y-auto bg-white sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Liquidar a {miembro.nombre}</DialogTitle>
          <DialogDescription>
            Cargá la plata y/o el producto. El producto se valora al precio staff y sale del stock.
          </DialogDescription>
        </DialogHeader>
        <form id="liquidar-form" onSubmit={guardar} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="liq-mes">Mes</Label>
              <Select value={periodo} onValueChange={setPeriodo}>
                <SelectTrigger id="liq-mes" className="w-full bg-white capitalize">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="monarca-theme">
                  {ordenados.map((p) => (
                    <SelectItem key={p.periodo} value={p.periodo} className="capitalize">
                      {nombreMes(p.periodo)} · quedan {formatCurrency(p.saldo)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="liq-fecha">Fecha de pago</Label>
              <Input
                id="liq-fecha"
                type="date"
                className="bg-white"
                value={form.fecha}
                max={hoy()}
                onChange={(e) => setForm({ ...form, fecha: e.target.value })}
              />
            </div>
          </div>

          <fieldset className="space-y-2 rounded-lg border p-3">
            <legend className="flex items-center gap-1.5 px-1 text-sm font-semibold text-primary">
              <Banknote className="h-4 w-4" /> Plata
            </legend>
            <div className="grid grid-cols-[1fr_auto] gap-3">
              <Input
                aria-label="Plata que se le da"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                placeholder="0"
                className="bg-white tabular-nums"
                value={form.dinero}
                onChange={(e) => setForm({ ...form, dinero: e.target.value })}
              />
              <Select
                value={form.metodo_pago}
                onValueChange={(v: "efectivo" | "transferencia") => setForm({ ...form, metodo_pago: v })}
              >
                <SelectTrigger aria-label="Cómo se paga" className="w-36 bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="monarca-theme">
                  <SelectItem value="efectivo">Efectivo</SelectItem>
                  <SelectItem value="transferencia">Transferencia</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </fieldset>

          <fieldset className="space-y-3 rounded-lg border p-3">
            <legend className="flex items-center gap-1.5 px-1 text-sm font-semibold text-primary">
              <Leaf className="h-4 w-4" /> Producto (precio staff)
            </legend>
            <Select value={form.genetica_id} onValueChange={(v) => setForm({ ...form, genetica_id: v })}>
              <SelectTrigger aria-label="Genética" className="w-full bg-white">
                <SelectValue placeholder="Elegí la genética" />
              </SelectTrigger>
              <SelectContent className="monarca-theme">
                {geneticas.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.nombre} · {formatGramos(Number(g.gramos_disponibles))} sueltos ·{" "}
                    {formatGramos(Number(g.gramos_enrolados))} enr
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {genetica && (
              <p className="text-xs text-muted-foreground">
                Staff: {precioGramo > 0 ? `${formatCurrency(precioGramo)}/g` : "sin precio por gramo"} ·{" "}
                {precioEnrolado > 0 ? `${formatCurrency(precioEnrolado)}/enrolado` : "sin precio por enrolado"}
              </p>
            )}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="liq-gramos" className="text-xs">
                  Gramos sueltos
                </Label>
                <Input
                  id="liq-gramos"
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  min="0"
                  placeholder="0"
                  className="bg-white"
                  value={form.gramos}
                  onChange={(e) => setForm({ ...form, gramos: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="liq-enrolados" className="text-xs">
                  Enrolados
                </Label>
                <Input
                  id="liq-enrolados"
                  type="number"
                  min="0"
                  step="1"
                  placeholder="0"
                  className="bg-white"
                  value={form.cantidad_enrolados}
                  onChange={(e) => setForm({ ...form, cantidad_enrolados: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="liq-peso" className="text-xs">
                  g por enrolado
                </Label>
                <Input
                  id="liq-peso"
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  min="0"
                  placeholder="0"
                  className="bg-white"
                  value={form.peso_por_enrolado}
                  onChange={(e) => setForm({ ...form, peso_por_enrolado: e.target.value })}
                />
              </div>
            </div>
          </fieldset>

          <div className="space-y-1.5">
            <Label htmlFor="liq-nota">Nota (opcional)</Label>
            <Input
              id="liq-nota"
              className="bg-white"
              value={form.nota}
              onChange={(e) => setForm({ ...form, nota: e.target.value })}
            />
          </div>

          <dl className="space-y-1 rounded-lg border bg-primary/5 p-3 text-sm" aria-live="polite">
            <div className="flex justify-between gap-3">
              <dt className="capitalize text-muted-foreground">Retribución de {nombreMes(periodo)} pendiente</dt>
              <dd className="tabular-nums">{formatCurrency(saldoMes)}</dd>
            </div>
            {dinero > 0 && (
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Plata</dt>
                <dd className="tabular-nums">− {formatCurrency(dinero)}</dd>
              </div>
            )}
            {gramos > 0 && (
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">
                  {formatGramos(gramos)} × {formatCurrency(precioGramo)}
                </dt>
                <dd className="tabular-nums">− {formatCurrency(valorGramos)}</dd>
              </div>
            )}
            {cantEnr > 0 && (
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">
                  {cantEnr} enrolados × {formatCurrency(precioEnrolado)}
                </dt>
                <dd className="tabular-nums">− {formatCurrency(valorEnrolados)}</dd>
              </div>
            )}
            <div className="flex justify-between gap-3 border-t pt-1 font-semibold">
              <dt>Queda pendiente</dt>
              <dd className={cn("tabular-nums", queda < 0 && "text-destructive")}>{formatCurrency(queda)}</dd>
            </div>
          </dl>

          {avisos.length > 0 && (
            <ul className="space-y-1 text-sm text-amber-800">
              {avisos.map((a) => (
                <li key={a}>• {a}</li>
              ))}
            </ul>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </form>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={guardando}>
            Cancelar
          </Button>
          <Button type="submit" form="liquidar-form" disabled={guardando || total <= 0 || avisos.length > 0}>
            {guardando ? "Liquidando…" : `Liquidar ${formatCurrency(total)}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
