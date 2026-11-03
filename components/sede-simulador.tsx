"use client"

import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef } from "react"
import { createClient } from "@/lib/supabase/client"
import type { Perfil, Tarea } from "@/lib/equipo"
import type { SalaCultivo } from "@/lib/types"
import { cicloActual, etapaRiegoDe, momentoCiclo, type CicloSala } from "@/lib/ciclo"
import {
  canalDe,
  destinatarioDe,
  etapaDesdeSimulador,
  numeroOnull,
  personajeDe,
  resumenDia,
  ultimaPorSala,
  type LecturaSala,
} from "@/lib/sede"

interface Props {
  yo: { id: string; nombre: string } | null
  perfiles: Perfil[]
  salas: SalaCultivo[]
  ciclos: CicloSala[]
  /**
   * "sistema" (la Sede en la compu desde el rediseño del 03/11/2026): sin
   * controles de demo, con el clima, los ciclos y las tareas reales.
   * "original": el simulador tal cual lo dejó Facundo (/sede/oficina).
   */
  modo?: "sistema" | "original"
}

/** Pantallas a las que el simulador puede mandar a quien lo usa. */
const RUTAS_PERMITIDAS = ["/equipo", "/chat", "/riego", "/ciclos", "/monitoreo", "/sede/oficina"]

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
export function SedeSimulador({ yo, perfiles, salas, ciclos, modo = "original" }: Props) {
  const iframe = useRef<HTMLIFrameElement>(null)
  const router = useRouter()
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
          if (error) throw new Error(paraId ? "Los privados necesitan el script 088." : "No se pudo enviar.")
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

        // Modo sistema: clima de Pulse (ahora y el día), último riego, ciclos y
        // tareas de hoy, cada 5 minutos.
        case "sede:datos": {
          const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" })
          const medianoche = new Date(`${hoy}T00:00:00-03:00`).toISOString()
          const hace2horas = new Date(Date.now() - 2 * 3600_000).toISOString()
          const desde = medianoche < hace2horas ? medianoche : hace2horas
          const [lecturas, tareas, riegos] = await Promise.all([
            supabase
              .from("lecturas_ambientales")
              .select("sala_id, temperatura_c, humedad_rh, vpd, luz_lux, leido_en")
              .gte("leido_en", desde)
              .not("sala_id", "is", null)
              .order("leido_en", { ascending: false })
              .limit(4000),
            supabase.from("tareas").select("responsable_id, titulo, estado, orden").eq("fecha", hoy),
            supabase
              .from("registros_riego")
              .select("id, sala_id, fecha, ec_entrada, ph_entrada, drenaje_pct")
              .order("fecha", { ascending: false })
              .order("id", { ascending: false })
              .limit(200),
          ])
          const filas = (lecturas.data ?? []) as LecturaSala[]
          // «Ahora» solo si la lectura tiene menos de 2 horas: si no, el sensor está sin conexión.
          const ultimas = ultimaPorSala(filas.filter((l) => l.leido_en >= hace2horas))
          const horaDe = (iso: string) =>
            new Date(iso).toLocaleTimeString("es-AR", {
              timeZone: "America/Argentina/Buenos_Aires",
              hour: "2-digit",
              minute: "2-digit",
              hourCycle: "h23",
            })
          const masNueva = [...ultimas.values()].reduce<string | null>((u, l) => (!u || l.leido_en > u ? l.leido_en : u), null)
          const deHoy = (tareas.data ?? []) as Pick<Tarea, "responsable_id" | "titulo" | "estado" | "orden">[]
          type Riego = { sala_id: number; fecha: string; ec_entrada: number | null; ph_entrada: number | null; drenaje_pct: number | null }
          const ultimoRiego = new Map<number, Riego>()
          for (const r of (riegos.data ?? []) as Riego[]) if (!ultimoRiego.has(r.sala_id)) ultimoRiego.set(r.sala_id, r)
          return {
            actualizado: masNueva ? horaDe(masNueva) : null,
            salas: salas.map((s) => {
              const c = cicloActual(ciclos, s.id, hoy)
              const l = ultimas.get(s.id)
              const delDia = filas.filter((x) => x.sala_id === s.id && x.leido_en >= medianoche)
              const r = ultimoRiego.get(s.id)
              return {
                nombre: s.nombre,
                ciclo: c ? { inicio: c.fecha_inicio, vege: c.dias_vege, flora: c.dias_flora, m2: c.m2 } : null,
                lectura: l
                  ? { t: l.temperatura_c, h: l.humedad_rh, vpd: l.vpd, lux: l.luz_lux ?? null, hora: horaDe(l.leido_en) }
                  : null,
                dia: delDia.length
                  ? {
                      t: resumenDia(delDia.map((x) => x.temperatura_c)),
                      h: resumenDia(delDia.map((x) => x.humedad_rh)),
                      vpd: resumenDia(delDia.map((x) => x.vpd)),
                    }
                  : null,
                riego: r ? { fecha: r.fecha, ec: r.ec_entrada, ph: r.ph_entrada, drenaje: r.drenaje_pct } : null,
              }
            }),
            equipo: perfiles.map((perfil) => {
              const suyas = deHoy.filter((t) => t.responsable_id === perfil.id).sort((a, b) => a.orden - b.orden)
              return {
                nombre: nombres.get(perfil.id) ?? perfil.nombre,
                total: suyas.length,
                hechas: suyas.filter((t) => t.estado === "hecha").length,
                problemas: suyas.filter((t) => t.estado === "problema").length,
                tareas: suyas.map((t) => ({ titulo: t.titulo, estado: t.estado })),
              }
            }),
          }
        }

        case "navegar": {
          const ruta = String(p.ruta ?? "")
          if (!RUTAS_PERMITIDAS.includes(ruta)) throw new Error("Pantalla desconocida")
          router.push(ruta)
          return null
        }
      }
      throw new Error("Pedido desconocido: " + p.tipo)
    },
    [yo, miNombre, nombres, supabase, idDeNombre, salas, ciclos, perfiles, router],
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
    <main className="h-[calc(100dvh-4rem)] w-full lg:h-dvh">
      <iframe
        ref={iframe}
        src={modo === "sistema" ? "/sede/index.html?modo=sistema" : "/sede/index.html"}
        title="Sede Monarca en 3D"
        className="h-full w-full border-0"
        allow="fullscreen"
      />
    </main>
  )
}
