"use client"

import { useState } from "react"
import type { SupabaseClient } from "@supabase/supabase-js"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { AlertTriangle, ChevronDown, ChevronUp, MessageSquare, Send } from "lucide-react"
import { horaCorta, type Mensaje, type Perfil, type Tarea } from "@/lib/equipo"
import { useToast } from "@/hooks/use-toast"

interface Props {
  tarea: Tarea
  yo: Perfil
  perfiles: Perfil[]
  supabase: SupabaseClient
  abierta: boolean
  onToggleAbierta: () => void
  onCambio: (t: Tarea) => void
}

export function TareaItem({ tarea, yo, perfiles, supabase, abierta, onToggleAbierta, onCambio }: Props) {
  const { toast } = useToast()
  const [modoProblema, setModoProblema] = useState(false)
  const [nota, setNota] = useState(tarea.nota ?? "")
  const [guardando, setGuardando] = useState(false)
  const [comentarios, setComentarios] = useState<Mensaje[] | null>(null)
  const [nuevo, setNuevo] = useState("")

  const nombre = (id: string | null) => perfiles.find((p) => p.id === id)?.nombre ?? "—"
  const responsable = perfiles.find((p) => p.id === tarea.responsable_id)
  const puedeEditar = tarea.responsable_id === yo.id || yo.ve_todas_las_tareas || responsable?.supervisor_id === yo.id

  async function cambiarEstado(estado: Tarea["estado"], notaNueva: string | null) {
    setGuardando(true)
    const cambios =
      estado === "pendiente"
        ? { estado, nota: notaNueva, completada_at: null, completada_por: null }
        : { estado, nota: notaNueva, completada_at: new Date().toISOString(), completada_por: yo.id }
    const { data, error } = await supabase.from("tareas").update(cambios).eq("id", tarea.id).select().single()
    setGuardando(false)
    if (error || !data) {
      toast({ title: "No se pudo guardar", description: error?.message, variant: "destructive" })
      return
    }
    setModoProblema(false)
    onCambio(data as Tarea)
  }

  async function cargarComentarios() {
    const { data } = await supabase.from("mensajes").select("*").eq("tarea_id", tarea.id).order("created_at")
    setComentarios((data || []) as Mensaje[])
  }

  async function toggle() {
    if (!abierta && comentarios === null) await cargarComentarios()
    onToggleAbierta()
  }

  async function comentar() {
    const cuerpo = nuevo.trim()
    if (!cuerpo) return
    const { data, error } = await supabase
      .from("mensajes")
      .insert({ tarea_id: tarea.id, cuerpo, autor_id: yo.id })
      .select()
      .single()
    if (error || !data) {
      toast({ title: "No se pudo enviar", description: error?.message, variant: "destructive" })
      return
    }
    setNuevo("")
    setComentarios((cs) => [...(cs ?? []), data as Mensaje])
  }

  const colorEstado =
    tarea.estado === "problema"
      ? "border-red-300 bg-red-50 dark:bg-red-950/30"
      : tarea.estado === "hecha"
        ? "opacity-70"
        : ""

  return (
    <div className={`rounded-md border p-3 ${colorEstado}`}>
      <div className="flex items-start gap-3">
        <Checkbox
          className="mt-1"
          checked={tarea.estado === "hecha"}
          disabled={!puedeEditar || guardando}
          onCheckedChange={(v) => cambiarEstado(v ? "hecha" : "pendiente", v ? tarea.nota : null)}
          aria-label="Marcar como hecha"
        />
        <div className="min-w-0 flex-1">
          <button type="button" onClick={toggle} className="w-full text-left">
            <div className={`font-medium ${tarea.estado === "hecha" ? "line-through" : ""}`}>{tarea.titulo}</div>
            <div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
              {tarea.creada_por && <span>Cargada por {nombre(tarea.creada_por)}</span>}
              {tarea.afecta_a.length > 0 && (
                <Badge variant="outline">Afecta a {tarea.afecta_a.map(nombre).join(", ")}</Badge>
              )}
              {tarea.estado !== "pendiente" && tarea.completada_por && (
                <span>
                  {tarea.estado === "hecha" ? "Hecha" : "Problema"} · {nombre(tarea.completada_por)}
                  {tarea.completada_at ? ` · ${horaCorta(tarea.completada_at)}` : ""}
                </span>
              )}
            </div>
            {tarea.estado === "problema" && tarea.nota && (
              <div className="mt-1 text-sm text-red-700 dark:text-red-400">{tarea.nota}</div>
            )}
          </button>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {puedeEditar && tarea.estado !== "problema" && (
            <Button variant="ghost" size="sm" onClick={() => setModoProblema((v) => !v)} title="Marcar un problema">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={toggle} aria-label="Ver detalle y comentarios">
            <MessageSquare className="h-4 w-4" />
            {abierta ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </Button>
        </div>
      </div>

      {modoProblema && (
        <div className="mt-3 space-y-2">
          <Textarea
            rows={2}
            placeholder="¿Qué pasó? Ej.: arañita en Sala 5, cama 2"
            value={nota}
            onChange={(e) => setNota(e.target.value)}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="destructive"
              disabled={guardando || !nota.trim()}
              onClick={() => cambiarEstado("problema", nota.trim())}
            >
              Avisar problema
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setModoProblema(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {abierta && (
        <div className="mt-3 space-y-3 border-t pt-3 text-sm">
          {tarea.detalle && <p className="whitespace-pre-line text-muted-foreground">{tarea.detalle}</p>}
          {tarea.estado === "problema" && puedeEditar && (
            <Button size="sm" variant="outline" onClick={() => cambiarEstado("hecha", tarea.nota)}>
              Marcar como resuelto
            </Button>
          )}
          <div className="space-y-2">
            {(comentarios ?? []).map((c) => (
              <div key={c.id} className="rounded bg-muted px-2 py-1">
                <span className="font-medium">{nombre(c.autor_id)}</span>{" "}
                <span className="text-xs text-muted-foreground">{horaCorta(c.created_at)}</span>
                <div className="whitespace-pre-line">{c.cuerpo}</div>
              </div>
            ))}
            {comentarios?.length === 0 && <p className="text-xs text-muted-foreground">Sin comentarios.</p>}
          </div>
          <div className="flex gap-2">
            <Textarea
              rows={1}
              placeholder="Escribir un comentario"
              value={nuevo}
              onChange={(e) => setNuevo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  comentar()
                }
              }}
            />
            <Button size="icon" onClick={comentar} aria-label="Enviar comentario">
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
