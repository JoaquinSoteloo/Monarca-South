"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import type { SupabaseClient } from "@supabase/supabase-js"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { AlertTriangle, Loader2 } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { getArgentinaDateString } from "@/lib/timezone"
import { evaluarRiego, parseDecimal } from "@/lib/riego"
import { destinatariosAlertaRiego, type Perfil } from "@/lib/equipo"
import type { CicloSala } from "@/lib/ciclo"
import {
  metaSala,
  serializar,
  validar,
  valoresIniciales,
  type Campo,
  type ProcesoPaso,
  type Testigo,
  type Valores,
} from "@/lib/procesos"

interface Contexto {
  paso: ProcesoPaso
  plantilla: string
  salaNombre: string | null
  ultimos: Record<string, unknown> | null
  mezcla: Record<string, unknown> | null
  meta: ReturnType<typeof metaSala> | null
}

interface Props {
  pasoId: number | null
  onClose: () => void
  onListo: () => void
  yo: Perfil
  perfiles: Perfil[]
  supabase: SupabaseClient
}

/** Formulario de un paso de un procedimiento (se abre desde Equipo o desde Procedimientos). */
export function PasoDialog({ pasoId, onClose, onListo, yo, perfiles, supabase }: Props) {
  const { toast } = useToast()
  const [ctx, setCtx] = useState<Contexto | null>(null)
  const [valores, setValores] = useState<Valores>({})
  const [errores, setErrores] = useState<string[]>([])
  const [modoProblema, setModoProblema] = useState(false)
  const [nota, setNota] = useState("")
  const [guardando, setGuardando] = useState(false)
  const cerrar = useRef(onClose)
  cerrar.current = onClose

  useEffect(() => {
    if (pasoId === null) return
    let vivo = true
    setCtx(null)
    setErrores([])
    setModoProblema(false)
    setNota("")
    ;(async () => {
      const { data: paso, error } = await supabase.from("procesos_pasos").select("*").eq("id", pasoId).single()
      if (error || !paso) {
        toast({ title: "No se pudo abrir el paso", description: error?.message, variant: "destructive" })
        cerrar.current()
        return
      }
      const p = paso as ProcesoPaso
      const hoy = getArgentinaDateString()
      const [proc, ult, mez, sala, ciclos] = await Promise.all([
        supabase.from("procesos").select("plantilla_clave").eq("id", p.proceso_id).single(),
        supabase
          .from("procesos_pasos")
          .select("valores")
          .eq("clave", p.clave)
          .eq("estado", "hecho")
          .order("hecho_at", { ascending: false })
          .limit(1),
        supabase.from("procesos_pasos").select("valores").eq("proceso_id", p.proceso_id).eq("clave", "mezcla").eq("estado", "hecho").limit(1),
        p.sala_id ? supabase.from("salas_cultivo").select("nombre").eq("id", p.sala_id).single() : Promise.resolve({ data: null }),
        p.sala_id ? supabase.from("ciclos_sala").select("*").eq("sala_id", p.sala_id) : Promise.resolve({ data: [] }),
      ])
      if (!vivo) return
      const meta = p.sala_id ? metaSala((ciclos.data || []) as CicloSala[], p.sala_id, hoy) : null
      const ultimos = (ult.data?.[0]?.valores as Record<string, unknown>) ?? null
      setCtx({
        paso: p,
        plantilla: (proc.data?.plantilla_clave as string) ?? "",
        salaNombre: (sala.data as unknown as { nombre: string } | null)?.nombre ?? null,
        ultimos,
        mezcla: (mez.data?.[0]?.valores as Record<string, unknown>) ?? null,
        meta,
      })
      setValores(valoresIniciales(p.campos, p.valores || {}, ultimos, meta?.testigos ?? []))
    })()
    return () => {
      vivo = false
    }
  }, [pasoId, supabase, toast])

  // Riego: alertas del Manual 3 en vivo, con la mezcla del paso anterior y el promedio de los testigos.
  const alertas = useMemo(() => {
    if (!ctx || ctx.plantilla !== "riego" || ctx.paso.clave !== "riego") return []
    const t = (valores.testigos as Testigo[] | undefined) ?? []
    const prom = (k: keyof Testigo) => {
      const ns = t.map((x) => parseDecimal(x[k])).filter((n): n is number => n !== null)
      return ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : null
    }
    const num = (v: unknown) => (typeof v === "number" ? v : null)
    return evaluarRiego({
      etapa: (ctx.meta?.etapa ?? "vegetativo") as Parameters<typeof evaluarRiego>[0]["etapa"],
      semana: ctx.meta?.semana ?? null,
      ec_entrada: num(ctx.mezcla?.ec),
      ph_entrada: num(ctx.mezcla?.ph),
      ec_runoff: prom("ec"),
      ph_runoff: prom("ph"),
      drenaje_pct: prom("drenaje"),
    })
  }, [ctx, valores])

  async function enviar(estado: "hecho" | "problema") {
    if (!ctx) return
    if (estado === "hecho") {
      const errs = validar(ctx.paso.campos, valores)
      setErrores(errs)
      if (errs.length) return
    }
    setGuardando(true)
    const datos = serializar(ctx.paso.campos, valores)
    if (ctx.meta) datos.meta = { etapa: ctx.meta.etapa, semana: ctx.meta.semana, ciclo_id: ctx.meta.ciclo_id }
    const { error } = await supabase.rpc("completar_paso", {
      p_paso: ctx.paso.id,
      p_valores: datos,
      p_estado: estado,
      p_nota: estado === "problema" ? nota.trim() : null,
    })
    if (error) {
      setGuardando(false)
      toast({ title: "No se pudo guardar", description: error.message, variant: "destructive" })
      return
    }
    const graves = alertas.filter((a) => a.nivel === "atencion")
    if (estado === "hecho" && graves.length > 0) {
      const destinos = destinatariosAlertaRiego(yo, perfiles)
      if (destinos.length > 0) {
        await supabase.from("notificaciones").insert(
          destinos.map((d) => ({
            destinatario_id: d,
            autor_id: yo.id,
            tipo: "riego",
            titulo: `Riego ${ctx.salaNombre ?? ""}: ${graves.length} alerta(s) (${yo.nombre})`,
            cuerpo: graves.map((a) => a.mensaje).join("\n"),
            enlace: "/riego",
          })),
        )
      }
    }
    setGuardando(false)
    toast({ title: estado === "hecho" ? "Listo. Le avisamos al que sigue." : "Problema avisado." })
    onListo()
  }

  const set = (clave: string, v: Valores[string]) => setValores((x) => ({ ...x, [clave]: v }))

  function campo(c: Campo) {
    const v = valores[c.clave]
    const id = `campo-${c.clave}`
    const etiqueta = (
      <Label htmlFor={id}>
        {c.etiqueta}
        {c.unidad ? ` (${c.unidad})` : ""}
        {c.requerido ? " *" : ""}
      </Label>
    )
    const ayuda = c.ayuda ? <p className="text-xs text-muted-foreground">{c.ayuda}</p> : null
    switch (c.tipo) {
      case "numero":
        return (
          <div key={c.clave} className="space-y-1">
            {etiqueta}
            <Input id={id} inputMode="decimal" value={String(v ?? "")} onChange={(e) => set(c.clave, e.target.value)} />
            {ayuda}
          </div>
        )
      case "texto":
        return (
          <div key={c.clave} className="space-y-1">
            {etiqueta}
            <Input id={id} value={String(v ?? "")} onChange={(e) => set(c.clave, e.target.value)} />
            {ayuda}
          </div>
        )
      case "texto_largo":
        return (
          <div key={c.clave} className="space-y-1">
            {etiqueta}
            <Textarea id={id} rows={2} value={String(v ?? "")} onChange={(e) => set(c.clave, e.target.value)} />
            {ayuda}
          </div>
        )
      case "si_no":
        return (
          <div key={c.clave} className="flex items-center justify-between gap-3 rounded-md border p-2">
            {etiqueta}
            <Switch id={id} checked={v === true} onCheckedChange={(x) => set(c.clave, x)} />
          </div>
        )
      case "opciones":
        return (
          <div key={c.clave} className="space-y-1">
            {etiqueta}
            <Select value={String(v ?? "")} onValueChange={(x) => set(c.clave, x)}>
              <SelectTrigger id={id}>
                <SelectValue placeholder="Elegir" />
              </SelectTrigger>
              <SelectContent>
                {(c.opciones ?? []).map((o) => (
                  <SelectItem key={o} value={o}>
                    {o}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {ayuda}
          </div>
        )
      case "testigos": {
        const lista = (v as Testigo[]) ?? []
        const upd = (i: number, k: keyof Testigo, x: string) =>
          set(
            c.clave,
            lista.map((t, j) => (j === i ? { ...t, [k]: x } : t)),
          )
        return (
          <div key={c.clave} className="space-y-2">
            {etiqueta}
            {ayuda}
            {lista.map((t, i) => (
              <div key={i} className="grid grid-cols-[1fr_4.5rem_4rem_4.5rem] items-end gap-2">
                <div>
                  <span className="text-xs text-muted-foreground">Testigo {i + 1}</span>
                  <Input placeholder="Cama · maceta" value={t.maceta} onChange={(e) => upd(i, "maceta", e.target.value)} />
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">EC</span>
                  <Input inputMode="decimal" value={t.ec} onChange={(e) => upd(i, "ec", e.target.value)} />
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">pH</span>
                  <Input inputMode="decimal" value={t.ph} onChange={(e) => upd(i, "ph", e.target.value)} />
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Drenaje %</span>
                  <Input inputMode="numeric" value={t.drenaje} onChange={(e) => upd(i, "drenaje", e.target.value)} />
                </div>
              </div>
            ))}
          </div>
        )
      }
    }
  }

  return (
    <Dialog open={pasoId !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{ctx?.paso.titulo ?? "Cargando…"}</DialogTitle>
          {ctx?.paso.detalle && <DialogDescription>{ctx.paso.detalle}</DialogDescription>}
        </DialogHeader>
        {!ctx ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <div className="space-y-4">
            {ctx.plantilla === "riego" && ctx.paso.clave === "riego" && (
              <div className="rounded-md bg-muted p-2 text-xs">
                Mezcla: EC {String(ctx.mezcla?.ec ?? "—").replace(".", ",")} · pH {String(ctx.mezcla?.ph ?? "—").replace(".", ",")}
                {ctx.meta && ` · ${ctx.meta.etapa}${ctx.meta.semana ? ` semana ${ctx.meta.semana}` : ""}`}
              </div>
            )}
            {ctx.paso.campos.map(campo)}
            {alertas.length > 0 && (
              <ul className="space-y-1 rounded-md border border-amber-300 bg-amber-50 p-2 text-sm dark:bg-amber-950/30">
                {alertas.map((a, i) => (
                  <li key={i}>
                    {a.nivel === "atencion" ? "⚠ " : "ℹ "}
                    {a.mensaje}
                  </li>
                ))}
              </ul>
            )}
            {errores.length > 0 && (
              <ul className="space-y-1 rounded-md border border-red-300 bg-red-50 p-2 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-400">
                {errores.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            )}
            {modoProblema ? (
              <div className="space-y-2">
                <Textarea rows={2} placeholder="¿Qué pasó?" value={nota} onChange={(e) => setNota(e.target.value)} />
                <div className="flex gap-2">
                  <Button variant="destructive" disabled={guardando || !nota.trim()} onClick={() => enviar("problema")}>
                    Avisar problema
                  </Button>
                  <Button variant="ghost" onClick={() => setModoProblema(false)}>
                    Cancelar
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button disabled={guardando} onClick={() => enviar("hecho")}>
                  {guardando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Listo, avisar al que sigue
                </Button>
                <Button variant="outline" onClick={() => setModoProblema(true)}>
                  <AlertTriangle className="mr-2 h-4 w-4 text-amber-600" />
                  Hay un problema
                </Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
