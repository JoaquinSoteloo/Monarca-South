"use client"

import { useState, type FormEvent } from "react"
import { AlertCircle, Check, CircleHelp, Flower2, Grid2X2, Plus, Settings2, Sprout } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import type { CamaCultivo, Genetica, MacetaCultivo, MapaMacetas } from "@/lib/types"
import { diasEntre, MAPA_VACIO, redimensionarMapa } from "@/lib/mapa-macetas"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"

const etapas = { vacio: "Vacía", vegetativo: "Vegetativo", floracion: "Floración", cosecha: "Cosecha" }
const salud = {
  sin_evaluar: { label: "Sin evaluar", color: "bg-slate-100 text-slate-700", icon: CircleHelp },
  sana: { label: "Sana", color: "bg-emerald-100 text-emerald-800", icon: Check },
  observacion: { label: "En observación", color: "bg-amber-100 text-amber-900", icon: AlertCircle },
  enferma: { label: "Enferma", color: "bg-red-100 text-red-800", icon: AlertCircle },
}
const selectClass = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm"

function Tiempo({ cama }: { cama: CamaCultivo }) {
  const vege = diasEntre(cama.fecha_vegetativo ?? null, cama.fecha_floracion || cama.fecha_cosecha || null)
  const flora = diasEntre(cama.fecha_floracion ?? null, cama.fecha_cosecha ?? null)
  return <span>Vege {vege === null ? "—" : `${vege} d`} · Flora {flora === null ? "—" : `${flora} d`}</span>
}

export function CamaMapa({ cama, geneticas, onChange, onEdit }: {
  cama: CamaCultivo
  geneticas: Genetica[]
  onChange: (cama: CamaCultivo) => void
  onEdit: () => void
}) {
  const mapa = cama.mapa_macetas || MAPA_VACIO
  const [draft, setDraft] = useState<MacetaCultivo | null>(null)
  const [configOpen, setConfigOpen] = useState(false)
  const [size, setSize] = useState({ filas: mapa.filas, columnas: mapa.columnas })
  const [baseVersion, setBaseVersion] = useState(cama.mapa_version ?? 0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [conflict, setConflict] = useState(false)
  const [notice, setNotice] = useState("")
  const ocupadas = mapa.macetas.length
  const atencion = mapa.macetas.filter(m => m.salud === "enferma" || m.salud === "observacion").length

  function abrir(fila: number, columna: number) {
    setError(""); setConflict(false); setBaseVersion(cama.mapa_version ?? 0)
    setDraft(mapa.macetas.find(m => m.fila === fila && m.columna === columna) || {
      fila, columna, etiqueta: "", genetica_id: null, salud: "sin_evaluar", notas: "",
    })
  }

  async function guardar(next: MapaMacetas): Promise<boolean> {
    if (conflict) return false
    setBusy(true); setError(""); setNotice("")
    try {
      const supabase = createClient()
      const { data, error: saveError } = await supabase.from("camas_cultivo")
        .update({ mapa_macetas: next, updated_at: new Date().toISOString() })
        .eq("id", cama.id).eq("mapa_version", baseVersion).select().maybeSingle()
      if (saveError) {
        if (["42703", "PGRST204"].includes(saveError.code)) {
          throw new Error("El mapa todavía no está habilitado en la base de datos. Contactá al administrador para activarlo.")
        }
        throw new Error("No se pudo guardar el mapa. Revisá la conexión e intentá de nuevo.")
      }
      if (!data) {
        setConflict(true)
        const { data: actual } = await supabase.from("camas_cultivo").select().eq("id", cama.id).maybeSingle()
        if (actual) onChange(actual as CamaCultivo)
        throw new Error("La cama cambió en otra sesión o fue eliminada. Cerrá esta ficha y volvé a abrirla para revisar los datos actuales.")
      }
      onChange(data as CamaCultivo)
      setNotice("Cambios guardados")
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron guardar los cambios.")
      return false
    } finally { setBusy(false) }
  }

  async function guardarMaceta(event: FormEvent) {
    event.preventDefault()
    if (!draft) return
    const macetas = mapa.macetas.filter(m => m.fila !== draft.fila || m.columna !== draft.columna)
    if (await guardar({ ...mapa, macetas: [...macetas, { ...draft, etiqueta: draft.etiqueta.trim() }] })) setDraft(null)
  }

  async function quitar() {
    if (!draft || !confirm("¿Quitar esta maceta? Se borrarán su ficha y observaciones de esta posición. Las fechas de la cama se conservan.")) return
    if (await guardar({ ...mapa, macetas: mapa.macetas.filter(m => m.fila !== draft.fila || m.columna !== draft.columna) })) setDraft(null)
  }

  async function guardarTamano(event: FormEvent) {
    event.preventDefault()
    try {
      if (await guardar(redimensionarMapa(mapa, size.filas, size.columnas))) setConfigOpen(false)
    } catch (err) { setError(err instanceof Error ? err.message : "Tamaño inválido") }
  }

  return <section className="min-w-0 rounded-2xl border border-slate-200 bg-white shadow-sm" aria-label={cama.nombre}>
    <div className="flex flex-wrap items-center justify-between gap-3 p-5">
      <div>
        <h3 className="font-semibold text-emerald-950">{cama.nombre}</h3>
        <p className="mt-1 text-xs text-slate-500">{ocupadas} / {mapa.filas * mapa.columnas} posiciones ocupadas · {mapa.filas} × {mapa.columnas}</p>
      </div>
      <div className="flex items-center gap-1">
        {atencion > 0 && <span className="mr-2 inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-1 text-xs text-red-800"><AlertCircle size={13} />{atencion} para revisar</span>}
        <Button variant="ghost" size="icon" aria-label={`Configurar distribución de ${cama.nombre}`} onClick={() => {
          setSize({ filas: mapa.filas, columnas: mapa.columnas }); setError(""); setConflict(false)
          setBaseVersion(cama.mapa_version ?? 0); setConfigOpen(true)
        }}><Grid2X2 size={17} /></Button>
        <Button variant="ghost" size="sm" aria-label={`Editar etapa y fechas de ${cama.nombre}`} onClick={onEdit}><Settings2 size={17} />Etapa y fechas</Button>
      </div>
    </div>
    <div className="mx-5 mb-4 flex flex-wrap items-center gap-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
      <span className="font-semibold">{etapas[cama.estado]}</span>
      <Tiempo cama={cama} />
      <span className="text-xs text-emerald-700">Ciclo de toda la cama</span>
    </div>
    <div className="overflow-x-auto px-5 pb-5">
      <div className="relative rounded-xl border-[5px] border-slate-400 bg-slate-200 p-3 shadow-[inset_0_0_0_2px_#e2e8f0,0_7px_0_-2px_#64748b]"
        style={{ minWidth: mapa.columnas * 112 + 24, backgroundImage: "repeating-linear-gradient(0deg,transparent,transparent 23px,#cbd5e1 24px),repeating-linear-gradient(90deg,transparent,transparent 23px,#cbd5e1 24px)" }}>
        <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${mapa.columnas}, minmax(100px, 1fr))` }}>
          {Array.from({ length: mapa.filas * mapa.columnas }, (_, i) => {
            const fila = Math.floor(i / mapa.columnas), columna = i % mapa.columnas
            const maceta = mapa.macetas.find(m => m.fila === fila && m.columna === columna)
            const posicion = `${String.fromCharCode(65 + fila)}${columna + 1}`
            const genetica = geneticas.find(g => String(g.id) === maceta?.genetica_id)
            const health = maceta ? salud[maceta.salud] : null
            const HealthIcon = health?.icon || CircleHelp
            return <button key={posicion} type="button" onClick={() => abrir(fila, columna)}
              aria-label={`${cama.nombre}, posición ${posicion}${maceta ? `, ${maceta.etiqueta || genetica?.nombre || "sin genética"}, ${health?.label}` : ", agregar maceta"}`}
              className="group flex min-h-44 flex-col items-center rounded-lg bg-white/75 px-2 py-3 text-center transition hover:bg-white hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600">
              <span className="mb-2 text-[10px] font-semibold tracking-widest text-slate-500">{posicion}</span>
              {maceta ? <>
                <span className="relative flex h-14 w-14 items-center justify-center rounded-full border-[5px] border-slate-800 bg-stone-700 shadow-[0_4px_0_0_#0f172a]">
                  {cama.estado === "floracion" ? <Flower2 className="h-7 w-7 text-purple-300" /> : <Sprout className={`h-7 w-7 ${cama.estado === "cosecha" ? "text-amber-300" : "text-emerald-300"}`} />}
                  <span className={`absolute -right-3 -top-2 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white ${health?.color}`}><HealthIcon size={14} /></span>
                </span>
                <span className="mt-3 max-w-full truncate text-xs font-semibold text-slate-900">{maceta.etiqueta || genetica?.nombre || "Sin genética"}</span>
                {maceta.etiqueta && <span className="max-w-full truncate text-[10px] text-slate-500">{genetica?.nombre || "Sin genética"}</span>}
                <span className={`mt-1 rounded-full px-1.5 py-0.5 text-[10px] ${health?.color}`}>{health?.label}</span>
              </> : <>
                <span className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-dashed border-slate-400 text-slate-400 group-hover:border-emerald-600 group-hover:text-emerald-700"><Plus size={22} /></span>
                <span className="mt-3 text-xs text-slate-500">Agregar maceta</span>
              </>}
            </button>
          })}
        </div>
      </div>
      <p className="mt-4 text-center text-[10px] uppercase tracking-[0.16em] text-slate-400">Frente de la cama · Vista superior</p>
    </div>
    {ocupadas === 0 && cama.cantidad_plantas > 0 && <p className="mx-5 mb-4 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">Registro anterior: {cama.cantidad_plantas} plantas. Agregá sus fichas para ubicarlas en el mapa; los datos generales siguen disponibles en configuración.</p>}
    <p role="status" className="px-5 pb-3 text-xs text-emerald-700">{notice}</p>

    <Dialog open={!!draft} onOpenChange={open => { if (!open && !busy) setDraft(null) }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>{cama.nombre} · Maceta {draft && `${String.fromCharCode(65 + draft.fila)}${draft.columna + 1}`}</DialogTitle>
          <DialogDescription>Genética, salud y observaciones de esta maceta. La etapa y las fechas se gestionan en la cama.</DialogDescription></DialogHeader>
        {draft && <form onSubmit={guardarMaceta} className="space-y-4">
          <div><Label htmlFor={`etiqueta-${cama.id}`}>Etiqueta (opcional)</Label><Input id={`etiqueta-${cama.id}`} maxLength={80} value={draft.etiqueta} onChange={e => setDraft({ ...draft, etiqueta: e.target.value })} placeholder="Ej.: Planta 01" /></div>
          <div><Label htmlFor={`genetica-${cama.id}`}>Genética</Label><select id={`genetica-${cama.id}`} className={selectClass} value={draft.genetica_id || ""} onChange={e => setDraft({ ...draft, genetica_id: e.target.value || null })}>
            <option value="">Sin asignar</option>
            {draft.genetica_id && !geneticas.some(g => String(g.id) === draft.genetica_id) && <option value={draft.genetica_id}>Genética no disponible</option>}
            {geneticas.map(g => <option key={g.id} value={String(g.id)}>{g.nombre}</option>)}
          </select></div>
          <div>
            <div><Label htmlFor={`salud-${cama.id}`}>Estado de salud</Label><select id={`salud-${cama.id}`} className={selectClass} value={draft.salud} onChange={e => setDraft({ ...draft, salud: e.target.value as MacetaCultivo["salud"] })}>{Object.entries(salud).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}</select></div>
          </div>
          <div><Label htmlFor={`notas-${cama.id}`}>Observaciones</Label><Textarea id={`notas-${cama.id}`} maxLength={4000} rows={3} value={draft.notas} onChange={e => setDraft({ ...draft, notas: e.target.value })} placeholder="Observaciones del equipo…" /></div>
          {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
          <div className="flex flex-wrap justify-between gap-2 border-t pt-4">
            <Button type="button" variant="ghost" className="text-red-700" disabled={busy || conflict || !mapa.macetas.some(m => m.fila === draft.fila && m.columna === draft.columna)} onClick={quitar}>Quitar maceta</Button>
            <div className="flex gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => setDraft(null)}>Cancelar</Button><Button disabled={busy || conflict} type="submit">{busy ? "Guardando…" : "Guardar ficha"}</Button></div>
          </div>
        </form>}
      </DialogContent>
    </Dialog>
    <Dialog open={configOpen} onOpenChange={open => { if (!busy) setConfigOpen(open) }}>
      <DialogContent><DialogHeader><DialogTitle>Distribución · {cama.nombre}</DialogTitle><DialogDescription>Configurá las posiciones de la mesa. A1 queda en la esquina superior izquierda.</DialogDescription></DialogHeader>
        <form onSubmit={guardarTamano} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">{(['filas', 'columnas'] as const).map(key => <div key={key}><Label htmlFor={`${key}-${cama.id}`}>{key === 'filas' ? 'Filas' : 'Columnas'}</Label><Input id={`${key}-${cama.id}`} type="number" min={1} max={12} step={1} required value={size[key] || ""} onChange={e => setSize({ ...size, [key]: Number(e.target.value) })} /></div>)}</div>
          <p className="text-sm text-muted-foreground">{size.filas * size.columnas} posiciones. Cambiar el tamaño no crea plantas ni reasigna sus ubicaciones.</p>
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          <Button type="submit" disabled={busy || conflict}>{busy ? "Guardando…" : "Guardar distribución"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  </section>
}
