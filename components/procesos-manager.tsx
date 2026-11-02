"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ClipboardList, Loader2, Play, X } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { PasoDialog } from "@/components/procesos/paso-dialog"
import { horaCorta, type Perfil } from "@/lib/equipo"
import { ESTADO_PASO_LABEL, avance, resumen, type Proceso, type ProcesoPaso, type ProcesoPlantilla } from "@/lib/procesos"
import type { SalaCultivo } from "@/lib/types"

interface Props {
  yo: Perfil
  perfiles: Perfil[]
  salas: SalaCultivo[]
  plantillas: ProcesoPlantilla[]
  procesos: Proceso[]
  pasos: ProcesoPaso[]
}

const COLOR: Record<ProcesoPaso["estado"], string> = {
  espera: "text-muted-foreground",
  pendiente: "border-amber-300 bg-amber-50 dark:bg-amber-950/30",
  hecho: "",
  problema: "border-red-300 bg-red-50 dark:bg-red-950/30",
}

export function ProcesosManager({ yo, perfiles, salas, plantillas, procesos, pasos }: Props) {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()
  const { toast } = useToast()
  const [clave, setClave] = useState(plantillas[0]?.clave ?? "")
  const [elegidas, setElegidas] = useState<number[]>([])
  const [nota, setNota] = useState("")
  const [iniciando, setIniciando] = useState(false)
  const [pasoAbierto, setPasoAbierto] = useState<number | null>(null)
  const [verHistorial, setVerHistorial] = useState(false)

  const plantilla = plantillas.find((p) => p.clave === clave)
  const nombre = (id: string | null) => perfiles.find((p) => p.id === id)?.nombre ?? "—"
  const puedo = (p: ProcesoPaso) =>
    p.responsable_id === yo.id || yo.ve_todas_las_tareas || perfiles.find((x) => x.id === p.responsable_id)?.supervisor_id === yo.id

  async function iniciar() {
    if (!plantilla) return
    setIniciando(true)
    const { error } = await supabase.rpc("iniciar_proceso", { p_clave: plantilla.clave, p_salas: elegidas, p_nota: nota || null })
    setIniciando(false)
    if (error) {
      toast({ title: "No se pudo iniciar", description: error.message, variant: "destructive" })
      return
    }
    toast({ title: `${plantilla.nombre} iniciado. Le avisamos a quien arranca.` })
    setElegidas([])
    setNota("")
    router.refresh()
  }

  async function cancelar(p: Proceso) {
    if (!confirm(`¿Cancelar «${p.titulo}»? Se borran las tareas pendientes.`)) return
    const { error } = await supabase.rpc("cancelar_proceso", { p_proceso: p.id })
    if (error) toast({ title: "No se pudo cancelar", description: error.message, variant: "destructive" })
    router.refresh()
  }

  const enCurso = procesos.filter((p) => p.estado === "en_curso")
  const historial = procesos.filter((p) => p.estado !== "en_curso")

  function tarjeta(p: Proceso) {
    const ps = pasos.filter((x) => x.proceso_id === p.id).sort((a, b) => a.orden - b.orden || a.id - b.id)
    const av = avance(ps)
    return (
      <Card key={p.id}>
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle className="text-base">{p.titulo}</CardTitle>
              <p className="text-xs text-muted-foreground">
                Inició {nombre(p.iniciado_por)} · {horaCorta(p.created_at)} · {av.hechos}/{av.total} pasos
                {p.estado === "terminado" && p.terminado_at ? ` · terminado ${horaCorta(p.terminado_at)}` : ""}
                {p.estado === "cancelado" ? " · cancelado" : ""}
              </p>
              {p.nota && <p className="mt-1 text-sm">{p.nota}</p>}
            </div>
            {p.estado === "en_curso" && (p.iniciado_por === yo.id || yo.ve_todas_las_tareas) && (
              <Button variant="ghost" size="sm" onClick={() => cancelar(p)} title="Cancelar">
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {ps.map((x) => (
            <div key={x.id} className={`rounded-md border p-2 text-sm ${COLOR[x.estado]}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-medium">{x.titulo}</div>
                <div className="flex items-center gap-2">
                  <Badge variant={x.estado === "hecho" ? "secondary" : "outline"}>
                    {ESTADO_PASO_LABEL[x.estado]} · {nombre(x.estado === "hecho" ? x.hecho_por : x.responsable_id)}
                  </Badge>
                  {(x.estado === "pendiente" || x.estado === "problema") && puedo(x) && (
                    <Button size="sm" onClick={() => setPasoAbierto(x.id)}>
                      Completar
                    </Button>
                  )}
                </div>
              </div>
              {x.estado === "problema" && x.nota && <div className="mt-1 text-red-700 dark:text-red-400">{x.nota}</div>}
              {x.estado === "hecho" && (
                <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                  {resumen(x.campos, x.valores).map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <ClipboardList className="h-6 w-6" /> Procedimientos
        </h1>
        <p className="text-sm text-muted-foreground">
          Cada paso le llega como tarea a quien le toca. Al completarlo se carga el formulario y se le avisa al que sigue.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Iniciar un procedimiento</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Select value={clave} onValueChange={(v) => { setClave(v); setElegidas([]) }}>
            <SelectTrigger>
              <SelectValue placeholder="Elegir" />
            </SelectTrigger>
            <SelectContent>
              {plantillas.map((p) => (
                <SelectItem key={p.clave} value={p.clave}>
                  {p.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {plantilla?.descripcion && <p className="text-sm text-muted-foreground">{plantilla.descripcion}</p>}
          {plantilla?.usa_salas && (
            <div className="flex flex-wrap gap-3">
              {salas.map((s) => (
                <label key={s.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={elegidas.includes(s.id)}
                    onCheckedChange={(v) => setElegidas((xs) => (v ? [...xs, s.id] : xs.filter((x) => x !== s.id)))}
                  />
                  {s.nombre}
                </label>
              ))}
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="nota-proceso">Nota (opcional)</Label>
            <Textarea id="nota-proceso" rows={1} value={nota} onChange={(e) => setNota(e.target.value)} />
          </div>
          <Button disabled={iniciando || !plantilla || (plantilla.usa_salas && elegidas.length === 0)} onClick={iniciar}>
            {iniciando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
            Iniciar
          </Button>
        </CardContent>
      </Card>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">En curso ({enCurso.length})</h2>
        {enCurso.length === 0 && <p className="text-sm text-muted-foreground">No hay procedimientos en curso.</p>}
        {enCurso.map(tarjeta)}
      </section>

      {historial.length > 0 && (
        <section className="space-y-3">
          <Button variant="outline" size="sm" onClick={() => setVerHistorial((v) => !v)}>
            {verHistorial ? "Ocultar" : "Ver"} los últimos terminados ({historial.length})
          </Button>
          {verHistorial && historial.map(tarjeta)}
        </section>
      )}

      <PasoDialog
        pasoId={pasoAbierto}
        onClose={() => setPasoAbierto(null)}
        onListo={() => {
          setPasoAbierto(null)
          router.refresh()
        }}
        yo={yo}
        perfiles={perfiles}
        supabase={supabase}
      />
    </div>
  )
}
