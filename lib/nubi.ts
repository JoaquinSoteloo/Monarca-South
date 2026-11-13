// Nubi propone (pedido de Joaquín, 13/11/2026): cuando una sala está fuera del
// rango de temperatura, mira cómo está el aire y propone cuánto ajustarlo. Una
// persona aprueba antes de que se mande (lib/nubi-aviso.ts y
// app/api/nubi/propuestas/[id]). Cálculo puro, sin base ni push.
//
// El aire se maneja solo desde la app (decisión de Joaquín): la última orden
// cumplida es su estado real.
import type { DispositivoControlable } from "@/lib/types"
import type { RangoClima } from "@/lib/clima-alertas"

export const SETPOINT_MIN = 16
export const SETPOINT_MAX = 30
/** Después de una orden, cuánto esperar antes de proponer otra. */
export const MINUTOS_ESPERA = 10
/** Si en ese tiempo la temperatura se movió al menos esto hacia el rango, se sigue esperando. */
export const MEJORA_MINIMA_C = 0.3
/** Una propuesta sin respuesta vence: la situación ya puede ser otra. */
export const MINUTOS_VIGENCIA = 30

export type EstadoAire =
  | { tipo: "apagado" }
  | { tipo: "frio"; setpoint: number }
  /** Prendido, pero sin modo frío con temperatura (encender a secas, calor, ventilador). */
  | { tipo: "prendido_otro" }
  /** Hay una orden en camino: no proponer encima. */
  | { tipo: "en_curso" }
  /** Sin órdenes o la última falló: no se sabe cómo está. */
  | { tipo: "desconocido" }

export function estadoAire(d: Pick<DispositivoControlable, "ultimo_comando_estado" | "ultimo_comando_payload">): EstadoAire {
  if (d.ultimo_comando_estado === "pendiente" || d.ultimo_comando_estado === "en_proceso") return { tipo: "en_curso" }
  if (d.ultimo_comando_estado !== "ejecutado" || !d.ultimo_comando_payload) return { tipo: "desconocido" }
  const p = d.ultimo_comando_payload
  if (p.accion === "apagar") return { tipo: "apagado" }
  if (p.accion !== "encender") return { tipo: "desconocido" }
  const sp = Number(p.setpoint)
  if (p.modo === "frio" && Number.isFinite(sp)) return { tipo: "frio", setpoint: Math.round(sp) }
  return { tipo: "prendido_otro" }
}

export function textoEstadoAire(e: EstadoAire): string {
  switch (e.tipo) {
    case "apagado": return "apagado"
    case "frio": return `en frío ${e.setpoint} °C`
    case "prendido_otro": return "prendido"
    case "en_curso": return "con una orden en camino"
    default: return "en un estado desconocido"
  }
}

export type Propuesta =
  | { tipo: "orden"; payload: Record<string, unknown>; resumen: string }
  /** No hay nada para proponer, pero conviene avisar (el aire no alcanza). */
  | { tipo: "aviso"; resumen: string }

const frio = (setpoint: number) => ({ accion: "encender", modo: "frio", setpoint, fan: "auto" })
const fmt = (t: number) => `${t.toFixed(1).replace(".", ",")} °C`

/**
 * Qué propone Nubi para el aire, según cuánto se pasó la sala y cómo está el aire.
 * - Calor, aire apagado: encender en frío al medio del rango menos lo que se pasó.
 * - Calor, aire en frío a X: bajar a X menos lo que se pasó (al menos 1 grado).
 * - Calor, ya en 16: avisar que no alcanza.
 * - Frío, aire en frío a X: subir a X más lo que falta; si llega al máximo del rango, apagar.
 * - Frío, aire apagado: nada (no hay calor configurado).
 */
export function proponer(rango: RangoClima, temperatura: number, aire: EstadoAire): Propuesta | null {
  const [min, max] = rango.temperatura
  if (aire.tipo === "en_curso" || aire.tipo === "desconocido") return null

  if (temperatura > max) {
    const paso = Math.max(1, Math.ceil(temperatura - max - 1e-9))
    if (aire.tipo === "frio") {
      if (aire.setpoint <= SETPOINT_MIN) {
        return { tipo: "aviso", resumen: `el aire ya está en frío ${SETPOINT_MIN} °C y la sala sigue a ${fmt(temperatura)}: no alcanza, revisar` }
      }
      const nuevo = Math.max(SETPOINT_MIN, aire.setpoint - paso)
      return { tipo: "orden", payload: frio(nuevo), resumen: `bajar el aire de ${aire.setpoint} a ${nuevo} °C` }
    }
    const nuevo = Math.min(SETPOINT_MAX, Math.max(SETPOINT_MIN, Math.round((min + max) / 2) - paso))
    return { tipo: "orden", payload: frio(nuevo), resumen: `encender el aire en frío ${nuevo} °C` }
  }

  if (temperatura < min) {
    if (aire.tipo !== "frio") return null
    const paso = Math.max(1, Math.ceil(min - temperatura - 1e-9))
    const nuevo = aire.setpoint + paso
    if (nuevo >= max) return { tipo: "orden", payload: { accion: "apagar" }, resumen: "apagar el aire" }
    return { tipo: "orden", payload: frio(nuevo), resumen: `subir el aire de ${aire.setpoint} a ${nuevo} °C` }
  }
  return null
}

/**
 * true si hay que esperar antes de proponer: la última orden es de hace menos de
 * 10 minutos, o es de la última hora y desde entonces la temperatura viene
 * yendo hacia el rango (al menos 0,3 °C).
 */
export function hayQueEsperar(args: {
  ahora: Date
  ultimaOrdenEn: string | null
  temperaturaAlMandar: number | null
  temperaturaAhora: number
  lado: "alto" | "bajo"
}): boolean {
  if (!args.ultimaOrdenEn) return false
  const minutos = (args.ahora.getTime() - new Date(args.ultimaOrdenEn).getTime()) / 60000
  if (minutos < MINUTOS_ESPERA) return true
  if (minutos > 60 || args.temperaturaAlMandar === null) return false
  const mejora = args.lado === "alto" ? args.temperaturaAlMandar - args.temperaturaAhora : args.temperaturaAhora - args.temperaturaAlMandar
  return mejora >= MEJORA_MINIMA_C - 1e-9
}

/** La lectura más cercana anterior a un momento (para saber cómo estaba la sala al mandar la orden). */
export function temperaturaEn(lecturas: { leido_en: string; temperatura_c: number | null }[], momento: string): number | null {
  let mejor: { leido_en: string; temperatura_c: number | null } | null = null
  for (const l of lecturas) {
    if (l.leido_en <= momento && l.temperatura_c !== null && (!mejor || l.leido_en > mejor.leido_en)) mejor = l
  }
  return mejor ? Math.round(Number(mejor.temperatura_c) * 10) / 10 : null
}
