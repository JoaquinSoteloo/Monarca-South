"use client"

/**
 * Retribuciones del equipo (scripts/072 y 091). Cada persona tiene su
 * retribución mensual y si la cobra en dinero o en producto. "Liquidar"
 * primero descuenta lo que debe de sus entregas (si está vinculada a su
 * socio) y el resto se paga en plata y/o en gramos sueltos y enrolados: el
 * producto se valora al precio de miembro de la genética y sale de su stock.
 * Lo que no se liquida queda pendiente en ese mes y se liquida después.
 *
 * El consumo de un mes va del 5 al 4 del mes siguiente (lib/retribuciones.ts).
 */
import type React from "react"
import { useEffect, useMemo, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import type { Genetica, LiquidacionEquipo, MiembroEquipo } from "@/lib/types"
import { formatCurrency, formatGramos } from "@/lib/format"
import {
  corteDeuda,
  deudaParaDescontar,
  enVentana,
  repartirSueldo,
  textoVentana,
  ventanaConsumo,
  type EntregaConDeuda,
} from "@/lib/retribuciones"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DatePicker, MonthPicker } from "@/components/ui/date-picker"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Banknote, Leaf, Pencil, Plus, Receipt, Undo2, Users, Wallet, X } from "lucide-react"
import { format } from "date-fns"
import { es } from "date-fns/locale"

type Aviso = { ok: boolean; texto: string } | null

interface SocioLite {
  id: string
  nombre: string
  apellido: string
}

interface EntregaConsumo {
  socio_id: string
  total: number
  saldo_pendiente: number | null
  created_at: string
  detalles: { genetica_id: string | null; gramos: number | null; peso_enrolados: number | null; cantidad_enrolados: number | null }[]
}

/** Lo que retiró una persona del equipo en un mes (del 5 al 4), por genética. */
interface Consumo {
  porGenetica: { genetica_id: string; gramos: number }[]
  gramos: number
  total: number
  pendiente: number
}

function mesAnterior(periodo: string) {
  const [y, m] = periodo.split("-").map(Number)
  return m === 1 ? `${y - 1}-12-01` : `${y}-${String(m - 1).padStart(2, "0")}-01`
}

/** Día del mes en Argentina (para la alerta del día 5). */
function diaArgentina() {
  return Number(new Date().toLocaleDateString("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" }).slice(8, 10))
}

function calcularConsumo(entregas: EntregaConsumo[], socioId: string | null, periodo: string): Consumo | null {
  if (!socioId) return null
  const delMes = entregas.filter((e) => e.socio_id === socioId && enVentana(e.created_at, periodo))
  if (delMes.length === 0) return null
  const map = new Map<string, number>()
  for (const e of delMes) {
    for (const d of e.detalles) {
      if (!d.genetica_id) continue
      const g = Number(d.gramos || 0) + Number(d.peso_enrolados || 0)
      map.set(d.genetica_id, (map.get(d.genetica_id) || 0) + g)
    }
  }
  const porGenetica = Array.from(map.entries())
    .map(([genetica_id, gramos]) => ({ genetica_id, gramos }))
    .sort((a, b) => b.gramos - a.gramos)
  return {
    porGenetica,
    gramos: porGenetica.reduce((s, x) => s + x.gramos, 0),
    total: delMes.reduce((s, e) => s + Number(e.total || 0), 0),
    pendiente: delMes.reduce((s, e) => s + Number(e.saldo_pendiente || 0), 0),
  }
}

function textoConsumo(c: Consumo, nombreGenetica: (id: string) => string) {
  const detalle = c.porGenetica.map((x) => `${nombreGenetica(x.genetica_id)} ${formatGramos(x.gramos)}`).join(", ")
  return `${formatGramos(c.gramos)} (${detalle}) · ${formatCurrency(c.total)}${
    c.pendiente > 0 ? ` · debe ${formatCurrency(c.pendiente)}` : ""
  }`
}

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

export function RetribucionesManager({ puedeLiquidar }: { puedeLiquidar: boolean }) {
  const supabase = createClient()
  const [equipo, setEquipo] = useState<MiembroEquipo[]>([])
  const [liquidaciones, setLiquidaciones] = useState<LiquidacionEquipo[]>([])
  const [geneticas, setGeneticas] = useState<Genetica[]>([])
  const [socios, setSocios] = useState<SocioLite[]>([])
  const [entregas, setEntregas] = useState<EntregaConsumo[]>([])
  // Todas las entregas con saldo de quienes retiran con un socio: su deuda.
  const [deudas, setDeudas] = useState<EntregaConDeuda[]>([])
  const [loading, setLoading] = useState(true)
  const [aviso, setAviso] = useState<Aviso>(null)
  const [editando, setEditando] = useState<MiembroEquipo | "nuevo" | null>(null)
  const [liquidando, setLiquidando] = useState<MiembroEquipo | null>(null)
  const [historial, setHistorial] = useState<MiembroEquipo | null>(null)

  async function cargar() {
    const [equipoResult, liqResult, genResult] = await Promise.all([
      supabase.from("retribuciones_equipo").select("*").order("activo", { ascending: false }).order("nombre"),
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

    const sociosResult = await supabase
      .from("socios")
      .select("id, nombre, apellido")
      .eq("activo", true)
      .eq("es_generico", false)
      .order("apellido")
    setSocios(sociosResult.data || [])

    // De quienes retiran con un socio: sus entregas desde el consumo del mes
    // pasado (del 5 al 4) y todo lo que deben, para descontarlo al liquidar.
    const vinculados = (equipoResult.data || []).map((m: MiembroEquipo) => m.socio_id).filter(Boolean) as string[]
    if (vinculados.length > 0) {
      const desde = ventanaConsumo(mesAnterior(mesActual())).desde.toISOString()
      const [entregasResult, deudasResult] = await Promise.all([
        supabase
          .from("ventas")
          .select("socio_id, total, saldo_pendiente, created_at, detalles:detalle_venta(genetica_id, gramos, peso_enrolados, cantidad_enrolados)")
          .in("socio_id", vinculados)
          .gte("created_at", desde),
        supabase.from("ventas").select("socio_id, saldo_pendiente, created_at").in("socio_id", vinculados).gt("saldo_pendiente", 0),
      ])
      setEntregas((entregasResult.data as EntregaConsumo[]) || [])
      setDeudas((deudasResult.data as EntregaConDeuda[]) || [])
    } else {
      setEntregas([])
      setDeudas([])
    }
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

  function deudaTotalDe(socioId: string | null) {
    if (!socioId) return 0
    return deudas.filter((d) => d.socio_id === socioId).reduce((s, d) => s + Number(d.saldo_pendiente || 0), 0)
  }

  async function anular(l: LiquidacionEquipo, nombre: string) {
    const deuda = Number(l.monto_deuda || 0)
    const consecuencias = [
      deuda > 0 && `Los ${formatCurrency(deuda)} descontados vuelven a su deuda.`,
      Number(l.valor_producto) > 0 && "El producto vuelve al stock.",
    ].filter(Boolean)
    if (!confirm(`¿Anular la liquidación de ${formatCurrency(Number(l.total))} a ${nombre}? ${consecuencias.join(" ")}`.trim())) return
    const { error } = await supabase.rpc("anular_liquidacion", { p_liquidacion_id: l.id })
    if (error) {
      setAviso({ ok: false, texto: mensajeError(error, "No se pudo anular la liquidación.") })
      return
    }
    setAviso({ ok: true, texto: "Liquidación anulada." })
    cargar()
  }

  const activos = equipo.filter((m) => m.activo)
  const nombreGenetica = (id: string) => geneticas.find((g) => g.id === id)?.nombre ?? "otra genética"
  // Desde el día 5, avisa quién tiene retribuciones de meses anteriores sin liquidar.
  const sinLiquidarAnteriores =
    diaArgentina() >= 5 ? activos.filter((m) => pendientesDe(m).some((p) => p.periodo < mesActual())) : []
  const totalMes = activos.reduce((s, m) => s + Number(m.retribucion_mensual), 0)
  const liquidadoMes = activos.reduce((s, m) => s + (liquidadoPorMes.get(`${m.id}|${mesActual()}`) || 0), 0)

  return (
    <div className="min-w-0 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Retribuciones del equipo</h2>
          <p className="text-muted-foreground">Cuánto cobra cada uno y qué se le liquidó</p>
        </div>
        {puedeLiquidar && (
          <Button onClick={() => setEditando("nuevo")}>
            <Plus className="mr-2 h-4 w-4" />
            Agregar persona
          </Button>
        )}
      </div>

      {sinLiquidarAnteriores.length > 0 && (
        <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-semibold">Ya pasó el día 5: hay retribuciones para liquidar</p>
          <p>
            {sinLiquidarAnteriores
              .map((m) =>
                `${m.nombre} (${pendientesDe(m)
                  .filter((p) => p.periodo < mesActual())
                  .map((p) => `${nombreMes(p.periodo)} ${formatCurrency(p.saldo)}`)
                  .join(", ")})`,
              )
              .join(" · ")}
          </p>
        </div>
      )}

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
                    {[mesActual(), mesAnterior(mesActual())].map((p) => {
                      const c = calcularConsumo(entregas, m.socio_id, p)
                      return c ? (
                        <p key={p} className="mt-1 text-xs text-foreground">
                          <span className="text-muted-foreground">
                            Consumo de <span className="capitalize">{nombreMes(p)}</span> ({textoVentana(p)}):
                          </span>{" "}
                          {textoConsumo(c, nombreGenetica)}
                        </p>
                      ) : null
                    })}
                    {deudaTotalDe(m.socio_id) > 0 && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Debe <span className="font-medium text-foreground">{formatCurrency(deudaTotalDe(m.socio_id))}</span> de
                        sus entregas: se descuenta al liquidar.
                      </p>
                    )}
                    {!m.socio_id && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Sin socio vinculado: editalo para ver lo que retira y descontarle su deuda.
                      </p>
                    )}
                    {anteriores.length > 0 && (
                      <p className="mt-1 text-xs font-medium text-amber-800">
                        Pendiente de meses anteriores:{" "}
                        {anteriores.map((p) => `${nombreMes(p.periodo)} ${formatCurrency(p.saldo)}`).join(" · ")}
                      </p>
                    )}

                    <div className="mt-3 flex flex-wrap gap-2">
                      {puedeLiquidar && m.activo && pendientes.length > 0 && (
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
                      {puedeLiquidar && (
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
                      )}
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
          socios={socios}
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
          consumoDe={(periodo) => calcularConsumo(entregas, liquidando.socio_id, periodo)}
          deudaDe={(periodo) => deudaParaDescontar(deudas, liquidando.socio_id, periodo)}
          nombreGenetica={nombreGenetica}
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
              <DialogDescription>
                Anular una liquidación devuelve el producto al stock y la deuda descontada a sus entregas, y borra sus
                gastos.
              </DialogDescription>
            </DialogHeader>
            <ul className="max-h-96 divide-y overflow-y-auto">
              {liquidaciones
                .filter((l) => l.miembro_id === historial.id)
                .map((l) => {
                  const gen = geneticas.find((g) => g.id === l.genetica_id)
                  const partes = [
                    Number(l.monto_deuda) > 0 && `${formatCurrency(Number(l.monto_deuda))} de su deuda`,
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
                        {puedeLiquidar && (
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
                        )}
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
  socios,
  onClose,
  onGuardado,
}: {
  miembro: MiembroEquipo | null
  socios: SocioLite[]
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
    socio_id: miembro?.socio_id ?? "",
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
      socio_id: form.socio_id || null,
    }
    setGuardando(true)
    const { error: dbError } = miembro
      ? await supabase.from("retribuciones_equipo").update({ ...datos, updated_at: new Date().toISOString() }).eq("id", miembro.id)
      : await supabase.from("retribuciones_equipo").insert([datos])
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
              <MonthPicker
                id="miembro-desde"
                value={form.desde}
                max={mesActual().slice(0, 7)}
                onChange={(desde) => setForm({ ...form, desde })}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="miembro-socio">Retira como socio</Label>
            <Select value={form.socio_id || "ninguno"} onValueChange={(v) => setForm({ ...form, socio_id: v === "ninguno" ? "" : v })}>
              <SelectTrigger id="miembro-socio" className="w-full bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="monarca-theme">
                <SelectItem value="ninguno">Sin vincular</SelectItem>
                {socios.map((so) => (
                  <SelectItem key={so.id} value={so.id}>
                    {so.apellido}, {so.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Sus entregas se ven en el resumen del mes para descontarlas del sueldo.
            </p>
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
  consumoDe,
  deudaDe,
  nombreGenetica,
  onClose,
  onGuardado,
}: {
  miembro: MiembroEquipo
  pendientes: { periodo: string; saldo: number }[]
  geneticas: Genetica[]
  consumoDe: (periodo: string) => Consumo | null
  /** Lo que debe de sus entregas hasta el 4 del mes siguiente (0 si no está vinculado a su socio). */
  deudaDe: (periodo: string) => number
  nombreGenetica: (id: string) => string
  onClose: () => void
  onGuardado: (texto: string) => void
}) {
  const supabase = createClient()
  // El mes más viejo con saldo primero: lo pendiente se liquida antes.
  const ordenados = [...pendientes].sort((a, b) => a.periodo.localeCompare(b.periodo))
  const enProducto = miembro.forma_cobro === "producto"
  const saldoDe = (p: string) => pendientes.find((x) => x.periodo === p)?.saldo ?? 0

  // Lo que se sugiere para un mes: primero se descuenta su deuda y, si cobra
  // en dinero, lo que sobra va en plata.
  function sugerido(p: string, descontar = true) {
    const reparto = repartirSueldo(saldoDe(p), descontar ? deudaDe(p) : 0)
    return {
      descontar: descontar && reparto.deuda > 0,
      deuda: reparto.deuda > 0 ? String(reparto.deuda) : "",
      dinero: enProducto || reparto.dinero <= 0 ? "" : String(reparto.dinero),
    }
  }

  const [periodo, setPeriodo] = useState(ordenados[0]?.periodo ?? mesActual())
  const [form, setForm] = useState(() => ({
    fecha: hoy(),
    metodo_pago: "efectivo" as "efectivo" | "transferencia",
    genetica_id: "",
    gramos: "",
    cantidad_enrolados: "",
    peso_por_enrolado: "",
    nota: "",
    ...sugerido(ordenados[0]?.periodo ?? mesActual()),
  }))
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  function cambiarMes(p: string) {
    setPeriodo(p)
    setForm((f) => ({ ...f, ...sugerido(p) }))
  }

  function cambiarDescontar(si: boolean) {
    const s = sugerido(periodo, si)
    setForm((f) => ({ ...f, descontar: si, deuda: s.deuda, dinero: enProducto ? f.dinero : s.dinero }))
  }

  const saldoMes = saldoDe(periodo)
  const deudaMes = deudaDe(periodo)
  const genetica = geneticas.find((g) => g.id === form.genetica_id)
  const deuda = form.descontar ? Number.parseFloat(form.deuda) || 0 : 0
  const dinero = Number.parseFloat(form.dinero) || 0
  const gramos = Number.parseFloat(form.gramos) || 0
  const cantEnr = Number.parseInt(form.cantidad_enrolados, 10) || 0
  const pesoEnr = Number.parseFloat(form.peso_por_enrolado) || 0
  const precioGramo = Number(genetica?.precio_gramo_miembro || 0)
  const precioEnrolado = Number(genetica?.precio_enrolado_miembro || 0)
  const valorGramos = Math.round(gramos * precioGramo * 100) / 100
  const valorEnrolados = Math.round(cantEnr * precioEnrolado * 100) / 100
  const total = Math.round((deuda + dinero + valorGramos + valorEnrolados) * 100) / 100
  const queda = Math.round((saldoMes - total) * 100) / 100

  const avisos: string[] = []
  if (Math.round(deuda * 100) > Math.round(deudaMes * 100))
    avisos.push(`Debe ${formatCurrency(deudaMes)} hasta el ${corteDeuda(periodo)}: no se puede descontar más.`)
  if (genetica && gramos > 0 && precioGramo <= 0) avisos.push(`${genetica.nombre} no tiene precio de miembro por gramo (cargalo en Stock).`)
  if (genetica && cantEnr > 0 && precioEnrolado <= 0) avisos.push(`${genetica.nombre} no tiene precio de miembro por enrolado (cargalo en Stock).`)
  if (genetica && gramos > Number(genetica.gramos_disponibles)) avisos.push(`Hay ${formatGramos(Number(genetica.gramos_disponibles))} sueltos de ${genetica.nombre}.`)
  if (genetica && cantEnr * pesoEnr > Number(genetica.gramos_enrolados)) avisos.push(`Hay ${formatGramos(Number(genetica.gramos_enrolados))} para enrolados de ${genetica.nombre}.`)
  if (queda < 0) avisos.push(`Supera lo que queda del mes por ${formatCurrency(-queda)}.`)

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (total <= 0) return setError("Cargá la deuda que se descuenta, la plata o el producto que se entrega.")
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
      p_monto_deuda: deuda,
    })
    setGuardando(false)
    if (dbError) return setError(mensajeError(dbError, "No se pudo liquidar."))
    const partes = [
      deuda > 0 && `${formatCurrency(deuda)} de su deuda`,
      dinero > 0 && `${formatCurrency(dinero)} en ${form.metodo_pago}`,
      valorGramos + valorEnrolados > 0 && `${formatCurrency(valorGramos + valorEnrolados)} en producto`,
    ].filter(Boolean)
    onGuardado(
      `Liquidaste ${formatCurrency(total)} a ${miembro.nombre} (${nombreMes(periodo)}): ${partes.join(" + ")}.` +
        (queda > 0 ? ` Quedan ${formatCurrency(queda)} pendientes de ese mes.` : ""),
    )
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !guardando && onClose()}>
      <DialogContent className="monarca-theme max-h-[90dvh] overflow-y-auto bg-white sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Liquidar a {miembro.nombre}</DialogTitle>
          <DialogDescription>
            Primero se descuenta lo que debe de sus entregas; lo que sobra se paga en plata o en producto (a precio de
            miembro, sale del stock).
          </DialogDescription>
        </DialogHeader>
        <form id="liquidar-form" onSubmit={guardar} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="liq-mes">Mes</Label>
              <Select value={periodo} onValueChange={cambiarMes}>
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
              <DatePicker
                id="liq-fecha"
                value={form.fecha}
                max={hoy()}
                onChange={(fecha) => fecha && setForm({ ...form, fecha })}
              />
            </div>
          </div>

          {deudaMes > 0 ? (
            <fieldset className="space-y-2 rounded-lg border p-3">
              <legend className="flex items-center gap-1.5 px-1 text-sm font-semibold text-primary">
                <Receipt className="h-4 w-4" /> Su deuda
              </legend>
              <div className="grid grid-cols-[1fr_auto] items-center gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-primary"
                    checked={form.descontar}
                    onChange={(e) => cambiarDescontar(e.target.checked)}
                  />
                  Descontar su deuda
                </label>
                {form.descontar && (
                  <Input
                    aria-label="Deuda que se descuenta"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    className="w-36 bg-white tabular-nums"
                    value={form.deuda}
                    onChange={(e) => setForm({ ...form, deuda: e.target.value })}
                  />
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Debe {formatCurrency(deudaMes)} de entregas hasta el {corteDeuda(periodo)}.
                {deuda > 0 && deuda < deudaMes && ` Se cancela de la más vieja a la más nueva y le quedan ${formatCurrency(deudaMes - deuda)}.`}
              </p>
            </fieldset>
          ) : (
            <p className="text-xs text-muted-foreground">
              {miembro.socio_id
                ? `No debe nada de sus entregas hasta el ${corteDeuda(periodo)}.`
                : "Para descontarle lo que debe, vinculalo a su socio con Editar."}
            </p>
          )}

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
              <Leaf className="h-4 w-4" /> Producto (precio de miembro)
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
                Precio de miembro: {precioGramo > 0 ? `${formatCurrency(precioGramo)}/g` : "sin precio por gramo"} ·{" "}
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

          {consumoDe(periodo) && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <span className="font-medium">
                Consumo de <span className="capitalize">{nombreMes(periodo)}</span> ({textoVentana(periodo)}):
              </span>{" "}
              {textoConsumo(consumoDe(periodo)!, nombreGenetica)}
            </p>
          )}

          <dl className="space-y-1 rounded-lg border bg-primary/5 p-3 text-sm" aria-live="polite">
            <div className="flex justify-between gap-3">
              <dt className="capitalize text-muted-foreground">Retribución de {nombreMes(periodo)} pendiente</dt>
              <dd className="tabular-nums">{formatCurrency(saldoMes)}</dd>
            </div>
            {deuda > 0 && (
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Descontado de su deuda</dt>
                <dd className="tabular-nums">− {formatCurrency(deuda)}</dd>
              </div>
            )}
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
