"use client"

import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef } from "react"
import { createClient } from "@/lib/supabase/client"
import type { Perfil, Tarea } from "@/lib/equipo"
import { puedeEditarTarea } from "@/lib/hoy"
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
const RUTAS_PERMITIDAS = ["/equipo", "/chat", "/riego", "/ciclos", "/monitoreo", "/procesos", "/sede/oficina"]

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
  // Para saber qué tareas puede marcar quien usa la Sede (las suyas o las de quien supervisa).
  const yoPerfil = useMemo(() => (yo ? (perfiles.find((p) => p.id === yo.id) ?? null) : null), [yo, perfiles])

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
          // Lecturas sala por sala: la base devuelve como mucho 1000 filas por
          // consulta y el día entero de todas las salas pasa ese límite (el
          // mínimo y máximo "del día" quedaban solo con las últimas horas).
          const lecturasPorSala = Promise.all(
            salas.map((s) =>
              supabase
                .from("lecturas_ambientales")
                .select("sala_id, temperatura_c, humedad_rh, vpd, luz_lux, leido_en")
                .eq("sala_id", s.id)
                .gte("leido_en", desde)
                .order("leido_en", { ascending: false })
                .limit(1000),
            ),
          ).then((rs) => ({ data: rs.flatMap((r) => r.data ?? []) }))
          const [lecturas, tareas, riegos, alertas] = await Promise.all([
            lecturasPorSala,
            supabase.from("tareas").select("id, responsable_id, titulo, estado, nota, orden, proceso_paso_id").eq("fecha", hoy),
            supabase
              .from("registros_riego")
              .select("id, sala_id, fecha, ec_entrada, ph_entrada, drenaje_pct")
              .order("fecha", { ascending: false })
              .order("id", { ascending: false })
              .limit(200),
            // Nubi: alertas de clima abiertas (las abre el motor, script 095).
            supabase.from("alertas_clima").select("sala_id, mensaje, desde").is("resuelta_en", null),
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
          const deHoy = (tareas.data ?? []) as Pick<Tarea, "id" | "responsable_id" | "titulo" | "estado" | "nota" | "orden" | "proceso_paso_id">[]
          type Riego = { sala_id: number; fecha: string; ec_entrada: number | null; ph_entrada: number | null; drenaje_pct: number | null }
          const ultimoRiego = new Map<number, Riego>()
          for (const r of (riegos.data ?? []) as Riego[]) if (!ultimoRiego.has(r.sala_id)) ultimoRiego.set(r.sala_id, r)
          return {
            actualizado: masNueva ? horaDe(masNueva) : null,
            alertas: ((alertas.data ?? []) as { sala_id: number; mensaje: string; desde: string }[]).flatMap((a) => {
              const sala = salas.find((x) => x.id === a.sala_id)
              return sala ? [{ sala: sala.nombre, mensaje: a.mensaje, desde: horaDe(a.desde) }] : []
            }),
            salas: salas.map((s) => {
              const c = cicloActual(ciclos, s.id, hoy)
              const l = ultimas.get(s.id)
              const delDia = filas.filter((x) => x.sala_id === s.id && x.leido_en >= medianoche)
              const r = ultimoRiego.get(s.id)
              return {
                nombre: s.nombre,
                ciclo: c ? { inicio: c.fecha_inicio, vege: c.dias_vege, flora: c.dias_flora, m2: c.m2 } : null,
                // Horario de luces de la base (script 099), el mismo que vigila el guardián.
                luz_prende: s.luz_prende ?? null,
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
                tareas: suyas.map((t) => ({
                  id: t.id,
                  titulo: t.titulo,
                  estado: t.estado,
                  nota: t.nota,
                  // Un paso de un procedimiento se completa con su formulario (pantalla Procedimientos).
                  paso: Boolean(t.proceso_paso_id),
                  puede: yoPerfil ? puedeEditarTarea(t as Tarea, yoPerfil, perfiles) : false,
                })),
              }
            }),
          }
        }

        // Marcar una tarea desde la Sede: hecha, de vuelta a pendiente o con un problema.
        case "tarea:estado": {
          if (!yoPerfil) throw new Error("Tu usuario no está en el equipo.")
          const estado = String(p.estado ?? "")
          if (estado !== "hecha" && estado !== "pendiente" && estado !== "problema") throw new Error("Estado desconocido")
          const { data: t } = await supabase.from("tareas").select("*").eq("id", Number(p.tarea)).maybeSingle()
          if (!t) throw new Error("No encuentro la tarea.")
          const tarea = t as Tarea
          if (!puedeEditarTarea(tarea, yoPerfil, perfiles)) throw new Error("Esa tarea no la podés marcar vos.")
          if (tarea.proceso_paso_id && estado === "hecha" && tarea.estado === "pendiente") {
            throw new Error("Este paso se completa con su formulario, en Procedimientos.")
          }
          const nota = estado === "problema" ? String(p.nota ?? "").trim().slice(0, 500) : tarea.nota
          if (estado === "problema" && !nota) throw new Error("Contá qué pasó.")
          const cambios =
            estado === "pendiente"
              ? { estado, nota: null, completada_at: null, completada_por: null }
              : { estado, nota, completada_at: new Date().toISOString(), completada_por: yoPerfil.id }
          const { error } = await supabase.from("tareas").update(cambios).eq("id", tarea.id)
          if (error) throw new Error("No se pudo guardar: " + error.message)
          return { estado }
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
    [yo, miNombre, nombres, supabase, idDeNombre, salas, ciclos, perfiles, router, yoPerfil],
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
    // Si el simulador cargó antes que esta página, sus primeros pedidos se perdieron:
    // se le avisa que ya hay quien conteste y los vuelve a hacer.
    iframe.current?.contentWindow?.postMessage({ fuente: "monarca-sistema", tipo: "listo" }, window.location.origin)
    return () => window.removeEventListener("message", onMessage)
  }, [atender])

  return (
    // En el celular entra justo entre la barra de arriba (3,75rem) y el espacio de la de abajo (6rem).
    <main className="h-[calc(100dvh-9.75rem)] w-full lg:h-dvh">
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
