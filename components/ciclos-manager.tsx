"use client"

import { useMemo, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CalendarRange, History, Lock, Plus, SlidersHorizontal } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { Calendario } from "@/components/ciclos/calendario"
import { Bitacora } from "@/components/ciclos/bitacora"
import { Planificador, borradorNuevo, type BorradorCiclo } from "@/components/ciclos/planificador"
import {
  FASE_LABEL,
  cicloActual,
  fechaCorta,
  fechasCiclo,
  filasTareasCiclo,
  momentoCiclo,
  objetivos,
  protocoloMonarca,
  type CicloSala,
} from "@/lib/ciclo"
import type { Perfil } from "@/lib/equipo"
import type { SalaCultivo } from "@/lib/types"

interface Props {
  hoy: string
  salas: SalaCultivo[]
  initialCiclos: CicloSala[]
  perfiles: Perfil[]
  yo: Perfil | null
}

const FASE_COLOR: Record<string, string> = {
  vegetativo: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100",
  floracion: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-100",
  lavado: "bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-100",
  secado: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100",
  limpieza: "bg-zinc-200 text-zinc-800",
  planificado: "bg-zinc-100 text-zinc-700",
  libre: "bg-zinc-100 text-zinc-700",
}

const OBJ_LABEL: [keyof ReturnType<typeof objetivos>, string][] = [
  ["fotoperiodo", "Luz"],
  ["ecEntrada", "EC entrada"],
  ["phEntrada", "pH entrada"],
  ["drenaje", "Drenaje"],
  ["temperatura", "Temperatura"],
  ["humedad", "Humedad"],
  ["vpd", "VPD"],
  ["ppfd", "PPFD"],
]

export function CiclosManager({ hoy, salas, initialCiclos, perfiles, yo }: Props) {
  const supabase = useMemo(() => createClient(), [])
  const { toast } = useToast()
  const [ciclos, setCiclos] = useState(initialCiclos)
  const [editando, setEditando] = useState<{ salaId: number; ciclo: CicloSala | null } | null>(null)
  const [bitacora, setBitacora] = useState<number | null>(null)
  const [guardando, setGuardando] = useState(false)

  const nombreSala = (id: number) => salas.find((s) => s.id === id)?.nombre ?? `Sala ${id}`
  const abiertos = ciclos.filter((c) => c.estado === "abierto")

  /** Rearma las tareas pendientes del ciclo desde hoy con las fechas actuales. */
  async function sincronizarTareas(c: CicloSala) {
    if (perfiles.length === 0) return
    const { error: e1 } = await supabase
      .from("tareas")
      .delete()
      .eq("ciclo_id", c.id)
      .eq("estado", "pendiente")
      .gte("fecha", hoy)
    if (e1) throw e1
    const filas = filasTareasCiclo(c, nombreSala(c.sala_id), perfiles, hoy)
    if (filas.length > 0) {
      const { error: e2 } = await supabase.from("tareas").upsert(filas, { onConflict: "ciclo_id,clave", ignoreDuplicates: true })
      if (e2) throw e2
    }
  }

  async function guardar(salaId: number, existente: CicloSala | null, b: BorradorCiclo) {
    setGuardando(true)
    try {
      const datos = { ...b, sala_id: salaId, updated_at: new Date().toISOString() }
      const q = existente
        ? supabase.from("ciclos_sala").update(datos).eq("id", existente.id)
        : supabase.from("ciclos_sala").insert({ ...datos, creado_por: yo?.id ?? null })
      const { data, error } = await q.select().single()
      if (error || !data) throw error ?? new Error("Sin respuesta")
      const c = data as CicloSala
      await sincronizarTareas(c)
      setCiclos((cs) => (existente ? cs.map((x) => (x.id === c.id ? c : x)) : [...cs, c]))
      setEditando(null)
      toast({
        title: existente ? "Ciclo replanificado" : "Ciclo iniciado",
        description: `Corte el ${fechaCorta(fechasCiclo(c).cosecha)}. Tareas del protocolo actualizadas.`,
      })
    } catch (e) {
      toast({ title: "No se pudo guardar", description: (e as Error).message, variant: "destructive" })
    } finally {
      setGuardando(false)
    }
  }

  async function cerrar(c: CicloSala) {
    if (!window.confirm(`¿Cerrar el ciclo de ${nombreSala(c.sala_id)}? Se borran sus tareas pendientes.`)) return
    await supabase.from("tareas").delete().eq("ciclo_id", c.id).eq("estado", "pendiente")
    const { error } = await supabase.from("ciclos_sala").update({ estado: "cerrado" }).eq("id", c.id)
    if (error) {
      toast({ title: "No se pudo cerrar", description: error.message, variant: "destructive" })
      return
    }
    setCiclos((cs) => cs.map((x) => (x.id === c.id ? { ...x, estado: "cerrado" } : x)))
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <CalendarRange className="h-6 w-6" /> Ciclos
        </h1>
        <p className="text-sm text-muted-foreground">
          El superciclo de cada sala: en qué fase está hoy, qué valores buscar, qué viene y quién lo hace. Mover una fecha
          recalcula el resto y las tareas del equipo.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Calendario de salas</CardTitle>
        </CardHeader>
        <CardContent>
          {abiertos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todavía no hay ciclos. Iniciá uno en cada sala de flora.</p>
          ) : (
            <Calendario hoy={hoy} salas={salas} ciclos={ciclos} />
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {salas.map((sala) => {
          const c = cicloActual(ciclos, sala.id, hoy)
          const siguiente = abiertos.find((x) => x.sala_id === sala.id && c && x.id !== c.id && x.fecha_inicio >= c.fecha_inicio)
          const edit = editando?.salaId === sala.id

          if (!c) {
            return (
              <Card key={sala.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{sala.nombre}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {edit ? (
                    <Planificador
                      salaId={sala.id}
                      salaNombre={sala.nombre}
                      inicial={borradorNuevo(hoy, null, sala.nombre)}
                      otros={abiertos}
                      guardando={guardando}
                      esNuevo
                      onGuardar={(b) => guardar(sala.id, null, b)}
                      onCancelar={() => setEditando(null)}
                    />
                  ) : (
                    <>
                      <p className="text-sm text-muted-foreground">Sin ciclo de flora (la sala de vege no lleva ciclo).</p>
                      <Button variant="outline" size="sm" onClick={() => setEditando({ salaId: sala.id, ciclo: null })}>
                        <Plus className="mr-1 h-4 w-4" /> Iniciar ciclo
                      </Button>
                    </>
                  )}
                </CardContent>
              </Card>
            )
          }

          const f = fechasCiclo(c)
          const m = momentoCiclo(c, hoy)
          const obj = objetivos(m, c)
          const proximos = protocoloMonarca(c, sala.nombre)
            .filter((t) => t.fecha >= hoy && !t.clave.startsWith("secado_"))
            .slice(0, 5)

          return (
            <Card key={sala.id}>
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">{sala.nombre}</CardTitle>
                    <div className="text-xs text-muted-foreground">
                      {c.geneticas || "Genéticas sin cargar"}
                      {c.plantas ? ` · ${c.plantas} plantas` : ""}
                      {c.m2 ? ` · ${Number(c.m2)} m²` : ""}
                    </div>
                  </div>
                  <span className={`rounded-md px-2 py-1 text-xs font-medium ${FASE_COLOR[m.fase]}`}>{FASE_LABEL[m.fase]}</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  {m.fase === "planificado" ? (
                    <span className="text-lg font-semibold">Entra el {fechaCorta(f.inicio)}</span>
                  ) : m.fase === "vegetativo" || m.fase === "floracion" || m.fase === "lavado" ? (
                    <span className="text-lg font-semibold">
                      Día {m.diaFase} · Semana {m.semana}
                    </span>
                  ) : (
                    <span className="text-lg font-semibold">Día {m.diaFase}</span>
                  )}
                  {m.faltanCosecha > 0 && (
                    <span className="text-sm text-muted-foreground">
                      Corte en {m.faltanCosecha} días ({fechaCorta(f.cosecha)})
                    </span>
                  )}
                  {m.faltanCosecha <= 0 && <span className="text-sm text-muted-foreground">Sala libre el {fechaCorta(f.libre)}</span>}
                </div>

                <div>
                  <div className="h-2 w-full overflow-hidden rounded bg-muted">
                    <div className="h-2 bg-primary" style={{ width: `${m.avance}%` }} />
                  </div>
                  <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
                    <span>Entrada {fechaCorta(f.inicio)}</span>
                    <span>12/12 {fechaCorta(f.flip)}</span>
                    <span>Corte {fechaCorta(f.cosecha)}</span>
                    <span>Libre {fechaCorta(f.libre)}</span>
                  </div>
                </div>

                {OBJ_LABEL.some(([k]) => obj[k]) && (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {OBJ_LABEL.filter(([k]) => obj[k]).map(([k, l]) => (
                      <div key={k} className="rounded-md bg-muted px-2 py-1.5">
                        <div className="text-[11px] text-muted-foreground">{l}</div>
                        <div className="text-sm font-medium">{obj[k]}</div>
                      </div>
                    ))}
                  </div>
                )}

                {proximos.length > 0 && (
                  <div>
                    <div className="mb-1 text-xs font-medium text-muted-foreground">Lo que viene</div>
                    <ul className="space-y-1 text-sm">
                      {proximos.map((t) => (
                        <li key={t.clave} className="flex gap-2">
                          <span className="w-12 shrink-0 text-muted-foreground">{t.fecha === hoy ? "Hoy" : fechaCorta(t.fecha)}</span>
                          <span>{t.titulo.replace(`${sala.nombre} · `, "")}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {siguiente && (
                  <Badge variant="outline">Próxima tanda: entra el {fechaCorta(siguiente.fecha_inicio)}</Badge>
                )}

                {edit && (
                  <Planificador
                    key={editando?.ciclo?.id ?? "nuevo"}
                    salaId={sala.id}
                    salaNombre={sala.nombre}
                    inicial={editando?.ciclo ?? borradorNuevo(f.libre, c.m2 ? Number(c.m2) : null, sala.nombre)}
                    otros={abiertos.filter((x) => x.id !== editando?.ciclo?.id)}
                    guardando={guardando}
                    esNuevo={!editando?.ciclo}
                    onGuardar={(b) => guardar(sala.id, editando?.ciclo ?? null, b)}
                    onCancelar={() => setEditando(null)}
                  />
                )}

                {!edit && (
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => setEditando({ salaId: sala.id, ciclo: c })}>
                      <SlidersHorizontal className="mr-1 h-4 w-4" /> Planificar
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setBitacora(bitacora === c.id ? null : c.id)}>
                      <History className="mr-1 h-4 w-4" /> Bitácora
                    </Button>
                    {!siguiente && (
                      <Button size="sm" variant="outline" onClick={() => setEditando({ salaId: sala.id, ciclo: null })}>
                        <Plus className="mr-1 h-4 w-4" /> Planificar próxima tanda
                      </Button>
                    )}
                    {(m.fase === "limpieza" || m.fase === "libre" || m.fase === "secado") && (
                      <Button size="sm" variant="ghost" onClick={() => cerrar(c)}>
                        <Lock className="mr-1 h-4 w-4" /> Cerrar ciclo
                      </Button>
                    )}
                  </div>
                )}

                {bitacora === c.id && <Bitacora ciclo={c} perfiles={perfiles} supabase={supabase} hoy={hoy} />}
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
