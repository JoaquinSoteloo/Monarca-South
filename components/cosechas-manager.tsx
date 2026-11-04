"use client"

/**
 * Cierre de cosecha de una sala (scripts/083): el peso seco se compara con lo
 * que salió de esas genéticas desde la cosecha (entregas, muestras,
 * exposición y retribuciones en producto) más lo que queda en stock. La
 * diferencia es la merma.
 */
import type React from "react"
import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import type { Genetica } from "@/lib/types"
import { formatGramos } from "@/lib/format"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DatePicker } from "@/components/ui/date-picker"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Plus, Scissors, Trash2, X } from "lucide-react"
import { format } from "date-fns"

interface Sala {
  id: number
  nombre: string
}

interface Resumen {
  entregado: number
  stock: number
  muestras: number
  exposicion: number
  retribuciones: number
}

interface Cierre extends Resumen {
  id: string
  sala_id: number
  desde: string
  fecha: string
  genetica_ids: string[]
  peso_seco: number
  merma: number
  nota: string | null
  usuario_nombre: string | null
}

function fechaCorta(iso: string) {
  const [y, m, d] = iso.split("-")
  return `${d}/${m}/${y}`
}

function contado(r: Resumen) {
  return Number(r.entregado) + Number(r.stock) + Number(r.muestras) + Number(r.exposicion) + Number(r.retribuciones)
}

function Desglose({ r, pesoSeco }: { r: Resumen; pesoSeco: number }) {
  const merma = Math.round((pesoSeco - contado(r)) * 100) / 100
  const porcentaje = pesoSeco > 0 ? (merma / pesoSeco) * 100 : 0
  const filas: [string, number][] = [
    ["Entregado", Number(r.entregado)],
    ["Stock actual", Number(r.stock)],
    ["Muestras", Number(r.muestras)],
    ["Exposición", Number(r.exposicion)],
    ["Retribuciones en producto", Number(r.retribuciones)],
  ]
  return (
    <dl className="space-y-1 text-sm">
      <div className="flex justify-between gap-3 font-medium">
        <dt>Peso seco</dt>
        <dd className="tabular-nums">{formatGramos(pesoSeco)}</dd>
      </div>
      {filas.map(([label, valor]) => (
        <div key={label} className="flex justify-between gap-3 text-muted-foreground">
          <dt>− {label}</dt>
          <dd className="tabular-nums">{formatGramos(valor)}</dd>
        </div>
      ))}
      <div className="flex justify-between gap-3 border-t pt-1 font-semibold">
        <dt>Merma</dt>
        <dd className={cn("tabular-nums", merma < 0 && "text-amber-700")}>
          {formatGramos(merma)}
          {pesoSeco > 0 && <span className="ml-1 text-xs font-normal text-muted-foreground">({porcentaje.toFixed(1)} %)</span>}
        </dd>
      </div>
      {merma < 0 && (
        <p className="text-xs text-amber-700">
          Salió más de lo que se pesó: revisá el peso seco, la fecha o las genéticas elegidas.
        </p>
      )}
    </dl>
  )
}

export function CosechasManager({ puedeBorrar }: { puedeBorrar: boolean }) {
  const supabase = createClient()
  const [cierres, setCierres] = useState<Cierre[]>([])
  const [salas, setSalas] = useState<Sala[]>([])
  const [geneticas, setGeneticas] = useState<Genetica[]>([])
  const [loading, setLoading] = useState(true)
  const [nuevo, setNuevo] = useState(false)
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null)

  async function cargar() {
    const [c, s, g] = await Promise.all([
      supabase.from("cierres_cosecha").select("*").order("fecha", { ascending: false }).order("created_at", { ascending: false }),
      supabase.from("salas_cultivo").select("id, nombre").eq("activo", true).order("nombre"),
      supabase.from("geneticas").select("*").eq("activo", true).order("nombre"),
    ])
    if (c.error) setAviso({ ok: false, texto: "No se pudieron cargar los cierres." })
    setCierres(c.data || [])
    setSalas(s.data || [])
    setGeneticas(g.data || [])
    setLoading(false)
  }

  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function borrar(c: Cierre) {
    if (!confirm("¿Borrar este cierre de cosecha? No cambia el stock.")) return
    const { error } = await supabase.from("cierres_cosecha").delete().eq("id", c.id)
    if (error) return setAviso({ ok: false, texto: "No se pudo borrar el cierre." })
    setAviso({ ok: true, texto: "Cierre borrado." })
    cargar()
  }

  const nombreSala = (id: number) => salas.find((s) => s.id === id)?.nombre ?? `Sala ${id}`
  const nombreGenetica = (id: string) => geneticas.find((g) => g.id === id)?.nombre ?? "Genética inactiva"

  return (
    <div className="min-w-0 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Cosechas</h2>
          <p className="text-muted-foreground">Cierre de cada cosecha: peso seco, lo que salió y la merma</p>
        </div>
        <Button onClick={() => setNuevo(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Cerrar cosecha
        </Button>
      </div>

      {aviso && (
        <div
          role={aviso.ok ? "status" : "alert"}
          className={cn(
            "flex items-start justify-between gap-3 rounded-lg border px-4 py-3 text-sm",
            aviso.ok ? "border-primary/30 bg-primary/5" : "border-red-200 bg-red-50 text-destructive",
          )}
        >
          <span>{aviso.texto}</span>
          <button type="button" onClick={() => setAviso(null)} aria-label="Cerrar aviso">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <Card className="gap-4 bg-card">
        <CardHeader>
          <CardTitle className="text-base">Cierres</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="py-8 text-center text-muted-foreground">Cargando…</p>
          ) : cierres.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
              <Scissors className="h-8 w-8 text-primary/60" />
              <p>Todavía no hay cierres de cosecha.</p>
            </div>
          ) : (
            <ul className="grid gap-3 md:grid-cols-2">
              {cierres.map((c) => (
                <li key={c.id} className="space-y-3 rounded-lg border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">{nombreSala(c.sala_id)}</p>
                      <p className="text-xs text-muted-foreground">
                        Cosecha {fechaCorta(c.desde)} · cierre {fechaCorta(c.fecha)}
                        {c.usuario_nombre && ` · ${c.usuario_nombre}`}
                      </p>
                      <p className="text-xs text-muted-foreground">{c.genetica_ids.map(nombreGenetica).join(", ")}</p>
                    </div>
                    {puedeBorrar && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 shrink-0 text-red-600"
                        onClick={() => borrar(c)}
                        aria-label="Borrar cierre"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <Desglose r={c} pesoSeco={Number(c.peso_seco)} />
                  {c.nota && <p className="text-xs text-muted-foreground">{c.nota}</p>}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {nuevo && (
        <CierreDialog
          salas={salas}
          geneticas={geneticas}
          onClose={() => setNuevo(false)}
          onGuardado={() => {
            setNuevo(false)
            setAviso({ ok: true, texto: "Cosecha cerrada." })
            cargar()
          }}
        />
      )}
    </div>
  )
}

function CierreDialog({
  salas,
  geneticas,
  onClose,
  onGuardado,
}: {
  salas: Sala[]
  geneticas: Genetica[]
  onClose: () => void
  onGuardado: () => void
}) {
  const supabase = createClient()
  const [salaId, setSalaId] = useState("")
  const [desde, setDesde] = useState(format(new Date(), "yyyy-MM-dd"))
  const [elegidas, setElegidas] = useState<string[]>([])
  const [pesoSeco, setPesoSeco] = useState("")
  const [nota, setNota] = useState("")
  const [resumen, setResumen] = useState<Resumen | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  // Recalcula lo que salió cada vez que cambian las genéticas o la fecha.
  useEffect(() => {
    let vigente = true
    if (elegidas.length === 0 || !desde) {
      setResumen(null)
      return
    }
    supabase.rpc("resumen_cosecha", { p_genetica_ids: elegidas, p_desde: desde }).then(({ data }) => {
      if (vigente && data) setResumen(data as Resumen)
    })
    return () => {
      vigente = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elegidas, desde])

  function alternar(id: string) {
    setElegidas((e) => (e.includes(id) ? e.filter((x) => x !== id) : [...e, id]))
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const peso = Number.parseFloat(pesoSeco)
    if (!salaId) return setError("Elegí la sala.")
    if (elegidas.length === 0) return setError("Elegí al menos una genética.")
    if (!(peso > 0)) return setError("Cargá el peso seco.")
    setGuardando(true)
    const { error: dbError } = await supabase.rpc("registrar_cierre_cosecha", {
      p_sala_id: Number(salaId),
      p_desde: desde,
      p_genetica_ids: elegidas,
      p_peso_seco: peso,
      p_nota: nota,
    })
    setGuardando(false)
    if (dbError) return setError(dbError.code === "CC001" ? dbError.message : "No se pudo cerrar la cosecha.")
    onGuardado()
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !guardando && onClose()}>
      <DialogContent className="monarca-theme max-h-[90dvh] overflow-y-auto bg-white sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Cerrar cosecha</DialogTitle>
          <DialogDescription>Se cuenta todo lo que salió de esas genéticas desde la fecha de la cosecha.</DialogDescription>
        </DialogHeader>
        <form id="cierre-form" onSubmit={guardar} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cierre-sala">Sala</Label>
              <Select value={salaId} onValueChange={setSalaId}>
                <SelectTrigger id="cierre-sala" className="w-full bg-white">
                  <SelectValue placeholder="Elegí la sala" />
                </SelectTrigger>
                <SelectContent className="monarca-theme">
                  {salas.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cierre-desde">Fecha de la cosecha</Label>
              <DatePicker
                id="cierre-desde"
                value={desde}
                max={format(new Date(), "yyyy-MM-dd")}
                onChange={setDesde}
              />
            </div>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Genéticas de la cosecha</legend>
            <div className="grid max-h-48 grid-cols-2 gap-1 overflow-y-auto rounded-lg border p-2">
              {geneticas.map((g) => (
                <label key={g.id} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted">
                  <input type="checkbox" checked={elegidas.includes(g.id)} onChange={() => alternar(g.id)} />
                  {g.nombre}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="space-y-1.5">
            <Label htmlFor="cierre-peso">Peso seco total (g)</Label>
            <Input
              id="cierre-peso"
              type="number"
              inputMode="decimal"
              step="0.1"
              min="0"
              className="h-12 bg-white text-xl font-semibold tabular-nums"
              value={pesoSeco}
              onChange={(e) => setPesoSeco(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cierre-nota">Nota (opcional)</Label>
            <Input id="cierre-nota" className="bg-white" value={nota} onChange={(e) => setNota(e.target.value)} />
          </div>

          {resumen && (
            <div className="rounded-lg border bg-primary/5 p-3" aria-live="polite">
              <Desglose r={resumen} pesoSeco={Number.parseFloat(pesoSeco) || 0} />
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </form>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={guardando}>
            Cancelar
          </Button>
          <Button type="submit" form="cierre-form" disabled={guardando}>
            {guardando ? "Guardando…" : "Cerrar cosecha"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
