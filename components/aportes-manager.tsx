"use client"

/**
 * Aportes de capital (scripts/070): una ficha por aporte con su saldo. Cada
 * devolución es un gasto de la categoría "Devolución de aportes" vinculado al
 * aporte, en su misma moneda. La comisión carga y edita aportes; cualquiera
 * puede registrar una devolución.
 */
import type React from "react"
import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import type { AporteCapital, Gasto } from "@/lib/types"
import { formatMoneda, type Moneda } from "@/lib/format"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { HandCoins, Pencil, Plus, Trash2, Undo2, X } from "lucide-react"
import { format } from "date-fns"

type Aviso = { ok: boolean; texto: string } | null

function hoy() {
  return format(new Date(), "yyyy-MM-dd")
}

function fechaCorta(iso: string) {
  const [y, m, d] = iso.split("-")
  return `${d}/${m}/${y}`
}

/** Mensaje de los errores de las reglas de aportes (GA00x) o uno genérico. */
function mensajeError(error: { code?: string; message: string }, generico: string) {
  return /^GA00\d$/.test(error.code || "") ? error.message : generico
}

export function AportesManager({ puedeEditar }: { puedeEditar: boolean }) {
  const supabase = createClient()
  const [aportes, setAportes] = useState<AporteCapital[]>([])
  const [devoluciones, setDevoluciones] = useState<Gasto[]>([])
  const [categoriaDevolucion, setCategoriaDevolucion] = useState("Devolución de aportes")
  const [loading, setLoading] = useState(true)
  const [aviso, setAviso] = useState<Aviso>(null)
  const [editando, setEditando] = useState<AporteCapital | "nuevo" | null>(null)
  const [devolviendo, setDevolviendo] = useState<AporteCapital | null>(null)
  const [viendo, setViendo] = useState<AporteCapital | null>(null)

  async function cargar() {
    const [aportesResult, devolucionesResult, categoriaResult] = await Promise.all([
      supabase.from("aportes_capital_resumen").select("*").order("fecha", { ascending: false }),
      supabase.from("gastos").select("*").not("aporte_id", "is", null).order("fecha", { ascending: false }),
      supabase.from("categorias_gasto").select("nombre").eq("en_resultado", "aparte").order("orden").limit(1),
    ])
    if (aportesResult.error || devolucionesResult.error) {
      setAviso({ ok: false, texto: "No se pudieron cargar los aportes." })
    } else {
      setAportes(aportesResult.data || [])
      setDevoluciones(devolucionesResult.data || [])
    }
    if (categoriaResult.data?.[0]) setCategoriaDevolucion(categoriaResult.data[0].nombre)
    setLoading(false)
  }

  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function eliminar(aporte: AporteCapital) {
    if (!confirm(`¿Eliminar el aporte de ${aporte.aportante}?`)) return
    const { error } = await supabase.from("aportes_capital").delete().eq("id", aporte.id)
    if (error) {
      setAviso({
        ok: false,
        texto:
          error.code === "23503"
            ? "Este aporte tiene devoluciones registradas: no se puede eliminar."
            : "No se pudo eliminar el aporte.",
      })
      return
    }
    setAviso({ ok: true, texto: "Aporte eliminado." })
    cargar()
  }

  const pendiente = (moneda: Moneda) =>
    aportes.filter((a) => a.moneda === moneda).reduce((s, a) => s + Number(a.saldo), 0)
  const activos = aportes.filter((a) => Number(a.saldo) > 0).length

  return (
    <div className="min-w-0 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Aportes de capital</h2>
          <p className="text-muted-foreground">Lo que aportaron los socios y cuánto falta devolver</p>
        </div>
        {puedeEditar && (
          <Button onClick={() => setEditando("nuevo")}>
            <Plus className="mr-2 h-4 w-4" />
            Nuevo aporte
          </Button>
        )}
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
            <CardTitle className="text-sm font-medium text-primary-foreground/80">Falta devolver en pesos</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold tabular-nums">
            {loading ? "—" : formatMoneda(pendiente("ARS"), "ARS")}
          </CardContent>
        </Card>
        <Card className="gap-2 bg-card">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Falta devolver en dólares</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold tabular-nums">
            {loading ? "—" : formatMoneda(pendiente("USD"), "USD")}
          </CardContent>
        </Card>
        <Card className="gap-2 bg-card">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Aportes con saldo</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold tabular-nums">
            {loading ? "—" : `${activos} de ${aportes.length}`}
          </CardContent>
        </Card>
      </div>

      <Card className="gap-4 bg-card">
        <CardHeader>
          <CardTitle className="text-base">Aportes</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="py-8 text-center text-muted-foreground">Cargando aportes…</p>
          ) : aportes.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
              <HandCoins className="h-8 w-8 text-primary/60" />
              <p>Todavía no hay aportes cargados.</p>
              {puedeEditar && <p className="text-sm">Cargá el primero con &quot;Nuevo aporte&quot;.</p>}
            </div>
          ) : (
            <ul className="space-y-3">
              {aportes.map((a) => {
                const saldado = Number(a.saldo) <= 0
                const vencido = !saldado && !!a.fecha_devolucion && a.fecha_devolucion < hoy()
                const porcentaje = Math.min(100, (Number(a.devuelto) / Number(a.monto)) * 100)
                return (
                  <li key={a.id} className="rounded-lg border border-border p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2 font-medium text-foreground">
                          {a.aportante}
                          {a.moneda === "USD" && (
                            <Badge variant="outline" className="border-accent/40 text-accent-foreground">
                              Dólares
                            </Badge>
                          )}
                          {saldado && <Badge className="bg-primary/15 text-primary hover:bg-primary/15">Saldado</Badge>}
                          {vencido && (
                            <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Vencido</Badge>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Aportó {formatMoneda(Number(a.monto), a.moneda)} el {fechaCorta(a.fecha)} · {a.cuotas_pagadas} de{" "}
                          {a.cuotas} {a.cuotas === 1 ? "cuota" : "cuotas"} pagadas
                        </p>
                        {!saldado && (
                          <p className={cn("text-xs", vencido ? "font-medium text-amber-800" : "text-muted-foreground")}>
                            {a.fecha_devolucion
                              ? `${vencido ? "Se tenía que devolver" : "Devolver"} antes del ${fechaCorta(a.fecha_devolucion)}`
                              : "Sin fecha: se devuelve cuando haya plata"}
                          </p>
                        )}
                        {a.nota && <p className="mt-1 text-xs text-muted-foreground">{a.nota}</p>}
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Saldo</p>
                        <p className={cn("text-lg font-semibold tabular-nums", saldado ? "text-muted-foreground" : "text-foreground")}>
                          {formatMoneda(Number(a.saldo), a.moneda)}
                        </p>
                      </div>
                    </div>

                    <div
                      className="mt-3 h-1.5 overflow-hidden rounded-full bg-primary/10"
                      role="progressbar"
                      aria-label={`Devuelto de ${a.aportante}`}
                      aria-valuenow={Math.round(porcentaje)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    >
                      <div className="h-full rounded-full bg-primary/65" style={{ width: `${porcentaje}%` }} />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Devuelto {formatMoneda(Number(a.devuelto), a.moneda)}
                      {a.ultima_devolucion && ` · última devolución ${fechaCorta(a.ultima_devolucion)}`}
                    </p>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {!saldado && (
                        <Button size="sm" onClick={() => setDevolviendo(a)}>
                          <Undo2 className="mr-1.5 h-4 w-4" />
                          Registrar devolución
                        </Button>
                      )}
                      {a.cuotas_pagadas > 0 && (
                        <Button size="sm" variant="outline" className="bg-card" onClick={() => setViendo(a)}>
                          Ver devoluciones
                        </Button>
                      )}
                      {puedeEditar && (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-primary"
                            onClick={() => setEditando(a)}
                            aria-label={`Editar aporte de ${a.aportante}`}
                          >
                            <Pencil className="mr-1.5 h-4 w-4" />
                            Editar
                          </Button>
                          {a.cuotas_pagadas === 0 && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-red-600 hover:text-red-700"
                              onClick={() => eliminar(a)}
                              aria-label={`Eliminar aporte de ${a.aportante}`}
                            >
                              <Trash2 className="mr-1.5 h-4 w-4" />
                              Eliminar
                            </Button>
                          )}
                        </>
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
        <AporteDialog
          aporte={editando === "nuevo" ? null : editando}
          onClose={() => setEditando(null)}
          onGuardado={(texto) => {
            setEditando(null)
            setAviso({ ok: true, texto })
            cargar()
          }}
        />
      )}

      {devolviendo && (
        <DevolucionDialog
          aporte={devolviendo}
          categoria={categoriaDevolucion}
          onClose={() => setDevolviendo(null)}
          onGuardado={(texto) => {
            setDevolviendo(null)
            setAviso({ ok: true, texto })
            cargar()
          }}
        />
      )}

      {viendo && (
        <Dialog open onOpenChange={(open) => !open && setViendo(null)}>
          <DialogContent className="monarca-theme bg-white sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Devoluciones a {viendo.aportante}</DialogTitle>
              <DialogDescription>
                {formatMoneda(Number(viendo.devuelto), viendo.moneda)} devueltos de{" "}
                {formatMoneda(Number(viendo.monto), viendo.moneda)}. Se editan o eliminan desde Gastos.
              </DialogDescription>
            </DialogHeader>
            <ul className="max-h-80 divide-y overflow-y-auto">
              {devoluciones
                .filter((g) => g.aporte_id === viendo.id)
                .map((g) => (
                  <li key={g.id} className="flex items-start justify-between gap-3 py-2 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium">{fechaCorta(g.fecha)}</p>
                      <p className="text-xs text-muted-foreground">
                        {g.descripcion} · {g.metodo_pago === "efectivo" ? "Efectivo" : "Transferencia"}
                      </p>
                    </div>
                    <span className="shrink-0 font-semibold tabular-nums">{formatMoneda(Number(g.monto), g.moneda)}</span>
                  </li>
                ))}
            </ul>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

function AporteDialog({
  aporte,
  onClose,
  onGuardado,
}: {
  aporte: AporteCapital | null
  onClose: () => void
  onGuardado: (texto: string) => void
}) {
  const supabase = createClient()
  const [form, setForm] = useState({
    aportante: aporte?.aportante ?? "",
    monto: aporte ? String(aporte.monto) : "",
    moneda: (aporte?.moneda ?? "ARS") as Moneda,
    fecha: aporte?.fecha ?? hoy(),
    cuotas: aporte ? String(aporte.cuotas) : "1",
    fecha_devolucion: aporte?.fecha_devolucion ?? "",
    nota: aporte?.nota ?? "",
  })
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const conDevoluciones = (aporte?.cuotas_pagadas ?? 0) > 0

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const monto = Number.parseFloat(form.monto)
    const cuotas = Number.parseInt(form.cuotas, 10)
    if (!form.aportante.trim()) return setError("Escribí quién hizo el aporte.")
    if (!(monto > 0)) return setError("El monto tiene que ser mayor a 0.")
    if (!(cuotas >= 1)) return setError("La cantidad de cuotas tiene que ser 1 o más.")
    if (!form.fecha) return setError("Elegí la fecha del aporte.")
    if (form.fecha_devolucion && form.fecha_devolucion < form.fecha)
      return setError("La fecha de devolución no puede ser anterior a la del aporte.")

    const datos = {
      aportante: form.aportante.trim(),
      monto,
      moneda: form.moneda,
      fecha: form.fecha,
      cuotas,
      fecha_devolucion: form.fecha_devolucion || null,
      nota: form.nota.trim() || null,
    }
    setGuardando(true)
    const { error: dbError } = aporte
      ? await supabase.from("aportes_capital").update(datos).eq("id", aporte.id)
      : await supabase.from("aportes_capital").insert([datos])
    setGuardando(false)
    if (dbError) return setError(mensajeError(dbError, "No se pudo guardar el aporte."))
    onGuardado(aporte ? "Aporte actualizado." : `Aporte de ${datos.aportante} cargado.`)
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !guardando && onClose()}>
      <DialogContent className="monarca-theme bg-white sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{aporte ? "Editar aporte" : "Nuevo aporte"}</DialogTitle>
          <DialogDescription>Si el aporte fue en dólares, se devuelve en dólares.</DialogDescription>
        </DialogHeader>
        <form id="aporte-form" onSubmit={guardar} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="aportante">Aportante</Label>
            <Input
              id="aportante"
              className="bg-white"
              value={form.aportante}
              onChange={(e) => setForm({ ...form, aportante: e.target.value })}
              placeholder="Nombre y apellido"
            />
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="aporte-monto">Monto</Label>
              <Input
                id="aporte-monto"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                className="bg-white tabular-nums"
                value={form.monto}
                onChange={(e) => setForm({ ...form, monto: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="aporte-moneda">Moneda</Label>
              <Select
                value={form.moneda}
                onValueChange={(v: Moneda) => setForm({ ...form, moneda: v })}
                disabled={conDevoluciones}
              >
                <SelectTrigger id="aporte-moneda" className="w-32 bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="monarca-theme">
                  <SelectItem value="ARS">Pesos</SelectItem>
                  <SelectItem value="USD">Dólares</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {conDevoluciones && (
            <p className="text-xs text-muted-foreground">La moneda no se cambia porque ya tiene devoluciones.</p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="aporte-fecha">Fecha del aporte</Label>
              <Input
                id="aporte-fecha"
                type="date"
                className="bg-white"
                value={form.fecha}
                max={hoy()}
                onChange={(e) => setForm({ ...form, fecha: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="aporte-cuotas">Cuotas para devolverlo</Label>
              <Input
                id="aporte-cuotas"
                type="number"
                min="1"
                step="1"
                className="bg-white"
                value={form.cuotas}
                onChange={(e) => setForm({ ...form, cuotas: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="aporte-fecha-devolucion">Fecha de devolución (opcional)</Label>
            <div className="flex gap-2">
              <Input
                id="aporte-fecha-devolucion"
                type="date"
                className="bg-white"
                value={form.fecha_devolucion}
                min={form.fecha || undefined}
                onChange={(e) => setForm({ ...form, fecha_devolucion: e.target.value })}
              />
              {form.fecha_devolucion && (
                <Button type="button" variant="ghost" onClick={() => setForm({ ...form, fecha_devolucion: "" })}>
                  Quitar
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">Dejala vacía si se devuelve cuando haya plata.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="aporte-nota">Nota (opcional)</Label>
            <Textarea
              id="aporte-nota"
              className="bg-white"
              rows={2}
              value={form.nota}
              onChange={(e) => setForm({ ...form, nota: e.target.value })}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </form>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={guardando}>
            Cancelar
          </Button>
          <Button type="submit" form="aporte-form" disabled={guardando}>
            {guardando ? "Guardando…" : aporte ? "Guardar cambios" : "Cargar aporte"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DevolucionDialog({
  aporte,
  categoria,
  onClose,
  onGuardado,
}: {
  aporte: AporteCapital
  categoria: string
  onClose: () => void
  onGuardado: (texto: string) => void
}) {
  const supabase = createClient()
  const saldo = Number(aporte.saldo)
  const cuotaSugerida = Math.min(saldo, Math.round((Number(aporte.monto) / aporte.cuotas) * 100) / 100)
  const numeroCuota = aporte.cuotas_pagadas + 1
  const [form, setForm] = useState({
    monto: String(cuotaSugerida),
    fecha: hoy(),
    metodo_pago: "efectivo" as "efectivo" | "transferencia",
    nota: "",
  })
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const monto = Number.parseFloat(form.monto)
    if (!(monto > 0)) return setError("El monto tiene que ser mayor a 0.")
    if (monto > saldo) return setError(`Supera el saldo: quedan ${formatMoneda(saldo, aporte.moneda)}.`)

    const cuota = numeroCuota <= aporte.cuotas ? ` (cuota ${numeroCuota} de ${aporte.cuotas})` : ""
    setGuardando(true)
    const { error: dbError } = await supabase.from("gastos").insert([
      {
        descripcion: `Devolución aporte ${aporte.aportante}${cuota}${form.nota.trim() ? ` · ${form.nota.trim()}` : ""}`,
        monto,
        categoria,
        aporte_id: aporte.id,
        moneda: aporte.moneda,
        metodo_pago: form.metodo_pago,
        fecha: form.fecha,
      },
    ])
    setGuardando(false)
    if (dbError) return setError(mensajeError(dbError, "No se pudo registrar la devolución."))
    onGuardado(`Devolución de ${formatMoneda(monto, aporte.moneda)} a ${aporte.aportante} registrada.`)
  }

  const montoNum = Number.parseFloat(form.monto) || 0

  return (
    <Dialog open onOpenChange={(open) => !open && !guardando && onClose()}>
      <DialogContent className="monarca-theme bg-white sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Devolución a {aporte.aportante}</DialogTitle>
          <DialogDescription>
            Queda registrada en Gastos, en &quot;{categoria}&quot;
            {aporte.moneda === "USD" ? ", en dólares" : ""}.
          </DialogDescription>
        </DialogHeader>
        <form id="devolucion-form" onSubmit={guardar} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="dev-monto">Monto ({aporte.moneda === "USD" ? "US$" : "$"})</Label>
            <Input
              id="dev-monto"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              className="h-12 bg-white text-xl font-semibold tabular-nums"
              value={form.monto}
              onChange={(e) => setForm({ ...form, monto: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              Saldo {formatMoneda(saldo, aporte.moneda)} → queda{" "}
              <strong className={cn(saldo - montoNum < 0 ? "text-destructive" : "text-foreground")}>
                {formatMoneda(Math.round((saldo - montoNum) * 100) / 100, aporte.moneda)}
              </strong>
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="dev-fecha">Fecha</Label>
              <Input
                id="dev-fecha"
                type="date"
                className="bg-white"
                value={form.fecha}
                max={hoy()}
                onChange={(e) => setForm({ ...form, fecha: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dev-metodo">Método de pago</Label>
              <Select
                value={form.metodo_pago}
                onValueChange={(v: "efectivo" | "transferencia") => setForm({ ...form, metodo_pago: v })}
              >
                <SelectTrigger id="dev-metodo" className="w-full bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="monarca-theme">
                  <SelectItem value="efectivo">Efectivo</SelectItem>
                  <SelectItem value="transferencia">Transferencia</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dev-nota">Nota (opcional)</Label>
            <Input
              id="dev-nota"
              className="bg-white"
              value={form.nota}
              onChange={(e) => setForm({ ...form, nota: e.target.value })}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </form>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={guardando}>
            Cancelar
          </Button>
          <Button type="submit" form="devolucion-form" disabled={guardando}>
            {guardando ? "Registrando…" : "Registrar devolución"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
