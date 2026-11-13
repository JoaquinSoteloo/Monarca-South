// Nubi de verdad (pedido de Joaquín, 13/11/2026): en cada corrida del motor
// revisa el clima de cada sala contra el rango de su etapa y avisa al celular
// cuando una sala lleva ~15 minutos fuera de rango. Un aviso por problema
// (alertas_clima, script 095) y otro cuando vuelve al rango, como las órdenes
// sin cumplir (lib/automations/aviso-fallas.ts).
//
// Corre con el cliente service_role dentro del lock del motor
// (app/api/automations/evaluate/route.ts). No importar desde código que
// llegue al navegador: web-push no se puede empaquetar para él.
import type { SupabaseClient } from "@supabase/supabase-js"
import { sendPushNotification, type PushPayload } from "@/lib/push/send"
import { cicloActual, type CicloSala } from "@/lib/ciclo"
import {
  problemasDeSala,
  rangoClima,
  textoProblema,
  textoResuelto,
  ultimoValor,
  volvioAlRango,
  type LecturaClima,
  type ProblemaClima,
  type VariableClima,
} from "@/lib/clima-alertas"

export interface AlertaClima {
  id: number
  sala_id: number
  variable: VariableClima
  lado: "alto" | "bajo"
  valor: number
  limite: number
  mensaje: string
  desde: string
  notificada_en: string | null
  resuelta_en: string | null
}

const fechaAR = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" })

export function avisoDeClima(sala: string, etapa: string, p: ProblemaClima, alertaId: number | string): PushPayload {
  return {
    title: `⚠ ${sala}: ${textoProblema(p)}`,
    body: `Hace 15 minutos que está fuera del rango de ${etapa}. Revisar aire, extracción o deshumidificador.`,
    url: "/sede",
    tag: `clima-${alertaId}`,
  }
}

async function avisar(payload: PushPayload): Promise<boolean> {
  try {
    const r = await sendPushNotification(payload)
    return !(r.sent === 0 && r.failed > 0)
  } catch (err) {
    console.error("[clima-alertas] No se pudo avisar:", err)
    return false
  }
}

/** Revisa todas las salas. Devuelve cuántos avisos salieron (nuevos + resueltos). */
export async function avisarClima(supabase: SupabaseClient, ahora: Date = new Date()): Promise<number> {
  const hoy = fechaAR(ahora)
  const desde = new Date(ahora.getTime() - 25 * 60000).toISOString()
  const [salasR, ciclosR, lecturasR, abiertasR] = await Promise.all([
    supabase.from("salas_cultivo").select("id, nombre").eq("activo", true),
    supabase.from("ciclos_sala").select("*").eq("estado", "abierto"),
    supabase
      .from("lecturas_ambientales")
      .select("sala_id, temperatura_c, humedad_rh, leido_en")
      .gte("leido_en", desde)
      .not("sala_id", "is", null),
    supabase.from("alertas_clima").select("*").is("resuelta_en", null),
  ])
  for (const r of [salasR, ciclosR, lecturasR, abiertasR]) if (r.error) throw new Error(r.error.message)

  const salas = (salasR.data ?? []) as { id: number; nombre: string }[]
  const ciclos = (ciclosR.data ?? []) as CicloSala[]
  const lecturas = (lecturasR.data ?? []) as (LecturaClima & { sala_id: number })[]
  const abiertas = (abiertasR.data ?? []) as AlertaClima[]
  const ahoraIso = ahora.toISOString()
  let avisos = 0

  for (const sala of salas) {
    const rango = rangoClima(sala.nombre, cicloActual(ciclos, sala.id, hoy), hoy)
    const suyas = lecturas.filter((l) => l.sala_id === sala.id)
    const problemas = rango ? problemasDeSala(suyas, rango, ahora) : []

    for (const variable of ["temperatura", "humedad"] as const) {
      const abierta = abiertas.find((a) => a.sala_id === sala.id && a.variable === variable)
      const problema = problemas.find((p) => p.variable === variable)

      // Sigue (o empezó) fuera de rango.
      if (problema && rango) {
        if (abierta && abierta.lado === problema.lado) {
          const pendiente = !abierta.notificada_en
          const avisado = pendiente ? await avisar(avisoDeClima(sala.nombre, rango.etapa, problema, abierta.id)) : false
          await supabase
            .from("alertas_clima")
            .update({
              valor: problema.valor,
              mensaje: textoProblema(problema),
              actualizada_en: ahoraIso,
              ...(avisado ? { notificada_en: ahoraIso } : {}),
            })
            .eq("id", abierta.id)
          if (avisado) avisos += 1
          continue
        }
        if (abierta) {
          // Pasó de alto a bajo (o al revés): se cierra la vieja sin aviso y se abre otra.
          await supabase.from("alertas_clima").update({ resuelta_en: ahoraIso, actualizada_en: ahoraIso }).eq("id", abierta.id)
        }
        const { data: nueva, error } = await supabase
          .from("alertas_clima")
          .insert({
            sala_id: sala.id,
            variable,
            lado: problema.lado,
            valor: problema.valor,
            limite: problema.limite,
            mensaje: textoProblema(problema),
            desde: ahoraIso,
            actualizada_en: ahoraIso,
          })
          .select("id")
          .single()
        if (error || !nueva) {
          console.error("[clima-alertas] No se pudo guardar la alerta:", error)
          continue
        }
        // Sin marcar si falla el push: la próxima corrida lo vuelve a intentar.
        if (await avisar(avisoDeClima(sala.nombre, rango.etapa, problema, nueva.id))) {
          await supabase.from("alertas_clima").update({ notificada_en: ahoraIso }).eq("id", nueva.id)
          avisos += 1
        }
        continue
      }

      if (!abierta) continue

      // La sala ya no tiene rango (terminó el ciclo): se cierra sin aviso.
      if (!rango) {
        await supabase.from("alertas_clima").update({ resuelta_en: ahoraIso, actualizada_en: ahoraIso }).eq("id", abierta.id)
        continue
      }

      // Volvió al rango (2 lecturas seguidas adentro). Sin lecturas, queda abierta.
      if (volvioAlRango(suyas, rango, variable, ahora)) {
        await supabase.from("alertas_clima").update({ resuelta_en: ahoraIso, actualizada_en: ahoraIso }).eq("id", abierta.id)
        if (abierta.notificada_en) {
          const ok = await avisar({
            title: `✓ ${sala.nombre}: ${textoResuelto(variable, ultimoValor(suyas, variable))}`,
            body: "Nubi lo confirma con el Pulse.",
            url: "/sede",
            tag: `clima-${abierta.id}`,
          })
          if (ok) avisos += 1
        }
      }
    }
  }
  return avisos
}
