"use client"

import { useEffect, useState } from "react"
import type { SupabaseClient } from "@supabase/supabase-js"
import { fechaCorta, fechasCiclo, type CicloSala } from "@/lib/ciclo"
import { evaluarRiego } from "@/lib/riego"
import type { Perfil, Tarea } from "@/lib/equipo"
import type { RegistroRiego } from "@/lib/types"

interface Evento {
  fecha: string
  orden: number
  tipo: "tarea" | "problema" | "riego"
  texto: string
  detalle?: string
}

/** Bitácora de la sala: tareas del ciclo hechas o con problema y riegos cargados, por fecha. */
export function Bitacora({ ciclo, perfiles, supabase, hoy }: { ciclo: CicloSala; perfiles: Perfil[]; supabase: SupabaseClient; hoy: string }) {
  const [eventos, setEventos] = useState<Evento[] | null>(null)

  useEffect(() => {
    const f = fechasCiclo(ciclo)
    const hasta = hoy < f.libre ? hoy : f.libre
    const nombre = (id: string | null) => perfiles.find((p) => p.id === id)?.nombre ?? ""
    Promise.all([
      supabase.from("tareas").select("*").eq("ciclo_id", ciclo.id).neq("estado", "pendiente"),
      supabase
        .from("registros_riego")
        .select("*")
        .eq("sala_id", ciclo.sala_id)
        .gte("fecha", f.inicio)
        .lte("fecha", hasta),
    ]).then(([t, r]) => {
      const ev: Evento[] = []
      for (const x of (t.data || []) as Tarea[]) {
        ev.push({
          fecha: x.completada_at?.slice(0, 10) ?? x.fecha,
          orden: 1,
          tipo: x.estado === "problema" ? "problema" : "tarea",
          texto: `${x.titulo.replace(/^.*? · /, "")} — ${nombre(x.completada_por)}`,
          detalle: x.nota ?? undefined,
        })
      }
      for (const x of (r.data || []) as RegistroRiego[]) {
        const n = (v: unknown) => (v === null || v === undefined ? null : Number(v))
        const alertas = evaluarRiego({
          etapa: x.etapa, semana: n(x.semana), ec_entrada: n(x.ec_entrada), ph_entrada: n(x.ph_entrada),
          ec_runoff: n(x.ec_runoff), ph_runoff: n(x.ph_runoff), drenaje_pct: n(x.drenaje_pct),
        }).filter((a) => a.nivel === "atencion")
        const v = (k: unknown, d = 1) => (k === null || k === undefined ? "—" : Number(k).toFixed(d).replace(".", ","))
        ev.push({
          fecha: x.fecha,
          orden: 2,
          tipo: alertas.length ? "problema" : "riego",
          texto: `Riego (${x.responsable}): EC ${v(x.ec_entrada, 2)} / pH ${v(x.ph_entrada)} → runoff EC ${v(x.ec_runoff, 2)} / pH ${v(x.ph_runoff)} / ${x.drenaje_pct ?? "—"} %`,
          detalle: alertas.map((a) => a.mensaje).join(" ") || x.notas || undefined,
        })
      }
      setEventos(ev.sort((a, b) => b.fecha.localeCompare(a.fecha) || a.orden - b.orden))
    })
  }, [ciclo, perfiles, supabase, hoy])

  if (eventos === null) return <p className="text-sm text-muted-foreground">Cargando…</p>
  if (eventos.length === 0) return <p className="text-sm text-muted-foreground">Todavía no hay registros en este ciclo.</p>

  return (
    <ol className="space-y-2 border-l pl-4 text-sm">
      {eventos.map((e, i) => (
        <li key={i} className="relative">
          <span
            className={`absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full ${e.tipo === "problema" ? "bg-red-600" : e.tipo === "riego" ? "bg-sky-500" : "bg-green-600"}`}
          />
          <span className="mr-2 text-xs text-muted-foreground">{fechaCorta(e.fecha)}</span>
          {e.texto}
          {e.detalle && <div className={`text-xs ${e.tipo === "problema" ? "text-red-700" : "text-muted-foreground"}`}>{e.detalle}</div>}
        </li>
      ))}
    </ol>
  )
}
