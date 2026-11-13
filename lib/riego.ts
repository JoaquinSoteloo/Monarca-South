/**
 * Reglas del registro de riego (prueba piloto del módulo de cultivo).
 * Fuente: "Manual de cultivo 3 — Riego" de Monarca South (EC/pH por semana,
 * drenaje buscado y cómo leer el runoff). Lucho ajusta los valores reales;
 * esto solo marca lo que se sale de lo esperado para que alguien lo mire.
 */

export type EtapaRiego = "esqueje" | "vegetativo" | "floracion" | "lavado"

export interface LecturaRiego {
  etapa: EtapaRiego
  semana: number | null
  ec_entrada: number | null
  ph_entrada: number | null
  ec_runoff: number | null
  ph_runoff: number | null
  drenaje_pct: number | null
  /**
   * Pincho de EC (Bluelab) en las 2 testigo, antes de regar (desde el
   * 16/11/2026 reemplaza al runoff de cada riego; el runoff queda los jueves,
   * solo para el pH). Opcional: los riegos viejos no lo tienen.
   */
  pincho?: PinchoRiego | null
}

export interface PinchoRiego {
  t1_humedad: number | null
  t1_ec: number | null
  t2_humedad: number | null
  t2_ec: number | null
  humedad_despues: number | null
}

/** Promedio de los valores cargados (null si no hay ninguno). */
export function promedio(...vs: (number | null | undefined)[]): number | null {
  const ok = vs.filter((v): v is number => typeof v === "number" && Number.isFinite(v))
  return ok.length ? redondear(ok.reduce((a, b) => a + b, 0) / ok.length) : null
}

export type NivelAlerta = "atencion" | "info"

export interface AlertaRiego {
  nivel: NivelAlerta
  mensaje: string
}

interface Rango {
  min: number
  max: number
}

export const ETAPAS: { value: EtapaRiego; label: string; semanas: number }[] = [
  { value: "esqueje", label: "Esqueje", semanas: 0 },
  { value: "vegetativo", label: "Vegetativo", semanas: 3 },
  { value: "floracion", label: "Floración", semanas: 8 },
  { value: "lavado", label: "Lavado (solo agua)", semanas: 0 },
]

/** EC de entrada esperada (mS/cm) según la tabla del Manual 3, con ±0,1 de tolerancia. */
export function rangoEcEntrada(etapa: EtapaRiego, semana: number | null): Rango | null {
  const tol = 0.1
  const r = (min: number, max = min): Rango => ({ min: redondear(min - tol), max: redondear(max + tol) })
  switch (etapa) {
    case "esqueje":
      return r(0.8, 1.0)
    case "vegetativo":
      if (semana === 1) return r(1.0)
      if (semana === 2) return r(1.2)
      if (semana === 3) return r(1.4)
      return r(1.0, 1.4)
    case "floracion":
      if (semana === 1) return r(1.6)
      if (semana === 2) return r(1.7)
      if (semana !== null && semana >= 3 && semana <= 6) return r(1.8, 1.9)
      if (semana === 7) return r(1.6, 1.7)
      if (semana === 8) return { min: 0, max: 0.2 }
      return r(1.6, 1.9)
    case "lavado":
      return { min: 0, max: 0.2 }
  }
}

/** pH máximo de entrada en todas las etapas (decisión de Facundo, 02/11/2026). */
export const PH_ENTRADA_MAX = 6.0

/** pH de entrada objetivo (sin tolerancia): 5,8 en esqueje/vege, 5,8–6,0 en flora 1, 6,0 después. */
export function phObjetivo(etapa: EtapaRiego, semana: number | null): Rango {
  if (etapa === "esqueje" || etapa === "vegetativo") return { min: 5.8, max: 5.8 }
  if (etapa === "floracion" && semana === 1) return { min: 5.8, max: 6.0 }
  return { min: 6.0, max: 6.0 }
}

/** Rango aceptado: 0,2 de tolerancia hacia abajo y hacia arriba, pero nunca más de 6,0. */
export function rangoPhEntrada(etapa: EtapaRiego, semana: number | null): Rango {
  const tol = 0.2
  const o = phObjetivo(etapa, semana)
  return { min: redondear(o.min - tol), max: Math.min(redondear(o.max + tol), PH_ENTRADA_MAX) }
}

/** Drenaje buscado (%) según la tabla "Cuánto regar". */
export function rangoDrenaje(etapa: EtapaRiego, semana: number | null): Rango | null {
  if (etapa === "esqueje") return null
  if (etapa === "lavado" || (etapa === "floracion" && semana === 8)) return { min: 20, max: 30 }
  if (etapa === "vegetativo" && semana === 1) return { min: 5, max: 15 }
  if (etapa === "vegetativo") return { min: 10, max: 20 }
  return { min: 15, max: 20 }
}

function redondear(n: number): number {
  return Math.round(n * 100) / 100
}

function fmt(n: number, dec = 1): string {
  return n.toFixed(dec).replace(".", ",")
}

/** Devuelve las alertas de un registro. Lista vacía = todo en orden. */
export function evaluarRiego(l: LecturaRiego): AlertaRiego[] {
  const alertas: AlertaRiego[] = []
  const esLavado = l.etapa === "lavado" || (l.etapa === "floracion" && l.semana === 8)

  const rEc = rangoEcEntrada(l.etapa, l.semana)
  if (l.ec_entrada !== null && rEc && (l.ec_entrada < rEc.min || l.ec_entrada > rEc.max)) {
    alertas.push({
      nivel: "atencion",
      mensaje: `EC de entrada ${fmt(l.ec_entrada, 2)} fuera de lo esperado (${fmt(rEc.min, 2)}–${fmt(rEc.max, 2)}).`,
    })
  }

  const rPh = rangoPhEntrada(l.etapa, l.semana)
  if (l.ph_entrada !== null && (l.ph_entrada < rPh.min - 1e-9 || l.ph_entrada > rPh.max + 1e-9)) {
    alertas.push({
      nivel: "atencion",
      mensaje: `pH de entrada ${fmt(l.ph_entrada)} fuera de rango (${fmt(rPh.min)}–${fmt(rPh.max)}).`,
    })
  }

  if (l.ec_entrada !== null && l.ec_runoff !== null && !esLavado) {
    const dif = redondear(l.ec_runoff - l.ec_entrada)
    if (dif > 0.5) {
      alertas.push({
        nivel: "atencion",
        mensaje: `Runoff ${fmt(dif, 2)} por encima de la entrada: se acumulan sales. Bajar la EC 0,1–0,2 o aumentar el drenaje.`,
      })
    } else if (dif < -0.3) {
      alertas.push({
        nivel: "info",
        mensaje: "Runoff por debajo de la entrada: la planta come más de lo que recibe. Subir la EC de a 0,1–0,2.",
      })
    }
  }

  if (l.ph_runoff !== null) {
    if (l.ph_runoff < 5.5) {
      alertas.push({
        nivel: "atencion",
        mensaje: `pH del runoff ${fmt(l.ph_runoff)}: acidificación de la raíz. Avisar a Lucho y revisar sustrato y pH de entrada.`,
      })
    } else if (l.ph_runoff > 6.5) {
      alertas.push({
        nivel: "atencion",
        mensaje: `pH del runoff ${fmt(l.ph_runoff)}: alcalinización. Revisar el pH de entrada.`,
      })
    }
  }

  const rDren = rangoDrenaje(l.etapa, l.semana)
  if (l.drenaje_pct !== null && rDren) {
    if (l.drenaje_pct < 10 && !(l.etapa === "vegetativo" && l.semana === 1)) {
      alertas.push({ nivel: "atencion", mensaje: `Drenaje ${l.drenaje_pct} %: las sales no se lavan. Aumentar el volumen.` })
    } else if (l.drenaje_pct > 30) {
      alertas.push({ nivel: "info", mensaje: `Drenaje ${l.drenaje_pct} %: se desperdicia solución. Bajar el volumen.` })
    }
  }

  // Pincho en las testigo (Lucho, 10/11/2026): la EC del sustrato más de 1
  // punto arriba de la mezcla es acumulación de sales; 0,5 abajo, falta
  // alimento. Las 2 testigo con humedad muy distinta: una se riega distinto.
  const p = l.pincho
  const ecPincho = p ? promedio(p.t1_ec, p.t2_ec) : null
  if (!esLavado && l.etapa !== "esqueje" && ecPincho === null) {
    alertas.push({ nivel: "info", mensaje: "Faltan las mediciones del pincho en las 2 testigo." })
  }
  if (ecPincho !== null && l.ec_entrada !== null && !esLavado) {
    const dif = redondear(ecPincho - l.ec_entrada)
    if (dif > 1) {
      alertas.push({
        nivel: "atencion",
        mensaje: `EC del pincho ${fmt(ecPincho, 2)}, más de 1 punto arriba de la mezcla: posible acumulación de sales. Regar con más drenaje.`,
      })
    } else if (dif < -0.5) {
      alertas.push({
        nivel: "info",
        mensaje: `EC del pincho ${fmt(ecPincho, 2)}, bastante por debajo de la mezcla: puede estar faltando alimento.`,
      })
    }
  }
  if (p && p.t1_humedad !== null && p.t2_humedad !== null && Math.abs(p.t1_humedad - p.t2_humedad) > 10) {
    alertas.push({
      nivel: "info",
      mensaje: `Las 2 testigo tienen humedad muy distinta (${fmt(p.t1_humedad)} % y ${fmt(p.t2_humedad)} %).`,
    })
  }

  return alertas
}

/** Convierte "1,6" o "1.6" en número; vacío → null. */
export function parseDecimal(valor: string): number | null {
  const limpio = valor.trim().replace(",", ".")
  if (limpio === "") return null
  const n = Number(limpio)
  return Number.isFinite(n) ? n : null
}
