"use client"

import type React from "react"
import { useMemo, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import type { RegistroRiego, SalaCultivo } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { AlertTriangle, CheckCircle2, Droplets, Info, Plus, Trash2 } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { getArgentinaDateString } from "@/lib/timezone"
import { ETAPAS, evaluarRiego, parseDecimal, type EtapaRiego } from "@/lib/riego"
import { destinatariosAlertaRiego, type Perfil } from "@/lib/equipo"
import { cicloActual, etapaRiegoDe, momentoCiclo, type CicloSala } from "@/lib/ciclo"

interface Props {
  salas: SalaCultivo[]
  initialRegistros: RegistroRiego[]
  tablaFaltante: boolean
  /** Perfil del usuario logueado (null con la cuenta admin compartida). */
  perfil?: Perfil | null
  perfiles?: Perfil[]
  /** Ciclos abiertos: con ellos, al elegir la sala se completan etapa y semana. */
  ciclos?: CicloSala[]
}

const RESPONSABLES = ["Lucho", "Vilela", "Pato", "Demian", "Facundo"]

const formVacio = (responsable = "Lucho") => ({
  fecha: getArgentinaDateString(),
  sala_id: "",
  etapa: "floracion" as EtapaRiego,
  semana: "",
  responsable,
  ec_entrada: "",
  ph_entrada: "",
  litros_por_maceta: "",
  ec_runoff: "",
  ph_runoff: "",
  drenaje_pct: "",
  notas: "",
})

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function alertasDe(r: RegistroRiego) {
  return evaluarRiego({
    etapa: r.etapa,
    semana: num(r.semana),
    ec_entrada: num(r.ec_entrada),
    ph_entrada: num(r.ph_entrada),
    ec_runoff: num(r.ec_runoff),
    ph_runoff: num(r.ph_runoff),
    drenaje_pct: num(r.drenaje_pct),
  })
}

function mostrar(v: unknown, dec = 1): string {
  const n = num(v)
  return n === null ? "—" : n.toFixed(dec).replace(".", ",")
}

export function RegistroRiegoManager({ salas, initialRegistros, tablaFaltante, perfil = null, perfiles = [], ciclos = [] }: Props) {
  const [registros, setRegistros] = useState(initialRegistros)
  const [form, setForm] = useState(() => formVacio(perfil?.nombre ?? "Lucho"))
  const [showForm, setShowForm] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [filtroSala, setFiltroSala] = useState("todas")
  const { toast } = useToast()
  const supabase = createClient()

  const nombreSala = (id: number) => salas.find((s) => s.id === id)?.nombre ?? `Sala ${id}`
  const etapaInfo = ETAPAS.find((e) => e.value === form.etapa)

  const vistaPrevia = useMemo(
    () =>
      evaluarRiego({
        etapa: form.etapa,
        semana: parseDecimal(form.semana),
        ec_entrada: parseDecimal(form.ec_entrada),
        ph_entrada: parseDecimal(form.ph_entrada),
        ec_runoff: parseDecimal(form.ec_runoff),
        ph_runoff: parseDecimal(form.ph_runoff),
        drenaje_pct: parseDecimal(form.drenaje_pct),
      }),
    [form],
  )

  const visibles = registros.filter((r) => filtroSala === "todas" || String(r.sala_id) === filtroSala)

  // Último riego por sala, para ver de un vistazo cuál está pendiente.
  const ultimoPorSala = useMemo(() => {
    const m = new Map<number, RegistroRiego>()
    for (const r of registros) if (!m.has(r.sala_id)) m.set(r.sala_id, r)
    return m
  }, [registros])

  // Con el ciclo de la sala, el sistema ya sabe la etapa y la semana.
  function cicloDe(salaId: string, fecha: string) {
    return salaId ? cicloActual(ciclos, Number(salaId), fecha) : null
  }
  function elegirSala(v: string) {
    const c = cicloDe(v, form.fecha)
    const er = c ? etapaRiegoDe(momentoCiclo(c, form.fecha)) : null
    setForm((f) => ({ ...f, sala_id: v, ...(er ? { etapa: er.etapa, semana: er.semana ? String(er.semana) : "" } : {}) }))
  }
  const cicloForm = cicloDe(form.sala_id, form.fecha)

  const set = (campo: keyof ReturnType<typeof formVacio>) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => setForm((f) => ({ ...f, [campo]: e.target.value }))

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    if (!form.sala_id) {
      toast({ title: "Falta la sala", description: "Elegí qué sala se regó.", variant: "destructive" })
      return
    }
    const semana = parseDecimal(form.semana)
    const fila = {
      fecha: form.fecha,
      sala_id: Number(form.sala_id),
      etapa: form.etapa,
      semana: semana === null ? null : Math.round(semana),
      responsable: form.responsable.trim(),
      ec_entrada: parseDecimal(form.ec_entrada),
      ph_entrada: parseDecimal(form.ph_entrada),
      litros_por_maceta: parseDecimal(form.litros_por_maceta),
      ec_runoff: parseDecimal(form.ec_runoff),
      ph_runoff: parseDecimal(form.ph_runoff),
      drenaje_pct: (() => {
        const d = parseDecimal(form.drenaje_pct)
        return d === null ? null : Math.round(d)
      })(),
      notas: form.notas.trim() || null,
      ...(perfil ? { cargado_por: perfil.id } : {}),
      ...(cicloForm ? { ciclo_id: cicloForm.id } : {}),
    }
    setGuardando(true)
    const { data, error } = await supabase.from("registros_riego").insert(fila).select().single()
    setGuardando(false)
    if (error || !data) {
      toast({
        title: "No se pudo guardar",
        description: error?.message ?? "Error desconocido",
        variant: "destructive",
      })
      return
    }
    setRegistros((rs) => [data as RegistroRiego, ...rs].sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0)))
    // Se conservan sala, etapa, semana y responsable para cargar la sala siguiente rápido.
    setForm((f) => ({ ...formVacio(), fecha: f.fecha, etapa: f.etapa, semana: f.semana, responsable: f.responsable, ec_entrada: f.ec_entrada, ph_entrada: f.ph_entrada }))
    const alertas = alertasDe(data as RegistroRiego)
    const graves = alertas.filter((a) => a.nivel === "atencion")
    // Con usuario propio, las alertas le llegan como aviso a Facundo, Lucho y al supervisor.
    if (perfil && graves.length > 0) {
      const destinos = destinatariosAlertaRiego(perfil, perfiles)
      if (destinos.length > 0) {
        await supabase.from("notificaciones").insert(
          destinos.map((d) => ({
            destinatario_id: d,
            autor_id: perfil.id,
            tipo: "riego",
            titulo: `Riego ${nombreSala(fila.sala_id)}: ${graves.length} alerta(s) (${perfil.nombre})`,
            cuerpo: graves.map((a) => a.mensaje).join("\n"),
            enlace: "/riego",
          })),
        )
      }
    }
    toast({
      title: "Riego registrado",
      description: alertas.length ? `${alertas.length} alerta(s) para revisar.` : "Todo dentro de lo esperado.",
    })
  }

  async function eliminar(id: number) {
    if (!window.confirm("¿Eliminar este registro de riego?")) return
    const { error } = await supabase.from("registros_riego").delete().eq("id", id)
    if (error) {
      toast({ title: "No se pudo eliminar", description: error.message, variant: "destructive" })
      return
    }
    setRegistros((rs) => rs.filter((r) => r.id !== id))
  }

  if (tablaFaltante) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Registro de riego</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Falta crear la tabla en la base de datos. Correr <code>scripts/066_create_registros_riego.sql</code> en el SQL
          Editor de Supabase.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Droplets className="h-6 w-6" /> Registro de riego
          </h1>
          <p className="text-sm text-muted-foreground">
            Prueba piloto. Reemplaza la planilla en papel: entrada, runoff de las 2 macetas testigo y alertas según el
            Manual 3.
          </p>
        </div>
        <Button onClick={() => setShowForm((v) => !v)}>
          <Plus className="mr-2 h-4 w-4" /> {showForm ? "Cerrar" : "Cargar riego"}
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {salas.map((s) => {
          const u = ultimoPorSala.get(s.id)
          const n = u ? alertasDe(u).filter((a) => a.nivel === "atencion").length : 0
          return (
            <Card key={s.id}>
              <CardContent className="p-4">
                <div className="font-medium">{s.nombre}</div>
                <div className="text-sm text-muted-foreground">
                  {u ? `Último riego: ${u.fecha.split("-").reverse().join("/")}` : "Sin riegos cargados"}
                </div>
                {u && (
                  <Badge variant={n ? "destructive" : "secondary"} className="mt-2">
                    {n ? `${n} alerta(s)` : "OK"}
                  </Badge>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>Nuevo riego</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={guardar} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <div className="space-y-1">
                  <Label htmlFor="fecha">Fecha</Label>
                  <Input id="fecha" type="date" value={form.fecha} onChange={set("fecha")} required />
                </div>
                <div className="space-y-1">
                  <Label>Sala</Label>
                  <Select value={form.sala_id} onValueChange={elegirSala}>
                    <SelectTrigger>
                      <SelectValue placeholder="Elegir" />
                    </SelectTrigger>
                    <SelectContent>
                      {salas.map((s) => (
                        <SelectItem key={s.id} value={String(s.id)}>
                          {s.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {cicloForm && (
                    <p className="text-xs text-muted-foreground">Etapa y semana tomadas del ciclo de la sala.</p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label>Etapa</Label>
                  <Select
                    value={form.etapa}
                    onValueChange={(v) => setForm((f) => ({ ...f, etapa: v as EtapaRiego, semana: "" }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ETAPAS.map((e) => (
                        <SelectItem key={e.value} value={e.value}>
                          {e.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="semana">Semana</Label>
                  <Input
                    id="semana"
                    inputMode="numeric"
                    placeholder={etapaInfo?.semanas ? `1 a ${etapaInfo.semanas}` : "—"}
                    disabled={!etapaInfo?.semanas}
                    value={form.semana}
                    onChange={set("semana")}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="responsable">Responsable</Label>
                  <Input id="responsable" list="responsables" value={form.responsable} onChange={set("responsable")} required />
                  <datalist id="responsables">
                    {RESPONSABLES.map((r) => (
                      <option key={r} value={r} />
                    ))}
                  </datalist>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <fieldset className="space-y-3 rounded-md border p-3 sm:col-span-1">
                  <legend className="px-1 text-sm font-medium">Entrada (tanque)</legend>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1">
                      <Label htmlFor="ec_entrada">EC</Label>
                      <Input id="ec_entrada" inputMode="decimal" placeholder="1,8" value={form.ec_entrada} onChange={set("ec_entrada")} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="ph_entrada">pH</Label>
                      <Input id="ph_entrada" inputMode="decimal" placeholder="6,0" value={form.ph_entrada} onChange={set("ph_entrada")} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="litros">L/maceta</Label>
                      <Input id="litros" inputMode="decimal" placeholder="1,0" value={form.litros_por_maceta} onChange={set("litros_por_maceta")} />
                    </div>
                  </div>
                </fieldset>
                <fieldset className="space-y-3 rounded-md border p-3 sm:col-span-1">
                  <legend className="px-1 text-sm font-medium">Runoff (2 macetas testigo)</legend>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1">
                      <Label htmlFor="ec_runoff">EC</Label>
                      <Input id="ec_runoff" inputMode="decimal" placeholder="2,0" value={form.ec_runoff} onChange={set("ec_runoff")} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="ph_runoff">pH</Label>
                      <Input id="ph_runoff" inputMode="decimal" placeholder="6,1" value={form.ph_runoff} onChange={set("ph_runoff")} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="drenaje">Drenaje %</Label>
                      <Input id="drenaje" inputMode="numeric" placeholder="18" value={form.drenaje_pct} onChange={set("drenaje_pct")} />
                    </div>
                  </div>
                </fieldset>
                <div className="space-y-1 sm:col-span-1">
                  <Label htmlFor="notas">Notas</Label>
                  <Textarea id="notas" rows={4} placeholder="Señales en las plantas, ajustes, etc." value={form.notas} onChange={set("notas")} />
                </div>
              </div>

              <div className="rounded-md bg-muted p-3 text-sm">
                {vistaPrevia.length === 0 ? (
                  <span className="flex items-center gap-2 text-green-700">
                    <CheckCircle2 className="h-4 w-4" /> Dentro de lo esperado.
                  </span>
                ) : (
                  <ul className="space-y-1">
                    {vistaPrevia.map((a, i) => (
                      <li key={i} className={`flex items-start gap-2 ${a.nivel === "atencion" ? "text-red-700" : "text-muted-foreground"}`}>
                        {a.nivel === "atencion" ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> : <Info className="mt-0.5 h-4 w-4 shrink-0" />}
                        {a.mensaje}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <Button type="submit" disabled={guardando}>
                {guardando ? "Guardando…" : "Guardar riego"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle>Últimos 60 días</CardTitle>
          <Select value={filtroSala} onValueChange={setFiltroSala}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas las salas</SelectItem>
              {salas.map((s) => (
                <SelectItem key={s.id} value={String(s.id)}>
                  {s.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {visibles.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todavía no hay riegos cargados.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Sala</TableHead>
                  <TableHead>Etapa</TableHead>
                  <TableHead className="text-right">EC in</TableHead>
                  <TableHead className="text-right">pH in</TableHead>
                  <TableHead className="text-right">EC out</TableHead>
                  <TableHead className="text-right">pH out</TableHead>
                  <TableHead className="text-right">Dren.</TableHead>
                  <TableHead>Quién</TableHead>
                  <TableHead>Alertas</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibles.map((r) => {
                  const alertas = alertasDe(r)
                  const etapa = ETAPAS.find((e) => e.value === r.etapa)?.label ?? r.etapa
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap">{r.fecha.split("-").reverse().join("/")}</TableCell>
                      <TableCell>{nombreSala(r.sala_id)}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {etapa}
                        {r.semana ? ` S${r.semana}` : ""}
                      </TableCell>
                      <TableCell className="text-right">{mostrar(r.ec_entrada, 2)}</TableCell>
                      <TableCell className="text-right">{mostrar(r.ph_entrada)}</TableCell>
                      <TableCell className="text-right">{mostrar(r.ec_runoff, 2)}</TableCell>
                      <TableCell className="text-right">{mostrar(r.ph_runoff)}</TableCell>
                      <TableCell className="text-right">{r.drenaje_pct === null ? "—" : `${r.drenaje_pct} %`}</TableCell>
                      <TableCell>{r.responsable}</TableCell>
                      <TableCell className="min-w-56 text-xs">
                        {alertas.length === 0 ? (
                          <Badge variant="secondary">OK</Badge>
                        ) : (
                          alertas.map((a, i) => (
                            <div key={i} className={a.nivel === "atencion" ? "text-red-700" : "text-muted-foreground"}>
                              {a.mensaje}
                            </div>
                          ))
                        )}
                        {r.notas && <div className="mt-1 italic text-muted-foreground">{r.notas}</div>}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => eliminar(r.id)} aria-label="Eliminar">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
