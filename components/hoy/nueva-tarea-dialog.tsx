"use client"

import { useState } from "react"
import type { SupabaseClient } from "@supabase/supabase-js"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { DatePicker } from "@/components/ui/date-picker"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type { Perfil, Tarea } from "@/lib/equipo"

interface Props {
  abierto: boolean
  onCerrar: () => void
  yo: Perfil
  perfiles: Perfil[]
  hoy: string
  supabase: SupabaseClient
  onCreada: (t: Tarea) => void
}

/** Tarea extra para alguien (la misma carga que tenía la pantalla Equipo). */
export function NuevaTareaDialog({ abierto, onCerrar, yo, perfiles, hoy, supabase, onCreada }: Props) {
  const vacia = () => ({ titulo: "", detalle: "", responsable_id: yo.id, afecta_a: [] as string[], fecha: hoy })
  const [form, setForm] = useState(vacia)
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const activos = perfiles.filter((p) => p.activo)

  function cerrar() {
    setError(null)
    onCerrar()
  }

  async function cargar() {
    if (!form.titulo.trim()) {
      setError("Falta qué hay que hacer.")
      return
    }
    setGuardando(true)
    const { data, error: err } = await supabase
      .from("tareas")
      .insert({
        fecha: form.fecha,
        titulo: form.titulo.trim(),
        detalle: form.detalle.trim() || null,
        responsable_id: form.responsable_id,
        afecta_a: form.afecta_a,
        creada_por: yo.id,
        orden: 50,
      })
      .select()
      .single()
    setGuardando(false)
    if (err || !data) {
      setError(`No se pudo cargar: ${err?.message ?? "probá de nuevo"}`)
      return
    }
    onCreada(data as Tarea)
    setForm({ ...vacia(), responsable_id: form.responsable_id })
    cerrar()
  }

  return (
    <Dialog open={abierto} onOpenChange={(a) => !a && cerrar()}>
      <DialogContent showCloseButton={false} className="max-h-[90dvh] gap-4 overflow-y-auto">
        <DialogHeader className="text-left">
          <DialogTitle>Nueva tarea</DialogTitle>
          <DialogDescription>A quien la hace le llega un aviso.</DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="nt-titulo">Qué hay que hacer</Label>
          <Input
            id="nt-titulo"
            className="h-11 text-base"
            value={form.titulo}
            placeholder="Ej.: cambiar el filtro de carbón de la ósmosis"
            onChange={(e) => setForm({ ...form, titulo: e.target.value })}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="nt-quien">Quién la hace</Label>
            <Select
              value={form.responsable_id}
              onValueChange={(v) => setForm({ ...form, responsable_id: v, afecta_a: form.afecta_a.filter((x) => x !== v) })}
            >
              <SelectTrigger id="nt-quien" className="h-11 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {activos.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.id === yo.id ? `${p.nombre} (yo)` : p.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nt-fecha">Para cuándo</Label>
            <DatePicker
              id="nt-fecha"
              className="h-11"
              value={form.fecha}
              onChange={(fecha) => fecha && setForm({ ...form, fecha })}
            />
          </div>
        </div>
        <fieldset className="space-y-1.5">
          <legend className="mb-1.5 text-sm font-medium">A quién más afecta (también le llega el aviso)</legend>
          <div className="flex flex-wrap gap-2">
            {activos
              .filter((p) => p.id !== form.responsable_id)
              .map((p) => {
                const on = form.afecta_a.includes(p.id)
                return (
                  <Button
                    key={p.id}
                    type="button"
                    variant={on ? "default" : "outline"}
                    aria-pressed={on}
                    className="h-10"
                    onClick={() =>
                      setForm({ ...form, afecta_a: on ? form.afecta_a.filter((x) => x !== p.id) : [...form.afecta_a, p.id] })
                    }
                  >
                    {p.nombre}
                  </Button>
                )
              })}
          </div>
        </fieldset>
        <div className="space-y-1.5">
          <Label htmlFor="nt-detalle">Detalle (opcional)</Label>
          <Textarea id="nt-detalle" rows={2} value={form.detalle} onChange={(e) => setForm({ ...form, detalle: e.target.value })} />
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" className="h-11" onClick={cerrar}>
            Cancelar
          </Button>
          <Button className="h-12 text-base" disabled={guardando} onClick={cargar}>
            {guardando ? "Cargando…" : "Cargar tarea"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
