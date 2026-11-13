"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Check, Satellite, X } from "lucide-react"
import { Button } from "@/components/ui/button"

/** Una propuesta de Nubi (tabla propuestas_nubi, script 096), con los nombres ya resueltos. */
export interface PropuestaNubi {
  id: number
  estado: "pendiente" | "aprobada" | "rechazada" | "vencida" | "informada"
  motivo: string
  resumen: string
  creada_en: string
  vence_en: string | null
  resuelta_por_nombre: string | null
}

const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })

const ESTADO: Record<PropuestaNubi["estado"], string> = {
  pendiente: "Esperando respuesta",
  aprobada: "Mandada",
  rechazada: "Descartada",
  vencida: "Venció sin respuesta",
  informada: "Aviso",
}

// Propuestas de Nubi en Control manual: las pendientes se aprueban o descartan
// acá (en iPhone la notificación no trae botones y abre esta pantalla).
export function NubiPropuestas({ pendientes, recientes }: { pendientes: PropuestaNubi[]; recientes: PropuestaNubi[] }) {
  const router = useRouter()
  const [ocupada, setOcupada] = useState<number | null>(null)
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null)

  if (pendientes.length === 0 && recientes.length === 0) return null

  async function contestar(id: number, decision: "mandar" | "no") {
    setOcupada(id)
    setAviso(null)
    try {
      const r = await fetch(`/api/nubi/propuestas/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      })
      const j = await r.json().catch(() => ({}))
      setAviso(r.ok ? { ok: true, texto: decision === "mandar" ? `Orden enviada: ${j.mensaje}` : "Propuesta descartada." } : { ok: false, texto: j.error || "No se pudo contestar." })
      router.refresh()
    } catch {
      setAviso({ ok: false, texto: "No se pudo contestar. Revisá la conexión." })
    } finally {
      setOcupada(null)
    }
  }

  return (
    <section className="mb-6 rounded-xl border border-sky-200 bg-sky-50 p-4" aria-label="Propuestas de Nubi">
      <h2 className="flex items-center gap-2 font-semibold text-sky-950">
        <Satellite className="h-5 w-5" /> Nubi propone
      </h2>
      <p className="mt-1 text-xs text-sky-900/80">
        Nubi mira el Pulse y cómo está el aire. Nada se manda sin que alguien lo apruebe; cada propuesta vence a los 30 minutos.
      </p>

      {pendientes.map((p) => (
        <div key={p.id} className="mt-3 rounded-lg border border-sky-200 bg-white p-3">
          <p className="font-medium text-foreground">{p.resumen.charAt(0).toUpperCase() + p.resumen.slice(1)}</p>
          <p className="text-sm text-muted-foreground">{p.motivo}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Propuesta a las {hora(p.creada_en)}{p.vence_en ? ` · vence a las ${hora(p.vence_en)}` : ""}
          </p>
          <div className="mt-3 flex gap-2">
            <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800" disabled={ocupada !== null} onClick={() => contestar(p.id, "mandar")}>
              <Check className="mr-1 h-4 w-4" /> {ocupada === p.id ? "Mandando…" : "Mandar"}
            </Button>
            <Button size="sm" variant="outline" disabled={ocupada !== null} onClick={() => contestar(p.id, "no")}>
              <X className="mr-1 h-4 w-4" /> No
            </Button>
          </div>
        </div>
      ))}

      {aviso && (
        <p role="status" className={`mt-3 rounded-lg p-2 text-sm ${aviso.ok ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-800"}`}>
          {aviso.texto}
        </p>
      )}

      {recientes.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-sky-950/80">
          {recientes.map((p) => (
            <li key={p.id}>
              {hora(p.creada_en)} · {p.resumen} — <span className="font-medium">{ESTADO[p.estado === "pendiente" ? "vencida" : p.estado]}</span>
              {p.resuelta_por_nombre && (p.estado === "aprobada" || p.estado === "rechazada") ? ` por ${p.resuelta_por_nombre}` : ""}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
