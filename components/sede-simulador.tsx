"use client"

import { useCallback, useEffect, useMemo, useRef } from "react"
import { createClient } from "@/lib/supabase/client"
import type { Perfil } from "@/lib/equipo"
import type { SalaCultivo } from "@/lib/types"
import { cicloActual, etapaRiegoDe, momentoCiclo, type CicloSala } from "@/lib/ciclo"
import { canalDe, destinatarioDe, etapaDesdeSimulador, numeroOnull, personajeDe } from "@/lib/sede"

interface Props {
  yo: { id: string; nombre: string } | null
  perfiles: Perfil[]
  salas: SalaCultivo[]
  ciclos: CicloSala[]
}

interface Pedido {
  tipo: string
  id?: number
  [k: string]: unknown
}

/**
 * El simulador corre en un iframe (mismo origen) y pide los datos con
 * postMessage: { fuente: "monarca-sede", tipo, id, ... }. Esta página responde
 * con la sesión de quien lo usa: el chat y los riegos van a la base y el
 * asistente al servidor. Así el simulador sigue siendo un solo archivo.
 */
export function SedeSimulador({ yo, perfiles, salas, ciclos }: Props) {
  const iframe = useRef<HTMLIFrameElement>(null)
  const supabase = useMemo(() => createClient(), [])

  // Nombre que se ve en el simulador para cada usuario (Lucho, Vilela… o su nombre).
  const nombres = useMemo(() => {
    const m = new Map<string, string>()
    for (const p of perfiles) m.set(p.id, personajeDe(p.nombre))
    if (yo && !m.has(yo.id)) m.set(yo.id, personajeDe(yo.nombre))
    return m
  }, [perfiles, yo])
  const idDeNombre = useCallback(
    (nombre: string) => [...nombres.entries()].find(([, n]) => n === nombre)?.[0] ?? null,
    [nombres],
  )
  const miNombre = yo ? nombres.get(yo.id) ?? yo.nombre : null

  const hora = (iso: string) =>
    new Date(iso).toLocaleString("es-AR", {
      timeZone: "America/Argentina/Buenos_Aires",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })

  const atender = useCallback(
    async (p: Pedido): Promise<unknown> => {
      if (!yo || !miNombre) throw new Error("Iniciá sesión para usar la sede.")
      switch (p.tipo) {
        case "hola":
          return { yo: miNombre, equipo: [...new Set(nombres.values())].filter((n) => n !== miNombre) }

        case "chat:listar": {
          const conPrivados = await supabase
            .from("mensajes")
            .select("autor_id, para_id, cuerpo, created_at")
            .is("tarea_id", null)
            .order("created_at", { ascending: false })
            .limit(300)
          const res = conPrivados.error
            ? await supabase
                .from("mensajes")
                .select("autor_id, cuerpo, created_at")
                .is("tarea_id", null)
                .order("created_at", { ascending: false })
                .limit(300)
            : conPrivados
          const filas = (res.data ?? []) as { autor_id: string; para_id?: string | null; cuerpo: string; created_at: string }[]
          const chat = filas.reverse().map((m) => {
            const quien = nombres.get(m.autor_id) ?? "Equipo"
            const para = m.para_id ? nombres.get(m.para_id) ?? "Equipo" : null
            return { quien, txt: m.cuerpo, h: hora(m.created_at), canal: canalDe(quien, para) }
          })
          const ia = await fetch("/api/asistente").then((r) => (r.ok ? r.json() : { mensajes: [] }))
          for (const m of (ia.mensajes ?? []) as { rol: string; cuerpo: string; created_at: string }[]) {
            chat.push({ quien: m.rol === "user" ? miNombre : "Asistente", txt: m.cuerpo, h: hora(m.created_at), canal: "ia:" + miNombre })
          }
          return chat
        }

        case "chat:enviar": {
          const txt = String(p.txt ?? "").trim().slice(0, 2000)
          if (!txt) return null
          const para = destinatarioDe(String(p.canal ?? "todos"), miNombre)
          const paraId = para ? idDeNombre(para) : null
          if (para && !paraId) throw new Error(`${para} todavía no tiene usuario en el sistema.`)
          const { error } = await supabase.from("mensajes").insert({ cuerpo: txt, autor_id: yo.id, ...(paraId ? { para_id: paraId } : {}) })
          if (error) throw new Error(paraId ? "Los privados necesitan el script 087." : "No se pudo enviar.")
          return null
        }

        case "ia:preguntar": {
          const r = await fetch("/api/asistente", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ mensaje: String(p.txt ?? "") }),
          })
          const data = await r.json().catch(() => ({}))
          if (!r.ok) throw new Error(data.error || "El asistente no pudo responder ahora.")
          return data.respuesta as string
        }

        case "riego:guardar": {
          const r = (p.registro ?? {}) as Record<string, unknown>
          const sala = salas.find((s) => s.nombre.toLowerCase() === String(r.sala ?? "").toLowerCase())
          if (!sala) throw new Error(`No encuentro «${r.sala}» en Cultivo.`)
          const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" })
          const ciclo = cicloActual(ciclos, sala.id, hoy)
          const er = ciclo ? etapaRiegoDe(momentoCiclo(ciclo, hoy)) : null
          const { error } = await supabase.from("registros_riego").insert({
            fecha: hoy,
            sala_id: sala.id,
            etapa: er?.etapa ?? etapaDesdeSimulador(String(r.etapa ?? "")),
            semana: er?.semana ?? null,
            responsable: miNombre,
            cargado_por: yo.id,
            ec_entrada: numeroOnull(r.ec_entrada),
            ph_entrada: numeroOnull(r.ph_entrada),
            litros_por_maceta: numeroOnull(r.litros_por_maceta),
            ec_runoff: numeroOnull(r.ec_runoff),
            ph_runoff: numeroOnull(r.ph_runoff),
            drenaje_pct: numeroOnull(r.drenaje_pct) === null ? null : Math.round(numeroOnull(r.drenaje_pct) as number),
            notas: String(r.notas ?? "") || null,
          })
          if (error) throw new Error("No se pudo guardar el riego: " + error.message)
          return { sala: sala.nombre }
        }
      }
      throw new Error("Pedido desconocido: " + p.tipo)
    },
    [yo, miNombre, nombres, supabase, idDeNombre, salas, ciclos],
  )

  useEffect(() => {
    const onMessage = async (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== iframe.current?.contentWindow) return
      const p = e.data as Pedido & { fuente?: string }
      if (!p || p.fuente !== "monarca-sede" || typeof p.tipo !== "string") return
      const responder = (r: { ok: boolean; datos?: unknown; error?: string }) =>
        iframe.current?.contentWindow?.postMessage({ fuente: "monarca-sistema", id: p.id, ...r }, window.location.origin)
      try {
        responder({ ok: true, datos: await atender(p) })
      } catch (err) {
        responder({ ok: false, error: err instanceof Error ? err.message : "Error" })
      }
    }
    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
  }, [atender])

  return (
    <main className="h-[calc(100dvh-4rem)] w-full">
      <iframe ref={iframe} src="/sede/index.html" title="Sede Monarca" className="h-full w-full border-0" allow="fullscreen" />
    </main>
  )
}
