// Nubi propone (script 096; piensa con IA desde el 14/11/2026, script 102).
// En cada corrida del motor mira las salas con aire o deshumidificador:
//   - La IA (lib/nubi-pensar.ts y lib/nubi-ia.ts) analiza cada sala cada 10
//     minutos, o enseguida si se abrió una alerta, y decide si proponer una
//     orden, avisar o no hacer nada. Lo que decide pasa por guardrails.
//   - Si la IA no responde, se usan las reglas de lib/nubi.ts como respaldo.
//   - El aviso de deshumidificador prendido sin consumir es fijo, sin IA.
// Manda un push con "Mandar" / "No" solo a quienes pueden usar Control manual.
// Nada se manda a un equipo sin que una persona lo apruebe
// (app/api/nubi/propuestas/[id]). Cada decisión queda en nubi_decisiones.
//
// Corre con el cliente service_role dentro del lock del motor, después de
// avisarClima (lib/clima-alertas-aviso.ts). No importar desde código que
// llegue al navegador: web-push no se puede empaquetar para él.
import type { SupabaseClient } from "@supabase/supabase-js"
import { sendPushToUsers } from "@/lib/push/send"
import { ultimoValor, textoProblema } from "@/lib/clima-alertas"
import {
  estadoAire,
  estadoOnOff,
  hayQueEsperar,
  proponer,
  proponerDeshumidificador,
  sinConsumoLargo,
  temperaturaEn,
  textoEstadoAire,
  textoEstadoOnOff,
  MINUTOS_ESPERA,
  MINUTOS_VIGENCIA,
  type Propuesta,
} from "@/lib/nubi"
import { motivoDe } from "@/lib/nubi-ia"
import { cargarSalas, pensar, registrar, tocaPensar, type SalaParaPensar } from "@/lib/nubi-pensar"
import { ROL_COMISION } from "@/lib/permisos"

/** Usuarios que pueden aprobar: la comisión y los roles con Control manual. */
export async function aprobadores(supabase: SupabaseClient): Promise<string[]> {
  const [perfiles, permisos] = await Promise.all([
    supabase.from("perfiles").select("user_id, rol, activo").eq("activo", true),
    supabase.from("rol_permisos").select("rol").eq("permiso", "control-manual.ver"),
  ])
  const roles = new Set<string>([ROL_COMISION, ...((permisos.data ?? []) as { rol: string }[]).map((p) => p.rol)])
  return ((perfiles.data ?? []) as { user_id: string | null; rol: string }[])
    .filter((p) => p.user_id && roles.has(p.rol))
    .map((p) => p.user_id as string)
}

export interface Publicable {
  salaId: number
  dispositivoId: number
  alertaId: number | null
  motivo: string
  propuesta: Propuesta
  titulo: string
}

/** Guarda la propuesta (o el aviso) y le manda el push a `destinatarios`. Devuelve su id. */
export async function publicarPropuesta(
  supabase: SupabaseClient,
  args: Publicable,
  destinatarios: string[],
  ahora: Date = new Date(),
): Promise<{ id: number; enviados: number } | null> {
  const { propuesta } = args
  const { data: fila, error } = await supabase
    .from("propuestas_nubi")
    .insert({
      sala_id: args.salaId,
      dispositivo_id: args.dispositivoId,
      alerta_id: args.alertaId,
      estado: propuesta.tipo === "orden" ? "pendiente" : "informada",
      motivo: args.motivo,
      resumen: propuesta.resumen,
      payload: propuesta.tipo === "orden" ? propuesta.payload : null,
      creada_en: ahora.toISOString(),
      vence_en: propuesta.tipo === "orden" ? new Date(ahora.getTime() + MINUTOS_VIGENCIA * 60000).toISOString() : null,
    })
    .select("id")
    .single()
  if (error || !fila) {
    console.error("[nubi] No se pudo guardar la propuesta:", error)
    return null
  }
  let enviados = 0
  try {
    const r = await sendPushToUsers(
      destinatarios,
      propuesta.tipo === "orden"
        ? {
            title: `🛰 ¿${propuesta.resumen.charAt(0).toUpperCase()}${propuesta.resumen.slice(1)}?`,
            body: `Nubi · ${args.motivo}. Vence en ${MINUTOS_VIGENCIA} minutos.`,
            url: "/control-manual",
            tag: `nubi-${fila.id}`,
            acciones: [
              { action: "mandar", title: "Mandar" },
              { action: "no", title: "No" },
            ],
            datos: { propuestaId: fila.id },
          }
        : { title: args.titulo, body: propuesta.resumen, url: "/control-manual", tag: `nubi-${fila.id}` },
    )
    enviados = r.sent
  } catch (err) {
    // La propuesta igual queda en Control manual para aprobarla desde ahí.
    console.error("[nubi] No se pudo mandar el push:", err)
  }
  return { id: fila.id as number, enviados }
}

/** Lo que proponen las reglas para una sala (respaldo si la IA no responde). */
export function reglasDeSala(s: SalaParaPensar, ahora: Date): Publicable[] {
  const salida: Publicable[] = []
  const { sala, rango, lecturas } = s
  for (const equipo of s.equipos) {
    if (equipo.ultimo_comando_en && (ahora.getTime() - new Date(equipo.ultimo_comando_en).getTime()) / 60000 < MINUTOS_ESPERA) continue
    if (equipo.tipo === "aire_acondicionado") {
      const alerta = s.alertas.find((a) => a.variable === "temperatura")
      const temperatura = ultimoValor(lecturas, "temperatura")
      if (!alerta || temperatura === null) continue
      const estado = estadoAire(equipo)
      const esperar = hayQueEsperar({
        ahora,
        ultimaOrdenEn: equipo.ultimo_comando_en,
        temperaturaAlMandar: equipo.ultimo_comando_en ? temperaturaEn(lecturas, equipo.ultimo_comando_en) : null,
        temperaturaAhora: temperatura,
        lado: alerta.lado,
      })
      const propuesta = esperar ? null : proponer(rango, temperatura, estado)
      if (!propuesta) continue
      salida.push({
        salaId: sala.id,
        dispositivoId: equipo.id,
        alertaId: alerta.id,
        motivo: `${sala.nombre}: ${textoProblema({ variable: "temperatura", lado: alerta.lado, valor: temperatura, limite: alerta.limite })}, aire ${textoEstadoAire(estado)}`,
        propuesta,
        titulo: `🛰 Nubi: ${sala.nombre}`,
      })
    } else {
      const humedad = ultimoValor(lecturas, "humedad")
      if (humedad === null) continue
      const estado = estadoOnOff(equipo, ahora)
      // Para prender hace falta la alerta (15 minutos con humedad alta); para apagar, no.
      const alerta = s.alertas.find((a) => a.variable === "humedad" && a.lado === "alto")
      const propuesta = proponerDeshumidificador(rango, humedad, estado)
      if (!propuesta || (propuesta.tipo === "orden" && propuesta.payload.accion === "encender" && !alerta)) continue
      const [min, max] = rango.humedad
      salida.push({
        salaId: sala.id,
        dispositivoId: equipo.id,
        alertaId: alerta?.id ?? null,
        motivo: `${sala.nombre}: humedad ${humedad} %, el rango es de ${min} a ${max} %, ${equipo.nombre.toLowerCase()} ${textoEstadoOnOff(estado)}`,
        propuesta,
        titulo: `🛰 Nubi: ${sala.nombre}`,
      })
    }
  }
  return salida
}

/** Revisa las salas. Devuelve cuántas propuestas (o avisos) salieron. */
export async function proponerNubi(supabase: SupabaseClient, ahora: Date = new Date()): Promise<number> {
  const ahoraIso = ahora.toISOString()

  // Las que nadie contestó a tiempo vencen: la situación ya puede ser otra.
  await supabase.from("propuestas_nubi").update({ estado: "vencida", resuelta_en: ahoraIso }).eq("estado", "pendiente").lte("vence_en", ahoraIso)

  const [salas, pendientesR, informadasR] = await Promise.all([
    cargarSalas(supabase, ahora),
    supabase.from("propuestas_nubi").select("dispositivo_id").eq("estado", "pendiente"),
    supabase.from("propuestas_nubi").select("dispositivo_id, creada_en").eq("estado", "informada"),
  ])
  for (const r of [pendientesR, informadasR]) if (r.error) throw new Error(r.error.message)
  const conPendiente = new Set(((pendientesR.data ?? []) as { dispositivo_id: number }[]).map((p) => p.dispositivo_id))
  const informadas = (informadasR.data ?? []) as { dispositivo_id: number; creada_en: string }[]

  let quienes: string[] | null = null
  let salieron = 0
  async function publicar(args: Publicable): Promise<number | null> {
    quienes ??= await aprobadores(supabase)
    const r = await publicarPropuesta(supabase, args, quienes, ahora)
    if (!r) return null
    if (args.propuesta.tipo === "orden") conPendiente.add(args.dispositivoId)
    salieron += 1
    return r.id
  }

  // 1) Deshumidificador prendido sin consumir hace 15 minutos: aviso fijo, uno por cada vez que pasa.
  for (const s of salas) {
    for (const deshu of s.equipos.filter((d) => d.tipo === "deshumidificador")) {
      const estado = estadoOnOff(deshu, ahora)
      if (estado.tipo !== "prendido" || !sinConsumoLargo(estado, ahora)) continue
      const desdeCuando = estado.sinConsumoDesde as string
      if (informadas.some((p) => p.dispositivo_id === deshu.id && p.creada_en >= desdeCuando)) continue
      const nombre = deshu.nombre.toLowerCase()
      const minutos = Math.round((ahora.getTime() - new Date(desdeCuando).getTime()) / 60000)
      const resumen = `Hace ${minutos} minutos que está prendido pero marca ${Math.round(estado.potenciaW ?? 0)} W. Fijate si se llenó el tanque, si está desenchufado o apagado con su botón.`
      const id = await publicar({
        salaId: s.sala.id,
        dispositivoId: deshu.id,
        alertaId: null,
        motivo: `${s.sala.nombre}: ${nombre} prendido sin consumir`,
        propuesta: { tipo: "aviso", resumen },
        titulo: `🛰 ${s.sala.nombre}: el ${nombre} no está consumiendo`,
      })
      if (id) s.entrada.recientes.unshift({ haceMin: 0, propuso: resumen, respuesta: "aviso", quien: null, dispositivoId: deshu.id, payload: null })
    }
  }

  // 2) La IA piensa las salas que tocan, todas a la vez (cada una tarda unos segundos).
  const aPensar = salas.filter(
    (s) =>
      tocaPensar(ahora, s.alertas) &&
      (s.entrada.ahora.temperatura !== null || s.entrada.ahora.humedad !== null) &&
      // Con una propuesta esperando respuesta o una orden en camino, se espera.
      !s.equipos.some((d) => conPendiente.has(d.id) || d.ultimo_comando_estado === "pendiente" || d.ultimo_comando_estado === "en_proceso"),
  )
  const pensamientos = await Promise.all(aPensar.map((s) => pensar(s.entrada).catch(() => null)))

  for (const [i, s] of aPensar.entries()) {
    const p = pensamientos[i]
    if (!p) {
      // 3) La IA no respondió: respaldo con las reglas.
      for (const r of reglasDeSala(s, ahora)) {
        if (conPendiente.has(r.dispositivoId)) continue
        // Un aviso por sala cada 3 horas, como con la IA.
        if (r.propuesta.tipo === "aviso" && s.entrada.recientes.some((x) => x.respuesta === "aviso" && x.haceMin < 180)) continue
        const id = await publicar(r)
        if (id && r.propuesta.tipo === "aviso") s.entrada.recientes.unshift({ haceMin: 0, propuso: r.propuesta.resumen, respuesta: "aviso", quien: null })
        await registrar(supabase, {
          salaId: s.sala.id,
          fuente: "reglas",
          entrada: { motivo: r.motivo },
          salida: r.propuesta,
          decision: r.propuesta.tipo === "orden" ? "proponer" : "avisar",
          valida: true,
          propuestaId: id,
        })
      }
      continue
    }
    const v = p.validacion
    let propuestaId: number | null = null
    if (v.ok && v.tipo !== "nada" && v.dispositivoId !== null) {
      propuestaId = await publicar({
        salaId: s.sala.id,
        dispositivoId: v.dispositivoId,
        alertaId: s.alertas[0]?.id ?? null,
        motivo: `${s.sala.nombre}: ${motivoDe(p.decision)}`,
        propuesta: v.propuesta,
        titulo: `🛰 Nubi: ${s.sala.nombre}`,
      })
    }
    await registrar(supabase, { salaId: s.sala.id, fuente: "ia", pensamiento: p, propuestaId })
  }
  return salieron
}
