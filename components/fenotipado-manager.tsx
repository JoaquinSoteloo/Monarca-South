"use client"

// Pantalla Fenotipado (pedido de Facundo, 18/11/2026; script 104).
// Lucho y Demian anotan cómo crece cada planta de semilla (acá o contándoselo
// a la IA) y la pantalla arma la evolución y un resumen para elegir madres.
import type React from "react"
import { useMemo, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { AlertTriangle, Dna, LineChart, MessageCircle, NotebookPen, Plus, Sparkles, Trash2 } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import {
  ESTADOS_FENO,
  ESTADO_FENO_LABEL,
  ETAPAS_FENO,
  ETAPA_FENO_LABEL,
  FORMAS,
  FORMA_LABEL,
  NUDOS,
  PUNTAJES,
  PUNTAJE_LABEL,
  SALUDES,
  SEXOS_FENO,
  SEXO_FENO_LABEL,
  diasDesde,
  normalizarCodigo,
  rankingPorGenetica,
  resumirPlanta,
  type EstadoFeno,
  type EtapaFeno,
  type ObservacionFeno,
  type PlantaFeno,
  type ResumenPlanta,
  type SexoFeno,
} from "@/lib/fenotipado"

interface Props {
  initialPlantas: PlantaFeno[]
  initialObservaciones: ObservacionFeno[]
  tablaFaltante: boolean
  puedeEditar: boolean
  puedeUsarAsistente: boolean
  userId: string | null
  hoy: string
}

const selectClase =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

const ESTADO_COLOR: Record<EstadoFeno, string> = {
  en_curso: "bg-emerald-100 text-emerald-800",
  madre: "bg-amber-100 text-amber-900",
  descartada: "bg-zinc-200 text-zinc-700",
  cosechada: "bg-sky-100 text-sky-800",
}

const numOnull = (v: string): number | null => {
  const t = v.trim().replace(",", ".")
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

const formAltaVacio = (hoy: string) => ({ genetica: "", prefijo: "", cantidad: "1", banco: "", fecha_germinacion: hoy, ubicacion: "" })

const formObsVacio = (hoy: string, plantaId = "") => ({
  planta_id: plantaId,
  fecha: hoy,
  etapa: "vege" as EtapaFeno,
  semana: "",
  altura_cm: "",
  nudos: "",
  forma: "",
  salud: "",
  olor: "",
  sexo: "",
  estado: "",
  peso_humedo_g: "",
  peso_seco_g: "",
  nota: "",
  ...Object.fromEntries(PUNTAJES.map((p) => [p, ""])),
}) as Record<string, string> & { etapa: EtapaFeno }

/** Gráfico de altura simple (SVG), sin librerías. */
function GraficoAltura({ puntos }: { puntos: { fecha: string; altura: number }[] }) {
  if (puntos.length < 2) {
    return <p className="text-sm text-muted-foreground">Hacen falta al menos 2 alturas cargadas para ver la curva.</p>
  }
  const W = 320
  const H = 140
  const pad = 24
  const t0 = Date.parse(puntos[0].fecha)
  const t1 = Date.parse(puntos[puntos.length - 1].fecha)
  const maxA = Math.max(...puntos.map((p) => p.altura), 1)
  const x = (f: string) => pad + ((Date.parse(f) - t0) / Math.max(t1 - t0, 1)) * (W - pad * 2)
  const y = (a: number) => H - pad - (a / maxA) * (H - pad * 2)
  const linea = puntos.map((p) => `${x(p.fecha).toFixed(1)},${y(p.altura).toFixed(1)}`).join(" ")
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-40 w-full max-w-md" role="img" aria-label="Altura por fecha">
      <line x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} stroke="currentColor" className="text-muted-foreground/40" />
      <polyline points={linea} fill="none" stroke="currentColor" strokeWidth={2} className="text-emerald-600" />
      {puntos.map((p) => (
        <g key={`${p.fecha}-${p.altura}`}>
          <circle cx={x(p.fecha)} cy={y(p.altura)} r={3} className="fill-emerald-700" />
          <text x={x(p.fecha)} y={y(p.altura) - 6} textAnchor="middle" className="fill-foreground text-[9px]">
            {p.altura}
          </text>
        </g>
      ))}
      <text x={pad} y={H - 6} className="fill-muted-foreground text-[9px]">{puntos[0].fecha.slice(5)}</text>
      <text x={W - pad} y={H - 6} textAnchor="end" className="fill-muted-foreground text-[9px]">
        {puntos[puntos.length - 1].fecha.slice(5)}
      </text>
    </svg>
  )
}

export function FenotipadoManager({ initialPlantas, initialObservaciones, tablaFaltante, puedeEditar, puedeUsarAsistente, userId, hoy }: Props) {
  const { toast } = useToast()
  const [plantas, setPlantas] = useState(initialPlantas)
  const [obs, setObs] = useState(initialObservaciones)
  const [tab, setTab] = useState("plantas")
  const [elegida, setElegida] = useState<number | null>(initialPlantas[0]?.id ?? null)
  const [altaAbierta, setAltaAbierta] = useState(false)
  const [obsAbierta, setObsAbierta] = useState(false)
  const [formAlta, setFormAlta] = useState(formAltaVacio(hoy))
  const [formObs, setFormObs] = useState(formObsVacio(hoy))
  const [guardando, setGuardando] = useState(false)
  const [mensajeIA, setMensajeIA] = useState("")
  const [respuestaIA, setRespuestaIA] = useState("")
  const [pensando, setPensando] = useState(false)
  const [resumenIA, setResumenIA] = useState("")
  const [resumiendo, setResumiendo] = useState(false)

  const resumenes = useMemo(() => plantas.map((p) => resumirPlanta(p, obs, hoy)), [plantas, obs, hoy])
  const ranking = useMemo(() => rankingPorGenetica(resumenes), [resumenes])
  const actual = resumenes.find((r) => r.planta.id === elegida) ?? null
  const obsActual = useMemo(
    () => obs.filter((o) => o.planta_id === elegida).sort((a, b) => (a.fecha === b.fecha ? b.id - a.id : a.fecha < b.fecha ? 1 : -1)),
    [obs, elegida],
  )
  const alertas = resumenes.flatMap((r) => r.alertas.map((a) => `${r.planta.codigo}: ${a}`))

  async function recargar() {
    const supabase = createClient()
    const [p, o] = await Promise.all([
      supabase.from("fenotipado_plantas").select("*").order("codigo"),
      supabase.from("fenotipado_observaciones").select("*").order("fecha").order("id"),
    ])
    if (!p.error) setPlantas((p.data ?? []) as PlantaFeno[])
    if (!o.error) setObs((o.data ?? []) as ObservacionFeno[])
  }

  // ---------- Alta de plantas ----------
  async function guardarAlta(e: React.FormEvent) {
    e.preventDefault()
    const genetica = formAlta.genetica.trim()
    const prefijo = formAlta.prefijo.trim().toUpperCase().replace(/[^A-ZÑ]/g, "").slice(0, 5)
    const cantidad = Math.round(Number(formAlta.cantidad))
    if (!genetica || prefijo.length < 2 || !(cantidad >= 1 && cantidad <= 30)) {
      toast({ title: "Revisá los datos", description: "Genética, abreviatura de 2 a 5 letras y cantidad de 1 a 30.", variant: "destructive" })
      return
    }
    const usados = new Set(plantas.map((p) => p.codigo.toUpperCase()))
    const filas = []
    for (let nro = 1; filas.length < cantidad; nro++) {
      const codigo = `${prefijo}-${String(nro).padStart(2, "0")}`
      if (usados.has(codigo)) continue
      filas.push({
        codigo,
        genetica,
        banco: formAlta.banco.trim() || null,
        fecha_germinacion: formAlta.fecha_germinacion || null,
        ubicacion: formAlta.ubicacion.trim() || null,
      })
    }
    setGuardando(true)
    const { data, error } = await createClient().from("fenotipado_plantas").insert(filas).select()
    setGuardando(false)
    if (error) {
      toast({ title: "No se pudieron cargar las plantas", description: error.message, variant: "destructive" })
      return
    }
    const nuevas = (data ?? []) as PlantaFeno[]
    setPlantas((cur) => [...cur, ...nuevas].sort((a, b) => a.codigo.localeCompare(b.codigo, "es")))
    if (!elegida && nuevas[0]) setElegida(nuevas[0].id)
    setAltaAbierta(false)
    setFormAlta(formAltaVacio(hoy))
    toast({ title: "Plantas cargadas", description: `${nuevas.map((n) => n.codigo).join(", ")}. Ponele a cada maceta su etiqueta con el código.` })
  }

  // ---------- Observaciones ----------
  function abrirAnotar(planta?: PlantaFeno) {
    const base = formObsVacio(hoy, planta ? String(planta.id) : elegida ? String(elegida) : "")
    const r = resumenes.find((x) => String(x.planta.id) === base.planta_id)
    if (r?.etapa_actual) base.etapa = r.etapa_actual
    if (r?.semana_actual !== null && r?.semana_actual !== undefined) base.semana = String(r.semana_actual)
    setFormObs(base)
    setObsAbierta(true)
  }

  async function guardarObs(e: React.FormEvent) {
    e.preventDefault()
    const plantaId = Number(formObs.planta_id)
    const planta = plantas.find((p) => p.id === plantaId)
    if (!planta) {
      toast({ title: "Elegí la planta", variant: "destructive" })
      return
    }
    const fila: Record<string, unknown> = {
      planta_id: plantaId,
      fecha: formObs.fecha || hoy,
      etapa: formObs.etapa,
      semana: numOnull(formObs.semana),
      altura_cm: numOnull(formObs.altura_cm),
      nudos: formObs.nudos || null,
      forma: formObs.forma || null,
      salud: formObs.salud || null,
      olor: formObs.olor.trim() || null,
      peso_humedo_g: numOnull(formObs.peso_humedo_g),
      peso_seco_g: numOnull(formObs.peso_seco_g),
      nota: formObs.nota.trim() || null,
    }
    for (const p of PUNTAJES) fila[p] = numOnull(formObs[p])
    const supabase = createClient()
    setGuardando(true)
    const { data, error } = await supabase.from("fenotipado_observaciones").insert(fila).select().single()
    if (error) {
      setGuardando(false)
      toast({ title: "No se pudo guardar", description: error.message, variant: "destructive" })
      return
    }
    const cambios: Partial<PlantaFeno> = {}
    if (formObs.sexo && formObs.sexo !== planta.sexo) cambios.sexo = formObs.sexo as SexoFeno
    if (formObs.estado && formObs.estado !== planta.estado) cambios.estado = formObs.estado as EstadoFeno
    if (Object.keys(cambios).length) {
      const { error: errP } = await supabase
        .from("fenotipado_plantas")
        .update({ ...cambios, updated_at: new Date().toISOString() })
        .eq("id", plantaId)
      if (!errP) setPlantas((cur) => cur.map((p) => (p.id === plantaId ? { ...p, ...cambios } : p)))
    }
    setGuardando(false)
    setObs((cur) => [...cur, data as ObservacionFeno])
    setObsAbierta(false)
    toast({ title: `Anotado en ${planta.codigo}` })
    if (cambios.sexo === "macho" || cambios.sexo === "hermafrodita") {
      toast({ title: `${planta.codigo} es ${SEXO_FENO_LABEL[cambios.sexo].toLowerCase()}`, description: "Avisale a Lucho y sacala de la sala si no se va a usar.", variant: "destructive" })
    }
  }

  async function cambiarPlanta(planta: PlantaFeno, cambios: Partial<PlantaFeno>) {
    const { error } = await createClient()
      .from("fenotipado_plantas")
      .update({ ...cambios, updated_at: new Date().toISOString() })
      .eq("id", planta.id)
    if (error) {
      toast({ title: "No se pudo cambiar", description: error.message, variant: "destructive" })
      return
    }
    setPlantas((cur) => cur.map((p) => (p.id === planta.id ? { ...p, ...cambios } : p)))
  }

  const puedeBorrar = (o: ObservacionFeno) =>
    puedeEditar || (o.cargado_por === userId && !!o.created_at && Date.now() - Date.parse(o.created_at) < 24 * 3600 * 1000)

  async function borrarObs(o: ObservacionFeno) {
    if (!confirm(`¿Borrar la observación del ${o.fecha}? No se puede deshacer.`)) return
    const { error } = await createClient().from("fenotipado_observaciones").delete().eq("id", o.id)
    if (error) {
      toast({ title: "No se pudo borrar", description: error.message, variant: "destructive" })
      return
    }
    setObs((cur) => cur.filter((x) => x.id !== o.id))
  }

  // ---------- IA ----------
  async function contarleALaIA(e: React.FormEvent) {
    e.preventDefault()
    const texto = mensajeIA.trim()
    if (!texto) return
    setPensando(true)
    setRespuestaIA("")
    try {
      const r = await fetch("/api/asistente", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mensaje: `[Fenotipado] ${texto}` }),
      })
      const j = (await r.json().catch(() => ({}))) as { respuesta?: string; error?: string }
      setRespuestaIA(j.respuesta ?? j.error ?? "No hubo respuesta.")
      if (r.ok) {
        setMensajeIA("")
        await recargar()
      }
    } catch {
      setRespuestaIA("No se pudo hablar con la IA. Probá de nuevo o cargalo con el botón Anotar.")
    }
    setPensando(false)
  }

  async function pedirResumen() {
    setResumiendo(true)
    setResumenIA("")
    try {
      const r = await fetch("/api/fenotipado/resumen", { method: "POST" })
      const j = (await r.json().catch(() => ({}))) as { resumen?: string; error?: string }
      setResumenIA(j.resumen ?? j.error ?? "No hubo respuesta.")
    } catch {
      setResumenIA("No se pudo pedir el resumen. Probá en un rato.")
    }
    setResumiendo(false)
  }

  if (tablaFaltante) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Fenotipado</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Falta activar esta pantalla: hay que correr el script <b>104_fenotipado.sql</b> en Supabase.
        </CardContent>
      </Card>
    )
  }

  const fichaPlanta = (r: ResumenPlanta) => {
    const p = r.planta
    const dias = diasDesde(p.fecha_germinacion, hoy)
    return (
      <div key={p.id} className="rounded-lg border bg-card p-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-base font-semibold">{p.codigo}</span>
          <Badge className={ESTADO_COLOR[p.estado] ?? ""} variant="secondary">{ESTADO_FENO_LABEL[p.estado] ?? p.estado}</Badge>
          {p.sexo !== "sin_definir" && (
            <Badge variant={p.sexo === "hembra" ? "outline" : "destructive"}>{SEXO_FENO_LABEL[p.sexo]}</Badge>
          )}
          {r.puntaje_promedio !== null && <Badge variant="outline">★ {r.puntaje_promedio}</Badge>}
        </div>
        <p className="mt-1 text-muted-foreground">
          {dias !== null ? `${dias} días` : "Sin fecha de germinación"}
          {r.etapa_actual ? ` · ${ETAPA_FENO_LABEL[r.etapa_actual]}${r.semana_actual !== null ? ` sem ${r.semana_actual}` : ""}` : ""}
          {r.altura_actual !== null ? ` · ${r.altura_actual} cm` : ""}
          {r.crecimiento_cm_semana !== null ? ` · +${r.crecimiento_cm_semana} cm/sem` : ""}
        </p>
        {r.ultimo_olor && <p className="mt-1">Olor: {r.ultimo_olor}</p>}
        {r.ultima_nota && <p className="mt-1 line-clamp-2">“{r.ultima_nota}”</p>}
        {r.alertas.map((a) => (
          <p key={a} className="mt-1 flex items-center gap-1 text-amber-700">
            <AlertTriangle className="h-3.5 w-3.5" /> {a}
          </p>
        ))}
        <div className="mt-2 flex gap-2">
          <Button size="sm" variant="outline" onClick={() => abrirAnotar(p)}>
            <NotebookPen className="mr-1 h-4 w-4" /> Anotar
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setElegida(p.id)
              setTab("evolucion")
            }}
          >
            <LineChart className="mr-1 h-4 w-4" /> Evolución
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-bold text-emerald-900">
            <Dna className="h-6 w-6" /> Fenotipado
          </h2>
          <p className="text-muted-foreground">Seguimiento de las plantas de semilla para elegir con qué fenotipos quedarnos como madres.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setAltaAbierta(true)}>
            <Plus className="mr-1 h-4 w-4" /> Nuevas plantas
          </Button>
          <Button onClick={() => abrirAnotar()} disabled={!plantas.length}>
            <NotebookPen className="mr-1 h-4 w-4" /> Anotar
          </Button>
        </div>
      </div>

      {puedeUsarAsistente && (
        <Card className="border-emerald-200 bg-emerald-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageCircle className="h-4 w-4" /> Contáselo a la IA
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={contarleALaIA} className="space-y-2">
              <Textarea
                value={mensajeIA}
                onChange={(e) => setMensajeIA(e.target.value)}
                rows={2}
                placeholder="Ej.: la GEL-03 mide 25 cm, nudos cortos, huele a lima. La GEL-05 es macho."
              />
              <div className="flex items-center gap-2">
                <Button type="submit" size="sm" disabled={pensando || !mensajeIA.trim()}>
                  {pensando ? "Anotando…" : "Enviar"}
                </Button>
                <span className="text-xs text-muted-foreground">La IA lo guarda en la planta que corresponda y te dice qué anotó.</span>
              </div>
            </form>
            {respuestaIA && <p className="mt-3 whitespace-pre-wrap rounded-md bg-white p-3 text-sm">{respuestaIA}</p>}
          </CardContent>
        </Card>
      )}

      {alertas.length > 0 && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="space-y-1 pt-4 text-sm text-amber-900">
            {alertas.map((a) => (
              <p key={a} className="flex items-center gap-1">
                <AlertTriangle className="h-4 w-4 shrink-0" /> {a}
              </p>
            ))}
          </CardContent>
        </Card>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="plantas">Plantas</TabsTrigger>
          <TabsTrigger value="evolucion">Evolución</TabsTrigger>
          <TabsTrigger value="resumen">Resumen</TabsTrigger>
        </TabsList>

        <TabsContent value="plantas" className="space-y-6">
          {!plantas.length && (
            <p className="text-sm text-muted-foreground">
              Todavía no hay plantas. Tocá <b>Nuevas plantas</b>: cargás la genética y cuántas semillas, y el sistema arma los códigos (GEL-01, GEL-02…).
            </p>
          )}
          {ranking.map((g) => (
            <section key={g.genetica} className="space-y-2">
              <h3 className="font-semibold text-emerald-900">
                {g.genetica} <span className="text-sm font-normal text-muted-foreground">· {g.plantas.length} plantas</span>
              </h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{g.plantas.map(fichaPlanta)}</div>
            </section>
          ))}
        </TabsContent>

        <TabsContent value="evolucion" className="space-y-4">
          <div className="max-w-xs space-y-1">
            <Label htmlFor="feno_planta">Planta</Label>
            <select id="feno_planta" className={selectClase} value={elegida ?? ""} onChange={(e) => setElegida(Number(e.target.value) || null)}>
              {plantas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.codigo} · {p.genetica}
                </option>
              ))}
            </select>
          </div>
          {actual && (
            <>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">
                    {actual.planta.codigo} · {actual.planta.genetica}
                    {actual.planta.banco ? ` (${actual.planta.banco})` : ""}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="space-y-1">
                      <Label>Estado</Label>
                      <select
                        className={selectClase}
                        value={actual.planta.estado}
                        onChange={(e) => cambiarPlanta(actual.planta, { estado: e.target.value as EstadoFeno })}
                      >
                        {ESTADOS_FENO.map((s) => (
                          <option key={s} value={s}>{ESTADO_FENO_LABEL[s]}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <Label>Sexo</Label>
                      <select
                        className={selectClase}
                        value={actual.planta.sexo}
                        onChange={(e) => cambiarPlanta(actual.planta, { sexo: e.target.value as SexoFeno })}
                      >
                        {SEXOS_FENO.map((s) => (
                          <option key={s} value={s}>{SEXO_FENO_LABEL[s]}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1 text-muted-foreground">
                      <Label>Datos</Label>
                      <p>
                        Germinó {actual.planta.fecha_germinacion ?? "—"}
                        {actual.planta.ubicacion ? ` · ${actual.planta.ubicacion}` : ""}
                      </p>
                      <p>
                        {actual.observaciones} revisiones
                        {actual.estiramiento_cm !== null ? ` · estiró ${actual.estiramiento_cm} cm en flora` : ""}
                      </p>
                    </div>
                  </div>
                  <div>
                    <p className="mb-1 font-medium">Altura (cm)</p>
                    <GraficoAltura puntos={actual.alturas} />
                  </div>
                  <div>
                    <p className="mb-1 font-medium">Puntajes (último cargado de cada uno)</p>
                    <div className="grid max-w-md gap-1">
                      {PUNTAJES.map((k) => (
                        <div key={k} className="flex items-center gap-2">
                          <span className="w-24 text-muted-foreground">{PUNTAJE_LABEL[k]}</span>
                          <div className="h-2 flex-1 rounded bg-muted">
                            <div className="h-2 rounded bg-emerald-600" style={{ width: `${((actual.puntajes[k] ?? 0) / 5) * 100}%` }} />
                          </div>
                          <span className="w-6 text-right">{actual.puntajes[k] ?? "—"}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Etapa</TableHead>
                      <TableHead className="text-right">Altura</TableHead>
                      <TableHead>Nudos · forma · salud</TableHead>
                      <TableHead>Olor</TableHead>
                      <TableHead>Puntajes</TableHead>
                      <TableHead>Nota</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {!obsActual.length && (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center text-muted-foreground">
                          Todavía no hay revisiones de esta planta.
                        </TableCell>
                      </TableRow>
                    )}
                    {obsActual.map((o) => (
                      <TableRow key={o.id}>
                        <TableCell className="whitespace-nowrap">{o.fecha}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          {ETAPA_FENO_LABEL[o.etapa]}
                          {o.semana !== null ? ` ${o.semana}` : ""}
                        </TableCell>
                        <TableCell className="text-right">{o.altura_cm ?? "—"}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          {[o.nudos, o.forma ? FORMA_LABEL[o.forma] : null, o.salud].filter(Boolean).join(" · ") || "—"}
                        </TableCell>
                        <TableCell>{o.olor ?? "—"}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs">
                          {PUNTAJES.filter((k) => o[k] !== null)
                            .map((k) => `${PUNTAJE_LABEL[k].slice(0, 4)} ${o[k]}`)
                            .join(" · ") || "—"}
                        </TableCell>
                        <TableCell className="min-w-[12rem]">
                          {o.nota ?? ""}
                          {o.peso_seco_g !== null ? ` (seco ${o.peso_seco_g} g)` : ""}
                          {o.origen === "asistente" && <span className="ml-1 text-xs text-muted-foreground">· vía IA</span>}
                        </TableCell>
                        <TableCell>
                          {puedeBorrar(o) && (
                            <Button size="icon" variant="ghost" aria-label="Borrar observación" onClick={() => borrarObs(o)}>
                              <Trash2 className="h-4 w-4 text-red-600" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="resumen" className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={pedirResumen} disabled={resumiendo || !plantas.length}>
              <Sparkles className="mr-1 h-4 w-4" /> {resumiendo ? "Armando el resumen…" : "Pedir resumen a la IA"}
            </Button>
            <span className="text-xs text-muted-foreground">Lee todas las revisiones y recomienda qué plantas conservar como madre.</span>
          </div>
          {resumenIA && (
            <Card>
              <CardContent className="whitespace-pre-wrap pt-4 text-sm">{resumenIA}</CardContent>
            </Card>
          )}
          {ranking.map((g) => (
            <section key={g.genetica} className="space-y-2">
              <h3 className="font-semibold text-emerald-900">{g.genetica}</h3>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Planta</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead className="text-right">Altura</TableHead>
                      <TableHead className="text-right">cm/sem</TableHead>
                      <TableHead className="text-right">Estiró</TableHead>
                      {PUNTAJES.map((k) => (
                        <TableHead key={k} className="text-right">{PUNTAJE_LABEL[k].slice(0, 4)}.</TableHead>
                      ))}
                      <TableHead className="text-right">Prom.</TableHead>
                      <TableHead className="text-right">Seco (g)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {g.plantas.map((r) => (
                      <TableRow key={r.planta.id}>
                        <TableCell className="font-medium">{r.planta.codigo}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs">
                          {ESTADO_FENO_LABEL[r.planta.estado] ?? r.planta.estado}
                          {r.planta.sexo !== "sin_definir" && r.planta.sexo ? ` · ${SEXO_FENO_LABEL[r.planta.sexo]}` : ""}
                        </TableCell>
                        <TableCell className="text-right">{r.altura_actual ?? "—"}</TableCell>
                        <TableCell className="text-right">{r.crecimiento_cm_semana ?? "—"}</TableCell>
                        <TableCell className="text-right">{r.estiramiento_cm ?? "—"}</TableCell>
                        {PUNTAJES.map((k) => (
                          <TableCell key={k} className="text-right">{r.puntajes[k] ?? "—"}</TableCell>
                        ))}
                        <TableCell className="text-right font-semibold">{r.puntaje_promedio ?? "—"}</TableCell>
                        <TableCell className="text-right">{r.peso_seco_g ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </section>
          ))}
        </TabsContent>
      </Tabs>

      {/* Alta de plantas */}
      <Dialog open={altaAbierta} onOpenChange={setAltaAbierta}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nuevas plantas de semilla</DialogTitle>
          </DialogHeader>
          <form onSubmit={guardarAlta} className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="alta_genetica">Genética</Label>
              <Input
                id="alta_genetica"
                value={formAlta.genetica}
                onChange={(e) => {
                  const genetica = e.target.value
                  const sugerido = genetica.replace(/[^A-Za-zÑñ]/g, "").slice(0, 3).toUpperCase()
                  setFormAlta((f) => ({ ...f, genetica, prefijo: f.prefijo && f.prefijo !== f.genetica.replace(/[^A-Za-zÑñ]/g, "").slice(0, 3).toUpperCase() ? f.prefijo : sugerido }))
                }}
                placeholder="Ej.: Gelato 41"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="alta_prefijo">Abreviatura</Label>
                <Input id="alta_prefijo" value={formAlta.prefijo} maxLength={5} onChange={(e) => setFormAlta({ ...formAlta, prefijo: e.target.value.toUpperCase() })} placeholder="GEL" required />
              </div>
              <div className="space-y-1">
                <Label htmlFor="alta_cantidad">Cantidad de semillas</Label>
                <Input id="alta_cantidad" type="number" min={1} max={30} value={formAlta.cantidad} onChange={(e) => setFormAlta({ ...formAlta, cantidad: e.target.value })} required />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Códigos: {(() => {
                const pre = formAlta.prefijo.replace(/[^A-ZÑ]/g, "")
                const c = normalizarCodigo(`${pre}1`)
                return pre.length >= 2 && c ? `${c}, ${pre}-02…` : "elegí una abreviatura de 2 a 5 letras"
              })()}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="alta_banco">Banco (opcional)</Label>
                <Input id="alta_banco" value={formAlta.banco} onChange={(e) => setFormAlta({ ...formAlta, banco: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="alta_fecha">Germinación</Label>
                <Input id="alta_fecha" type="date" value={formAlta.fecha_germinacion} onChange={(e) => setFormAlta({ ...formAlta, fecha_germinacion: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="alta_ubicacion">Dónde está (opcional)</Label>
              <Input id="alta_ubicacion" value={formAlta.ubicacion} onChange={(e) => setFormAlta({ ...formAlta, ubicacion: e.target.value })} placeholder="Ej.: Sala 3, estante 2" />
            </div>
            <Button type="submit" className="w-full" disabled={guardando}>
              {guardando ? "Guardando…" : "Cargar plantas"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Anotar observación */}
      <Dialog open={obsAbierta} onOpenChange={setObsAbierta}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Anotar revisión</DialogTitle>
          </DialogHeader>
          <form onSubmit={guardarObs} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1">
                <Label htmlFor="obs_planta">Planta</Label>
                <select id="obs_planta" className={selectClase} value={formObs.planta_id} onChange={(e) => setFormObs({ ...formObs, planta_id: e.target.value })} required>
                  <option value="">Elegí…</option>
                  {plantas.map((p) => (
                    <option key={p.id} value={p.id}>{p.codigo} · {p.genetica}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="obs_fecha">Fecha</Label>
                <Input id="obs_fecha" type="date" value={formObs.fecha} onChange={(e) => setFormObs({ ...formObs, fecha: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="obs_etapa">Etapa y semana</Label>
                <div className="flex gap-2">
                  <select id="obs_etapa" className={selectClase} value={formObs.etapa} onChange={(e) => setFormObs({ ...formObs, etapa: e.target.value as EtapaFeno })}>
                    {ETAPAS_FENO.map((e) => (
                      <option key={e} value={e}>{ETAPA_FENO_LABEL[e]}</option>
                    ))}
                  </select>
                  <Input aria-label="Semana" className="w-16" inputMode="numeric" placeholder="sem" value={formObs.semana} onChange={(e) => setFormObs({ ...formObs, semana: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="obs_altura">Altura (cm)</Label>
                <Input id="obs_altura" inputMode="decimal" value={formObs.altura_cm} onChange={(e) => setFormObs({ ...formObs, altura_cm: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="obs_nudos">Nudos</Label>
                <select id="obs_nudos" className={selectClase} value={formObs.nudos} onChange={(e) => setFormObs({ ...formObs, nudos: e.target.value })}>
                  <option value="">—</option>
                  {NUDOS.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="obs_forma">Forma</Label>
                <select id="obs_forma" className={selectClase} value={formObs.forma} onChange={(e) => setFormObs({ ...formObs, forma: e.target.value })}>
                  <option value="">—</option>
                  {FORMAS.map((f) => <option key={f} value={f}>{FORMA_LABEL[f]}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="obs_salud">Salud</Label>
                <select id="obs_salud" className={selectClase} value={formObs.salud} onChange={(e) => setFormObs({ ...formObs, salud: e.target.value })}>
                  <option value="">—</option>
                  {SALUDES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="col-span-2 space-y-1">
                <Label htmlFor="obs_olor">Olor (frotando el tallo o el cogollo)</Label>
                <Input id="obs_olor" value={formObs.olor} onChange={(e) => setFormObs({ ...formObs, olor: e.target.value })} placeholder="Ej.: lima, gas, dulce" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="obs_sexo">Sexo</Label>
                <select id="obs_sexo" className={selectClase} value={formObs.sexo} onChange={(e) => setFormObs({ ...formObs, sexo: e.target.value })}>
                  <option value="">Sin cambios</option>
                  {SEXOS_FENO.filter((s) => s !== "sin_definir").map((s) => <option key={s} value={s}>{SEXO_FENO_LABEL[s]}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="obs_estado">Estado</Label>
                <select id="obs_estado" className={selectClase} value={formObs.estado} onChange={(e) => setFormObs({ ...formObs, estado: e.target.value })}>
                  <option value="">Sin cambios</option>
                  {ESTADOS_FENO.map((s) => <option key={s} value={s}>{ESTADO_FENO_LABEL[s]}</option>)}
                </select>
              </div>
            </div>

            <details className="rounded-md border p-3">
              <summary className="cursor-pointer text-sm font-medium">Puntajes de 1 a 5 (al cerrar cada etapa)</summary>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {PUNTAJES.map((k) => (
                  <div key={k} className="space-y-1">
                    <Label htmlFor={`obs_${k}`}>{PUNTAJE_LABEL[k]}</Label>
                    <select id={`obs_${k}`} className={selectClase} value={formObs[k]} onChange={(e) => setFormObs({ ...formObs, [k]: e.target.value })}>
                      <option value="">—</option>
                      {[1, 2, 3, 4, 5].map((v) => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </details>

            {(formObs.etapa === "cosecha" || formObs.etapa === "curado") && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="obs_ph">Peso húmedo (g)</Label>
                  <Input id="obs_ph" inputMode="decimal" value={formObs.peso_humedo_g} onChange={(e) => setFormObs({ ...formObs, peso_humedo_g: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="obs_ps">Peso seco (g)</Label>
                  <Input id="obs_ps" inputMode="decimal" value={formObs.peso_seco_g} onChange={(e) => setFormObs({ ...formObs, peso_seco_g: e.target.value })} />
                </div>
              </div>
            )}

            <div className="space-y-1">
              <Label htmlFor="obs_nota">Nota</Label>
              <Textarea id="obs_nota" rows={2} value={formObs.nota} onChange={(e) => setFormObs({ ...formObs, nota: e.target.value })} placeholder="Lo que veas: cómo responde a la poda, plagas, estiramiento…" />
            </div>
            <Button type="submit" className="w-full" disabled={guardando}>
              {guardando ? "Guardando…" : "Guardar revisión"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
