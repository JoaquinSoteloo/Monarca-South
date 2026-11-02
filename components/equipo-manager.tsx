"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Bell, CheckCheck, ListChecks, MessageCircle, Plus, Repeat, Send } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { TareaItem } from "@/components/equipo/tarea-item"
import { Rutinas } from "@/components/equipo/rutinas"
import {
  ROL_LABEL,
  horaCorta,
  ordenarTareas,
  personasVisibles,
  progreso,
  type Mensaje,
  type Notificacion,
  type Perfil,
  type Tarea,
  type TareaPlantilla,
} from "@/lib/equipo"

interface Props {
  yo: Perfil
  hoy: string
  perfiles: Perfil[]
  initialTareas: Tarea[]
  initialPlantillas: TareaPlantilla[]
  initialAvisos: Notificacion[]
  initialChat: Mensaje[]
}

export function EquipoManager({ yo, hoy, perfiles, initialTareas, initialPlantillas, initialAvisos, initialChat }: Props) {
  const supabase = useMemo(() => createClient(), [])
  const { toast } = useToast()
  const [tab, setTab] = useState("tareas")
  const [fecha, setFecha] = useState(hoy)
  const [tareas, setTareas] = useState(initialTareas)
  const [plantillas, setPlantillas] = useState(initialPlantillas)
  const [avisos, setAvisos] = useState(initialAvisos)
  const [chat, setChat] = useState(initialChat)
  const [abierta, setAbierta] = useState<number | null>(null)
  const [filtro, setFiltro] = useState<string>("todas")

  const visibles = useMemo(() => personasVisibles(yo, perfiles), [yo, perfiles])
  const idsVisibles = useMemo(() => new Set(visibles.map((p) => p.id)), [visibles])
  const nombre = useCallback((id: string | null) => perfiles.find((p) => p.id === id)?.nombre ?? "—", [perfiles])
  const sinLeer = avisos.filter((a) => !a.leida).length

  // --- Tareas -------------------------------------------------------------
  async function cargarTareas(f: string) {
    await supabase.rpc("generar_tareas_del_dia", { p_fecha: f })
    const { data, error } = await supabase.from("tareas").select("*").eq("fecha", f)
    if (error) {
      toast({ title: "No se pudieron cargar las tareas", description: error.message, variant: "destructive" })
      return
    }
    setTareas((data || []) as Tarea[])
  }

  async function cambiarFecha(f: string) {
    setFecha(f)
    setAbierta(null)
    if (f) await cargarTareas(f)
  }

  const tareasVisibles = ordenarTareas(
    tareas.filter((t) => idsVisibles.has(t.responsable_id) && (filtro === "todas" || t.responsable_id === filtro)),
    perfiles,
    yo.id,
  )
  const porPersona = visibles
    .filter((p) => filtro === "todas" || p.id === filtro)
    .map((p) => ({ persona: p, tareas: tareasVisibles.filter((t) => t.responsable_id === p.id) }))
    .filter((g) => g.tareas.length > 0 || g.persona.id === yo.id)
    .sort((a, b) => (a.persona.id === yo.id ? -1 : b.persona.id === yo.id ? 1 : 0))

  // --- Nueva tarea --------------------------------------------------------
  const [nueva, setNueva] = useState({ titulo: "", detalle: "", responsable_id: yo.id, afecta_a: [] as string[], fecha: hoy })
  const [mostrarNueva, setMostrarNueva] = useState(false)

  async function crearTarea() {
    if (!nueva.titulo.trim()) {
      toast({ title: "Falta el título", variant: "destructive" })
      return
    }
    const { data, error } = await supabase
      .from("tareas")
      .insert({
        fecha: nueva.fecha,
        titulo: nueva.titulo.trim(),
        detalle: nueva.detalle.trim() || null,
        responsable_id: nueva.responsable_id,
        afecta_a: nueva.afecta_a,
        creada_por: yo.id,
        orden: 50,
      })
      .select()
      .single()
    if (error || !data) {
      toast({ title: "No se pudo crear", description: error?.message, variant: "destructive" })
      return
    }
    if (nueva.fecha === fecha) setTareas((ts) => [...ts, data as Tarea])
    toast({
      title: "Tarea cargada",
      description: nueva.responsable_id === yo.id ? undefined : `Le llega un aviso a ${nombre(nueva.responsable_id)}.`,
    })
    setNueva({ titulo: "", detalle: "", responsable_id: nueva.responsable_id, afecta_a: [], fecha: nueva.fecha })
    setMostrarNueva(false)
  }

  // --- Avisos -------------------------------------------------------------
  const cargarAvisos = useCallback(async () => {
    const { data } = await supabase.from("notificaciones").select("*").order("created_at", { ascending: false }).limit(60)
    if (data) setAvisos(data as Notificacion[])
  }, [supabase])

  async function marcarLeido(ids: number[]) {
    if (ids.length === 0) return
    await supabase.from("notificaciones").update({ leida: true }).in("id", ids)
    setAvisos((as) => as.map((a) => (ids.includes(a.id) ? { ...a, leida: true } : a)))
  }

  async function abrirAviso(a: Notificacion) {
    await marcarLeido([a.id])
    if (a.enlace && a.enlace !== "/equipo") {
      window.location.href = a.enlace
      return
    }
    if (a.tarea_id) {
      const { data } = await supabase.from("tareas").select("fecha").eq("id", a.tarea_id).maybeSingle()
      if (data?.fecha) {
        setFiltro("todas")
        await cambiarFecha(data.fecha as string)
        setAbierta(a.tarea_id)
        setTab("tareas")
      }
    }
  }

  // --- Chat ---------------------------------------------------------------
  const [texto, setTexto] = useState("")
  const finChat = useRef<HTMLDivElement>(null)

  const cargarChat = useCallback(async () => {
    const { data } = await supabase
      .from("mensajes")
      .select("*")
      .is("tarea_id", null)
      .order("created_at", { ascending: false })
      .limit(100)
    if (data) setChat((data as Mensaje[]).reverse())
  }, [supabase])

  async function enviar() {
    const cuerpo = texto.trim()
    if (!cuerpo) return
    const { data, error } = await supabase.from("mensajes").insert({ cuerpo, autor_id: yo.id }).select().single()
    if (error || !data) {
      toast({ title: "No se pudo enviar", description: error?.message, variant: "destructive" })
      return
    }
    setTexto("")
    setChat((c) => [...c, data as Mensaje])
  }

  // Actualización periódica: avisos siempre; chat cuando está abierto.
  useEffect(() => {
    const id = window.setInterval(() => {
      cargarAvisos()
      if (tab === "chat") cargarChat()
    }, 15000)
    return () => window.clearInterval(id)
  }, [tab, cargarAvisos, cargarChat])

  useEffect(() => {
    if (tab === "chat") finChat.current?.scrollIntoView({ block: "end" })
  }, [tab, chat.length])

  const activos = perfiles.filter((p) => p.activo)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Equipo</h1>
          <p className="text-sm text-muted-foreground">
            Hola, {yo.nombre} · {ROL_LABEL[yo.rol]}
            {yo.supervisor_id ? ` · lo que hacés le llega a ${nombre(yo.supervisor_id)}` : ""}
          </p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="gap-4">
        <TabsList>
          <TabsTrigger value="tareas">
            <ListChecks className="mr-1 h-4 w-4" /> Tareas
          </TabsTrigger>
          <TabsTrigger value="avisos">
            <Bell className="mr-1 h-4 w-4" /> Avisos
            {sinLeer > 0 && (
              <span className="ml-1 rounded-full bg-red-600 px-1.5 text-xs text-white">{sinLeer}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="chat" onClick={() => cargarChat()}>
            <MessageCircle className="mr-1 h-4 w-4" /> Chat
          </TabsTrigger>
          <TabsTrigger value="rutinas">
            <Repeat className="mr-1 h-4 w-4" /> Rutinas
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tareas" className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="fecha">Día</Label>
              <Input id="fecha" type="date" value={fecha} onChange={(e) => cambiarFecha(e.target.value)} className="w-44" />
            </div>
            {visibles.length > 1 && (
              <div className="space-y-1">
                <Label>Persona</Label>
                <Select value={filtro} onValueChange={setFiltro}>
                  <SelectTrigger className="w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todas">Todo el equipo</SelectItem>
                    {visibles.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <Button variant="outline" onClick={() => setMostrarNueva((v) => !v)}>
              <Plus className="mr-2 h-4 w-4" /> Nueva tarea
            </Button>
          </div>

          {mostrarNueva && (
            <Card>
              <CardContent className="space-y-3 pt-6">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1 sm:col-span-2">
                    <Label>Qué hay que hacer</Label>
                    <Input
                      value={nueva.titulo}
                      placeholder="Ej.: cambiar el filtro de carbón de la ósmosis"
                      onChange={(e) => setNueva({ ...nueva, titulo: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Para cuándo</Label>
                    <Input type="date" value={nueva.fecha} onChange={(e) => setNueva({ ...nueva, fecha: e.target.value })} />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1">
                    <Label>Quién la hace</Label>
                    <Select value={nueva.responsable_id} onValueChange={(v) => setNueva({ ...nueva, responsable_id: v, afecta_a: nueva.afecta_a.filter((x) => x !== v) })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {activos.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.nombre}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <Label>A quién más afecta (le llega el aviso)</Label>
                    <div className="flex flex-wrap gap-1">
                      {activos
                        .filter((p) => p.id !== nueva.responsable_id)
                        .map((p) => {
                          const on = nueva.afecta_a.includes(p.id)
                          return (
                            <Button
                              key={p.id}
                              type="button"
                              size="sm"
                              variant={on ? "default" : "outline"}
                              onClick={() =>
                                setNueva({
                                  ...nueva,
                                  afecta_a: on ? nueva.afecta_a.filter((x) => x !== p.id) : [...nueva.afecta_a, p.id],
                                })
                              }
                            >
                              {p.nombre}
                            </Button>
                          )
                        })}
                    </div>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Detalle (opcional)</Label>
                  <Textarea rows={2} value={nueva.detalle} onChange={(e) => setNueva({ ...nueva, detalle: e.target.value })} />
                </div>
                <Button onClick={crearTarea}>Cargar tarea</Button>
              </CardContent>
            </Card>
          )}

          {porPersona.length === 0 && <p className="text-sm text-muted-foreground">No hay tareas para este día.</p>}

          {porPersona.map(({ persona, tareas: suyas }) => {
            const pr = progreso(suyas)
            return (
              <Card key={persona.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle className="text-base">
                      {persona.id === yo.id ? "Mis tareas" : persona.nombre}
                      <span className="ml-2 text-xs font-normal text-muted-foreground">{ROL_LABEL[persona.rol]}</span>
                    </CardTitle>
                    <span className="text-xs text-muted-foreground">
                      {pr.hechas + pr.problemas}/{pr.total}
                      {pr.problemas > 0 && <span className="ml-1 text-red-600">· {pr.problemas} problema(s)</span>}
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded bg-muted">
                    <div
                      className={`h-1.5 rounded ${pr.problemas > 0 ? "bg-amber-500" : "bg-green-600"}`}
                      style={{ width: `${pr.porcentaje}%` }}
                    />
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {suyas.length === 0 && <p className="text-sm text-muted-foreground">Sin tareas para este día.</p>}
                  {suyas.map((t) => (
                    <TareaItem
                      key={t.id}
                      tarea={t}
                      yo={yo}
                      perfiles={perfiles}
                      supabase={supabase}
                      abierta={abierta === t.id}
                      onToggleAbierta={() => setAbierta((a) => (a === t.id ? null : t.id))}
                      onCambio={(nuevaT) => setTareas((ts) => ts.map((x) => (x.id === nuevaT.id ? nuevaT : x)))}
                    />
                  ))}
                </CardContent>
              </Card>
            )
          })}
        </TabsContent>

        <TabsContent value="avisos" className="space-y-3">
          <div className="flex justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Te llega un aviso cuando alguien que supervisás completa o marca un problema, cuando una tarea te afecta o
              cuando comentan en tus tareas.
            </p>
            {sinLeer > 0 && (
              <Button variant="outline" size="sm" onClick={() => marcarLeido(avisos.filter((a) => !a.leida).map((a) => a.id))}>
                <CheckCheck className="mr-1 h-4 w-4" /> Marcar todo leído
              </Button>
            )}
          </div>
          {avisos.length === 0 && <p className="text-sm text-muted-foreground">No tenés avisos.</p>}
          {avisos.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => abrirAviso(a)}
              className={`block w-full rounded-md border p-3 text-left text-sm ${a.leida ? "opacity-60" : "border-primary/40 bg-primary/5"} ${a.tipo === "tarea_problema" || a.tipo === "riego" ? "border-red-300" : ""}`}
            >
              <div className="flex justify-between gap-3">
                <span className="font-medium">{a.titulo}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{horaCorta(a.created_at)}</span>
              </div>
              {a.cuerpo && <div className="mt-1 whitespace-pre-line text-muted-foreground">{a.cuerpo}</div>}
            </button>
          ))}
        </TabsContent>

        <TabsContent value="chat">
          <Card>
            <CardContent className="space-y-3 pt-6">
              <div className="max-h-[60vh] space-y-2 overflow-y-auto">
                {chat.length === 0 && <p className="text-sm text-muted-foreground">Todavía no hay mensajes.</p>}
                {chat.map((m) => {
                  const mio = m.autor_id === yo.id
                  return (
                    <div key={m.id} className={`flex ${mio ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${mio ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                        {!mio && <div className="text-xs font-medium">{nombre(m.autor_id)}</div>}
                        <div className="whitespace-pre-line">{m.cuerpo}</div>
                        <div className="mt-1 text-right text-[11px] opacity-70">{horaCorta(m.created_at)}</div>
                      </div>
                    </div>
                  )
                })}
                <div ref={finChat} />
              </div>
              <div className="flex gap-2">
                <Textarea
                  rows={1}
                  placeholder="Escribir al equipo"
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault()
                      enviar()
                    }
                  }}
                />
                <Button size="icon" onClick={enviar} aria-label="Enviar">
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rutinas">
          <Rutinas yo={yo} perfiles={perfiles} plantillas={plantillas} setPlantillas={setPlantillas} supabase={supabase} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
