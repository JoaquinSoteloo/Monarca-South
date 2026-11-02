"use client"

import { useState } from "react"
import type { SupabaseClient } from "@supabase/supabase-js"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Plus } from "lucide-react"
import { DIAS, describirFrecuencia, type Perfil, type TareaPlantilla } from "@/lib/equipo"
import { useToast } from "@/hooks/use-toast"

interface Props {
  yo: Perfil
  perfiles: Perfil[]
  plantillas: TareaPlantilla[]
  setPlantillas: (fn: (ps: TareaPlantilla[]) => TareaPlantilla[]) => void
  supabase: SupabaseClient
}

const vacia = (responsable: string) => ({
  titulo: "",
  detalle: "",
  responsable_id: responsable,
  dias: [1, 2, 3, 4, 5, 6] as number[],
  afecta_a: [] as string[],
})

export function Rutinas({ yo, perfiles, plantillas, setPlantillas, supabase }: Props) {
  const { toast } = useToast()
  const puedeEditar = yo.ve_todas_las_tareas
  const [form, setForm] = useState(vacia(yo.id))
  const [abierto, setAbierto] = useState(false)
  const activos = perfiles.filter((p) => p.activo)
  const nombre = (id: string) => perfiles.find((p) => p.id === id)?.nombre ?? "—"

  async function toggleActiva(p: TareaPlantilla, activo: boolean) {
    const { error } = await supabase.from("tareas_plantilla").update({ activo }).eq("id", p.id)
    if (error) {
      toast({ title: "No se pudo cambiar", description: error.message, variant: "destructive" })
      return
    }
    setPlantillas((ps) => ps.map((x) => (x.id === p.id ? { ...x, activo } : x)))
  }

  async function crear() {
    if (!form.titulo.trim() || form.dias.length === 0) {
      toast({ title: "Faltan datos", description: "Poné un título y al menos un día.", variant: "destructive" })
      return
    }
    const { data, error } = await supabase
      .from("tareas_plantilla")
      .insert({
        titulo: form.titulo.trim(),
        detalle: form.detalle.trim() || null,
        responsable_id: form.responsable_id,
        afecta_a: form.afecta_a,
        frecuencia: "semanal",
        dias_semana: form.dias,
        orden: 200,
      })
      .select()
      .single()
    if (error || !data) {
      toast({ title: "No se pudo crear", description: error?.message, variant: "destructive" })
      return
    }
    setPlantillas((ps) => [...ps, data as TareaPlantilla])
    setForm(vacia(form.responsable_id))
    setAbierto(false)
    toast({ title: "Rutina creada", description: "Aparece desde mañana en las tareas del día." })
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Las rutinas generan solas las tareas de cada día (Manual 2).{" "}
        {puedeEditar ? "Podés pausarlas o sumar nuevas." : "Solo Facundo y Lucho las cambian."}
      </p>

      {puedeEditar && (
        <div>
          <Button variant="outline" onClick={() => setAbierto((v) => !v)}>
            <Plus className="mr-2 h-4 w-4" /> Nueva rutina
          </Button>
          {abierto && (
            <Card className="mt-3">
              <CardContent className="space-y-3 pt-6">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label>Título</Label>
                    <Input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label>Responsable</Label>
                    <Select value={form.responsable_id} onValueChange={(v) => setForm({ ...form, responsable_id: v })}>
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
                </div>
                <div className="space-y-1">
                  <Label>Días</Label>
                  <div className="flex flex-wrap gap-1">
                    {DIAS.map((d, i) => {
                      const n = i + 1
                      const on = form.dias.includes(n)
                      return (
                        <Button
                          key={d}
                          type="button"
                          size="sm"
                          variant={on ? "default" : "outline"}
                          onClick={() =>
                            setForm({ ...form, dias: on ? form.dias.filter((x) => x !== n) : [...form.dias, n].sort((a, b) => a - b) })
                          }
                        >
                          {d}
                        </Button>
                      )
                    })}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Avisar también a</Label>
                  <div className="flex flex-wrap gap-1">
                    {activos
                      .filter((p) => p.id !== form.responsable_id)
                      .map((p) => {
                        const on = form.afecta_a.includes(p.id)
                        return (
                          <Button
                            key={p.id}
                            type="button"
                            size="sm"
                            variant={on ? "default" : "outline"}
                            onClick={() =>
                              setForm({
                                ...form,
                                afecta_a: on ? form.afecta_a.filter((x) => x !== p.id) : [...form.afecta_a, p.id],
                              })
                            }
                          >
                            {p.nombre}
                          </Button>
                        )
                      })}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Cómo se hace (opcional)</Label>
                  <Textarea rows={2} value={form.detalle} onChange={(e) => setForm({ ...form, detalle: e.target.value })} />
                </div>
                <Button onClick={crear}>Guardar rutina</Button>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {activos.map((persona) => {
        const suyas = plantillas.filter((p) => p.responsable_id === persona.id).sort((a, b) => a.orden - b.orden)
        if (suyas.length === 0) return null
        return (
          <Card key={persona.id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{persona.nombre}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {suyas.map((p) => (
                <div key={p.id} className={`flex items-start justify-between gap-3 rounded border p-2 ${p.activo ? "" : "opacity-50"}`}>
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{p.titulo}</div>
                    <div className="text-xs text-muted-foreground">
                      {describirFrecuencia(p)}
                      {p.afecta_a.length > 0 && ` · avisa a ${p.afecta_a.map(nombre).join(", ")}`}
                    </div>
                  </div>
                  {puedeEditar && (
                    <Switch checked={p.activo} onCheckedChange={(v) => toggleActiva(p, v)} aria-label="Rutina activa" />
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
