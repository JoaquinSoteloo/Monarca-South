// Nubi propone (script 096): en cada corrida del motor mira las salas y propone
// órdenes para sus equipos (lib/nubi.ts). Manda un push con "Mandar" / "No"
// solo a quienes pueden usar Control manual. Nada se manda a un equipo sin que
// una persona lo apruebe (app/api/nubi/propuestas/[id]).
//   - Aire: salas con alerta de temperatura → cuánto ajustarlo.
//   - Deshumidificador (13/11/2026): prenderlo con humedad alta, apagarlo
//     cuando bajó a la mitad del rango, y avisar si está prendido sin consumir.
//
// Corre con el cliente service_role dentro del lock del motor, después de
// avisarClima (lib/clima-alertas-aviso.ts). No importar desde código que
// llegue al navegador: web-push no se puede empaquetar para él.
import type { SupabaseClient } from "@supabase/supabase-js"
import { sendPushToUsers } from "@/lib/push/send"
import { cicloActual, type CicloSala } from "@/lib/ciclo"
import { rangoClima, ultimoValor, textoProblema, type LecturaClima } from "@/lib/clima-alertas"
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
import { ROL_COMISION } from "@/lib/permisos"
import type { DispositivoControlable } from "@/lib/types"
import type { AlertaClima } from "@/lib/clima-alertas-aviso"

const fechaAR = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" })

/** Usuarios que pueden aprobar: la comisión y los roles con Control manual. */
async function aprobadores(supabase: SupabaseClient): Promise<string[]> {
  const [perfiles, permisos] = await Promise.all([
    supabase.from("perfiles").select("user_id, rol, activo").eq("activo", true),
    supabase.from("rol_permisos").select("rol").eq("permiso", "control-manual.ver"),
  ])
  const roles = new Set<string>([ROL_COMISION, ...((permisos.data ?? []) as { rol: string }[]).map((p) => p.rol)])
  return ((perfiles.data ?? []) as { user_id: string | null; rol: string }[])
    .filter((p) => p.user_id && roles.has(p.rol))
    .map((p) => p.user_id as string)
}

/** Revisa las salas. Devuelve cuántas propuestas (o avisos) salieron. */
export async function proponerNubi(supabase: SupabaseClient, ahora: Date = new Date()): Promise<number> {
  const ahoraIso = ahora.toISOString()

  // Las que nadie contestó a tiempo vencen: la situación ya puede ser otra.
  await supabase.from("propuestas_nubi").update({ estado: "vencida", resuelta_en: ahoraIso }).eq("estado", "pendiente").lte("vence_en", ahoraIso)

  const hoy = fechaAR(ahora)
  const desde = new Date(ahora.getTime() - 70 * 60000).toISOString()
  const [alertasR, equiposR, salasR, ciclosR, lecturasR, pendientesR, informadasR] = await Promise.all([
    supabase.from("alertas_clima").select("*").is("resuelta_en", null),
    supabase.from("dispositivos_controlables").select("*").eq("activo", true).in("tipo", ["aire_acondicionado", "deshumidificador"]),
    supabase.from("salas_cultivo").select("id, nombre"),
    supabase.from("ciclos_sala").select("*").eq("estado", "abierto"),
    supabase.from("lecturas_ambientales").select("sala_id, temperatura_c, humedad_rh, leido_en").gte("leido_en", desde).not("sala_id", "is", null),
    supabase.from("propuestas_nubi").select("dispositivo_id").eq("estado", "pendiente"),
    supabase.from("propuestas_nubi").select("alerta_id, dispositivo_id, creada_en").eq("estado", "informada"),
  ])
  for (const r of [alertasR, equiposR, salasR, ciclosR, lecturasR, pendientesR, informadasR]) if (r.error) throw new Error(r.error.message)

  const alertas = (alertasR.data ?? []) as AlertaClima[]
  // Los equipos de prueba (manual_noop) no mueven nada real: Nubi no les propone.
  const equipos = ((equiposR.data ?? []) as DispositivoControlable[]).filter((d) => d.sala_id !== null && d.proveedor !== "manual_noop")
  const salas = (salasR.data ?? []) as { id: number; nombre: string }[]
  const ciclos = (ciclosR.data ?? []) as CicloSala[]
  const lecturas = (lecturasR.data ?? []) as (LecturaClima & { sala_id: number })[]
  const conPendiente = new Set(((pendientesR.data ?? []) as { dispositivo_id: number }[]).map((p) => p.dispositivo_id))
  const informadas = (informadasR.data ?? []) as { alerta_id: number | null; dispositivo_id: number; creada_en: string }[]
  const yaInformadas = new Set(informadas.map((p) => p.alerta_id))

  let quienes: string[] | null = null
  let salieron = 0

  /** Guarda la propuesta (o el aviso) y le pregunta a quienes pueden aprobar. */
  async function publicar(args: {
    salaId: number
    dispositivoId: number
    alertaId: number | null
    motivo: string
    propuesta: Propuesta
    titulo: string
  }) {
    const { propuesta } = args
    const { data: fila, error: errInsert } = await supabase
      .from("propuestas_nubi")
      .insert({
        sala_id: args.salaId,
        dispositivo_id: args.dispositivoId,
        alerta_id: args.alertaId,
        estado: propuesta.tipo === "orden" ? "pendiente" : "informada",
        motivo: args.motivo,
        resumen: propuesta.resumen,
        payload: propuesta.tipo === "orden" ? propuesta.payload : null,
        creada_en: ahoraIso,
        vence_en: propuesta.tipo === "orden" ? new Date(ahora.getTime() + MINUTOS_VIGENCIA * 60000).toISOString() : null,
      })
      .select("id")
      .single()
    if (errInsert || !fila) {
      console.error("[nubi] No se pudo guardar la propuesta:", errInsert)
      return
    }
    conPendiente.add(args.dispositivoId)
    quienes ??= await aprobadores(supabase)
    try {
      await sendPushToUsers(
        quienes,
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
    } catch (err) {
      // La propuesta igual queda en Control manual para aprobarla desde ahí.
      console.error("[nubi] No se pudo mandar el push:", err)
    }
    salieron += 1
  }

  // Aire: salas con alerta de temperatura.
  for (const alerta of alertas.filter((a) => a.variable === "temperatura")) {
    const sala = salas.find((s) => s.id === alerta.sala_id)
    const aire = equipos.find((d) => d.sala_id === alerta.sala_id && d.tipo === "aire_acondicionado")
    if (!sala || !aire || conPendiente.has(aire.id)) continue

    const rango = rangoClima(sala.nombre, cicloActual(ciclos, sala.id, hoy), hoy)
    const suyas = lecturas.filter((l) => l.sala_id === sala.id)
    const temperatura = ultimoValor(suyas, "temperatura")
    if (!rango || temperatura === null) continue

    const estado = estadoAire(aire)
    if (
      hayQueEsperar({
        ahora,
        ultimaOrdenEn: aire.ultimo_comando_en,
        temperaturaAlMandar: aire.ultimo_comando_en ? temperaturaEn(suyas, aire.ultimo_comando_en) : null,
        temperaturaAhora: temperatura,
        lado: alerta.lado,
      })
    ) {
      continue
    }

    const propuesta = proponer(rango, temperatura, estado)
    if (!propuesta) continue
    if (propuesta.tipo === "aviso" && yaInformadas.has(alerta.id)) continue
    await publicar({
      salaId: sala.id,
      dispositivoId: aire.id,
      alertaId: alerta.id,
      motivo: `${sala.nombre}: ${textoProblema({ variable: "temperatura", lado: alerta.lado, valor: temperatura, limite: alerta.limite })}, aire ${textoEstadoAire(estado)}`,
      propuesta,
      titulo: `🛰 Nubi: ${sala.nombre}`,
    })
  }

  // Deshumidificadores.
  for (const deshu of equipos.filter((d) => d.tipo === "deshumidificador")) {
    const sala = salas.find((s) => s.id === deshu.sala_id)
    if (!sala || conPendiente.has(deshu.id)) continue
    const estado = estadoOnOff(deshu, ahora)
    const nombre = deshu.nombre.toLowerCase()

    // Prendido pero sin consumir hace 15 minutos: un aviso por cada vez que pasa.
    if (estado.tipo === "prendido" && sinConsumoLargo(estado, ahora)) {
      const desdeCuando = estado.sinConsumoDesde as string
      if (!informadas.some((p) => p.dispositivo_id === deshu.id && p.creada_en >= desdeCuando)) {
        const minutos = Math.round((ahora.getTime() - new Date(desdeCuando).getTime()) / 60000)
        await publicar({
          salaId: sala.id,
          dispositivoId: deshu.id,
          alertaId: null,
          motivo: `${sala.nombre}: ${nombre} prendido sin consumir`,
          propuesta: {
            tipo: "aviso",
            resumen: `Hace ${minutos} minutos que está prendido pero marca ${Math.round(estado.potenciaW ?? 0)} W. Fijate si se llenó el tanque, si está desenchufado o apagado con su botón.`,
          },
          titulo: `🛰 ${sala.nombre}: el ${nombre} no está consumiendo`,
        })
      }
      continue
    }

    // Después de una orden, 10 minutos para que haga efecto.
    if (deshu.ultimo_comando_en && (ahora.getTime() - new Date(deshu.ultimo_comando_en).getTime()) / 60000 < MINUTOS_ESPERA) continue

    const rango = rangoClima(sala.nombre, cicloActual(ciclos, sala.id, hoy), hoy)
    const humedad = ultimoValor(lecturas.filter((l) => l.sala_id === sala.id), "humedad")
    if (!rango || humedad === null) continue
    // Para prender hace falta la alerta (15 minutos con humedad alta); para apagar, no.
    const alerta = alertas.find((a) => a.sala_id === sala.id && a.variable === "humedad" && a.lado === "alto")
    const propuesta = proponerDeshumidificador(rango, humedad, estado)
    if (!propuesta || (propuesta.tipo === "orden" && propuesta.payload.accion === "encender" && !alerta)) continue
    const [min, max] = rango.humedad
    await publicar({
      salaId: sala.id,
      dispositivoId: deshu.id,
      alertaId: alerta?.id ?? null,
      motivo: `${sala.nombre}: humedad ${humedad} % (rango ${min}–${max}), ${nombre} ${textoEstadoOnOff(estado)}`,
      propuesta,
      titulo: `🛰 Nubi: ${sala.nombre}`,
    })
  }
  return salieron
}
