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

/** pH de entrada esperado: 5,8 en esqueje/vege, 5,8–6,0 en flora 1, 6,0 después. ±0,2 de tolerancia. */
export function rangoPhEntrada(etapa: EtapaRiego, semana: number | null): Rango {
  const tol = 0.2
  if (etapa === "esqueje" || etapa === "vegetativo") return { min: 5.8 - tol, max: 5.8 + tol }
  if (etapa === "floracion" && semana === 1) return { min: 5.8 - tol, max: 6.0 + tol }
  return { min: 6.0 - tol, max: 6.0 + tol }
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

  if (!esLavado && l.etapa !== "esqueje" && (l.ec_runoff === null || l.drenaje_pct === null)) {
    alertas.push({ nivel: "info", mensaje: "Falta el runoff de las macetas testigo." })
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
