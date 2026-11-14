"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Lightbulb } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

/**
 * Horario de luces de una sala (script 099). Lo usa el guardián de luces
 * (lib/guardian-luces.ts) para avisar si se prenden de noche o no prenden.
 * Hay que cambiarlo al pasar la sala a flora.
 */
export function HorarioLuces({ salaId, prende, apaga }: { salaId: number; prende: string | null; apaga: string | null }) {
  const router = useRouter()
  const [editando, setEditando] = useState(false)
  const [desde, setDesde] = useState(prende?.slice(0, 5) ?? "")
  const [hasta, setHasta] = useState(apaga?.slice(0, 5) ?? "")
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState("")

  const horas = (() => {
    if (!prende || !apaga) return null
    const a = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5))
    const min = (a(apaga) - a(prende) + 1440) % 1440
    return Math.round((min / 60) * 10) / 10
  })()

  async function guardar() {
    if (!/^\d{2}:\d{2}$/.test(desde) || !/^\d{2}:\d{2}$/.test(hasta) || desde === hasta) {
      setError("Poné la hora en que prenden y en la que apagan (distintas).")
      return
    }
    setGuardando(true)
    setError("")
    const { error: err } = await createClient().from("salas_cultivo").update({ luz_prende: desde, luz_apaga: hasta }).eq("id", salaId)
    setGuardando(false)
    if (err) {
      setError("No se pudo guardar el horario.")
      return
    }
    setEditando(false)
    router.refresh()
  }

  if (editando) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-border p-2 text-sm">
        <Lightbulb className="h-4 w-4 text-amber-600" />
        <span>Prenden</span>
        <Input type="time" value={desde} onChange={(e) => setDesde(e.target.value)} className="h-8 w-28" aria-label="Hora en que prenden las luces" />
        <span>apagan</span>
        <Input type="time" value={hasta} onChange={(e) => setHasta(e.target.value)} className="h-8 w-28" aria-label="Hora en que apagan las luces" />
        <Button size="sm" onClick={guardar} disabled={guardando}>{guardando ? "Guardando…" : "Guardar"}</Button>
        <Button size="sm" variant="ghost" onClick={() => setEditando(false)} disabled={guardando}>Cancelar</Button>
        {error && <p className="basis-full text-xs text-red-700">{error}</p>}
      </div>
    )
  }

  return (
    <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
      <Lightbulb className="h-4 w-4 text-amber-600" />
      {prende && apaga ? (
        <span>
          Luces de <strong className="text-foreground">{prende.slice(0, 5)}</strong> a <strong className="text-foreground">{apaga.slice(0, 5)}</strong>
          {horas !== null && ` (${String(horas).replace(".", ",")} h)`} · Nubi avisa si prenden de noche o no prenden
        </span>
      ) : (
        <span>Sin horario de luces: Nubi no puede vigilarlas</span>
      )}
      <button type="button" className="text-primary underline" onClick={() => setEditando(true)}>
        Cambiar
      </button>
    </p>
  )
}
