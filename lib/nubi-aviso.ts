// Nubi propone (script 096): en cada corrida del motor, para cada sala con una
// alerta de temperatura abierta y un aire controlable, mira cómo está el aire
// y propone cuánto ajustarlo (lib/nubi.ts). Manda un push con "Mandar" / "No"
// solo a quienes pueden usar Control manual. Nada se manda al aire sin que
// una persona lo apruebe (app/api/nubi/propuestas/[id]).
//
// Corre con el cliente service_role dentro del lock del motor, después de
// avisarClima (lib/clima-alertas-aviso.ts). No importar desde código que
// llegue al navegador: web-push no se puede empaquetar para él.
import type { SupabaseClient } from "@supabase/supabase-js"
import { sendPushToUsers } from "@/lib/push/send"
import { cicloActual, type CicloSala } from "@/lib/ciclo"
import { rangoClima, ultimoValor, textoProblema, type LecturaClima } from "@/lib/clima-alertas"
import { estadoAire, hayQueEsperar, proponer, temperaturaEn, textoEstadoAire, MINUTOS_VIGENCIA } from "@/lib/nubi"
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

/** Revisa las salas con alerta de temperatura. Devuelve cuántas propuestas (o avisos) salieron. */
export async function proponerNubi(supabase: SupabaseClient, ahora: Date = new Date()): Promise<number> {
  const ahoraIso = ahora.toISOString()

  // Las que nadie contestó a tiempo vencen: la situación ya puede ser otra.
  await supabase.from("propuestas_nubi").update({ estado: "vencida", resuelta_en: ahoraIso }).eq("estado", "pendiente").lte("vence_en", ahoraIso)

  const { data: alertasData, error } = await supabase
    .from("alertas_clima")
    .select("*")
    .is("resuelta_en", null)
    .eq("variable", "temperatura")
  if (error) throw new Error(error.message)
  const alertas = (alertasData ?? []) as AlertaClima[]
  if (alertas.length === 0) return 0

  const hoy = fechaAR(ahora)
  const desde = new Date(ahora.getTime() - 70 * 60000).toISOString()
  const [equiposR, salasR, ciclosR, lecturasR, pendientesR, informadasR] = await Promise.all([
    supabase.from("dispositivos_controlables").select("*").eq("activo", true).eq("tipo", "aire_acondicionado"),
    supabase.from("salas_cultivo").select("id, nombre"),
    supabase.from("ciclos_sala").select("*").eq("estado", "abierto"),
    supabase.from("lecturas_ambientales").select("sala_id, temperatura_c, humedad_rh, leido_en").gte("leido_en", desde).not("sala_id", "is", null),
    supabase.from("propuestas_nubi").select("dispositivo_id").eq("estado", "pendiente"),
    supabase.from("propuestas_nubi").select("alerta_id").eq("estado", "informada"),
  ])
  for (const r of [equiposR, salasR, ciclosR, lecturasR, pendientesR, informadasR]) if (r.error) throw new Error(r.error.message)

  // Los equipos de prueba (manual_noop) no mueven nada real: Nubi no les propone.
  const equipos = ((equiposR.data ?? []) as DispositivoControlable[]).filter((d) => d.sala_id !== null && d.proveedor !== "manual_noop")
  const salas = (salasR.data ?? []) as { id: number; nombre: string }[]
  const ciclos = (ciclosR.data ?? []) as CicloSala[]
  const lecturas = (lecturasR.data ?? []) as (LecturaClima & { sala_id: number })[]
  const conPendiente = new Set(((pendientesR.data ?? []) as { dispositivo_id: number }[]).map((p) => p.dispositivo_id))
  const yaInformadas = new Set(((informadasR.data ?? []) as { alerta_id: number | null }[]).map((p) => p.alerta_id))

  let quienes: string[] | null = null
  let salieron = 0

  for (const alerta of alertas) {
    const sala = salas.find((s) => s.id === alerta.sala_id)
    const aire = equipos.find((d) => d.sala_id === alerta.sala_id)
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

    const motivo = `${sala.nombre}: ${textoProblema({ variable: "temperatura", lado: alerta.lado, valor: temperatura, limite: alerta.limite })}, aire ${textoEstadoAire(estado)}`
    const { data: fila, error: errInsert } = await supabase
      .from("propuestas_nubi")
      .insert({
        sala_id: sala.id,
        dispositivo_id: aire.id,
        alerta_id: alerta.id,
        estado: propuesta.tipo === "orden" ? "pendiente" : "informada",
        motivo,
        resumen: propuesta.resumen,
        payload: propuesta.tipo === "orden" ? propuesta.payload : null,
        creada_en: ahoraIso,
        vence_en: propuesta.tipo === "orden" ? new Date(ahora.getTime() + MINUTOS_VIGENCIA * 60000).toISOString() : null,
      })
      .select("id")
      .single()
    if (errInsert || !fila) {
      console.error("[nubi] No se pudo guardar la propuesta:", errInsert)
      continue
    }

    quienes ??= await aprobadores(supabase)
    try {
      await sendPushToUsers(
        quienes,
        propuesta.tipo === "orden"
          ? {
              title: `🛰 Nubi: ${propuesta.resumen}?`,
              body: `${motivo}. Vence en ${MINUTOS_VIGENCIA} minutos.`,
              url: "/control-manual",
              tag: `nubi-${fila.id}`,
              acciones: [
                { action: "mandar", title: "Mandar" },
                { action: "no", title: "No" },
              ],
              datos: { propuestaId: fila.id },
            }
          : { title: `🛰 Nubi: ${sala.nombre}`, body: propuesta.resumen, url: "/control-manual", tag: `nubi-${fila.id}` },
      )
    } catch (err) {
      // La propuesta igual queda en Control manual para aprobarla desde ahí.
      console.error("[nubi] No se pudo mandar el push:", err)
    }
    salieron += 1
  }
  return salieron
}
