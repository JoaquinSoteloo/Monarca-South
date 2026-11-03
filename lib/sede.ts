/**
 * Pantalla Sede. Desde el rediseño del 03/11/2026 muestra cada sala con su
 * ciclo y la última lectura de Pulse, y el plano de Facundo en 2D. El
 * simulador 3D (public/sede/index.html) sigue en /sede/oficina: corre en un
 * iframe y le pide los datos a la página con postMessage; acá viven las
 * conversiones puras entre los dos lados.
 */
import type { EtapaRiego } from "@/lib/riego"
import { diasEntreFechas, fechasCiclo, momentoCiclo, type CicloSala } from "@/lib/ciclo"

/** Personajes del simulador y cómo pueden figurar en la pantalla Usuarios. */
const ALIAS: Record<string, string[]> = {
  Lucho: ["lucho", "luciano"],
  Vilela: ["vilela", "vile"],
  Demian: ["demian", "demi"],
  Pato: ["pato", "patricio"],
  Facundo: ["facundo", "facu"],
}

/** Nombre del personaje del simulador para un usuario del sistema; si no hay, su nombre tal cual. */
export function personajeDe(nombre: string): string {
  const palabras = nombre
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[\s,.]+/)
    .filter(Boolean)
  for (const [personaje, alias] of Object.entries(ALIAS)) {
    if (palabras.some((p) => alias.includes(p))) return personaje
  }
  return nombre.trim()
}

/** Etapa del formulario del simulador → etapa de registros_riego. */
export function etapaDesdeSimulador(etapa: string): EtapaRiego {
  if (etapa === "Sala de vege") return "esqueje"
  if (etapa === "Vege en sala de flora") return "vegetativo"
  if (etapa === "Lavado") return "lavado"
  return "floracion"
}

/** Canal del simulador para un mensaje: «todos» o «dm:A|B» (nombres ordenados). */
export function canalDe(autor: string, para: string | null): string {
  return para ? "dm:" + [autor, para].sort().join("|") : "todos"
}

/** Destinatario de un canal privado visto por `yo`, o null si es «todos». */
export function destinatarioDe(canal: string, yo: string): string | null {
  if (!canal.startsWith("dm:")) return null
  return canal.slice(3).split("|").find((n) => n !== yo) ?? null
}

/** Número del formulario ("1,6", "6.0", "") → número o null. */
export function numeroOnull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."))
  return Number.isFinite(n) ? n : null
}

// --- Rediseño: salas y plano -------------------------------------------------

/** Un ambiente del plano de la sede, en metros (dibujado por Facundo el 31/10/2026). */
export interface Ambiente {
  id: string
  nombre: string
  x0: number
  x1: number
  z0: number
  z1: number
  /** Nombre de la sala de cultivo (salas_cultivo) que ocupa este ambiente. */
  sala?: string
}

/**
 * Las medidas de public/sede/index.html sin atención ni el pasillo largo de la
 * entrada. La Sala 4 está en Itaquí (casa de Lucho) y va fuera del plano.
 */
export const PLANO_SEDE: Ambiente[] = [
  { id: "s5", nombre: "Sala 5", x0: -2.6, x1: 2.4, z0: -10, z1: -6, sala: "Sala 5" },
  { id: "bano", nombre: "Baño", x0: 2.4, x1: 5, z0: -9, z1: -6 },
  { id: "ofi", nombre: "Patio de trabajo", x0: -3, x1: 0, z0: -6, z1: -4 },
  { id: "p5", nombre: "Pasillo", x0: 0, x1: 1.1, z0: -6, z1: -4 },
  { id: "agua", nombre: "Sala de agua", x0: 1.1, x1: 5, z0: -6, z1: -4 },
  { id: "s1", nombre: "Sala 1", x0: 0, x1: 5, z0: -4, z1: 0, sala: "Sala 1" },
  { id: "s2", nombre: "Sala 2", x0: -3, x1: 0, z0: -3, z1: 0, sala: "Sala 2" },
  { id: "s3", nombre: "Sala 3", x0: -3.4, x1: 0.6, z0: 0, z1: 3, sala: "Sala 3" },
  { id: "patio", nombre: "Patio de entrada", x0: 0.6, x1: 5, z0: 0, z1: 3.2 },
]

/** Bordes del plano en metros: de izquierda a derecha (x) y de arriba a abajo (z). */
export const LIMITES_PLANO = { x0: -3.4, x1: 5, z0: -10, z1: 3.2 }

/** Posición de un ambiente en el plano, en % del ancho y del alto. */
export function cajaEnPlano(a: Pick<Ambiente, "x0" | "x1" | "z0" | "z1">) {
  const ancho = LIMITES_PLANO.x1 - LIMITES_PLANO.x0
  const alto = LIMITES_PLANO.z1 - LIMITES_PLANO.z0
  return {
    left: ((a.x0 - LIMITES_PLANO.x0) / ancho) * 100,
    top: ((a.z0 - LIMITES_PLANO.z0) / alto) * 100,
    width: ((a.x1 - a.x0) / ancho) * 100,
    height: ((a.z1 - a.z0) / alto) * 100,
  }
}

export interface EstadoSala {
  /** "Vege · día 5 de 48", "Flora · día 11 de 52", "Sin ciclo en curso"… */
  etiqueta: string
  tono: "vege" | "flora" | "neutro"
  /** Lo que viene: "Pasa a flora el 17/12", "Corte el 15/12"… */
  proximo: string | null
  /** Si lo que viene es en los próximos 7 días. */
  pronto: boolean
}

const diaMes = (f: string) => `${Number(f.slice(8, 10))}/${Number(f.slice(5, 7))}`

/** "hoy", "mañana", "este jueves 5/11" (dentro de la semana) o "el 17/12". */
export function cuandoEs(fecha: string, hoy: string): string {
  const dias = diasEntreFechas(hoy, fecha)
  if (dias === 0) return "hoy"
  if (dias === 1) return "mañana"
  if (dias > 1 && dias < 7) {
    const [y, m, d] = fecha.split("-").map(Number)
    const semana = new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("es-AR", { weekday: "long", timeZone: "UTC" })
    return `este ${semana} ${diaMes(fecha)}`
  }
  return `el ${diaMes(fecha)}`
}

/** En qué está una sala hoy y qué le toca después, con las mismas cuentas que Ciclos. */
export function estadoSala(ciclo: CicloSala | null, hoy: string): EstadoSala {
  if (!ciclo) return { etiqueta: "Sin ciclo en curso", tono: "neutro", proximo: null, pronto: false }
  const m = momentoCiclo(ciclo, hoy)
  const f = fechasCiclo(ciclo)
  const con = (etiqueta: string, tono: EstadoSala["tono"], que: string | null, fecha: string | null): EstadoSala => ({
    etiqueta,
    tono,
    proximo: que && fecha ? `${que} ${cuandoEs(fecha, hoy)}` : null,
    pronto: !!fecha && diasEntreFechas(hoy, fecha) < 7,
  })
  switch (m.fase) {
    case "planificado":
      return con("Planificado", "neutro", "Entra", f.inicio)
    case "vegetativo":
      return con(`Vege · día ${m.diaFase} de ${ciclo.dias_vege}`, "vege", "Pasa a flora", f.flip)
    case "floracion":
      return con(`Flora · día ${m.diaFase} de ${ciclo.dias_flora}`, "flora", "Corte", f.cosecha)
    case "lavado":
      return con(`Lavado · día ${m.diaFase} de ${ciclo.dias_flora}`, "flora", "Corte", f.cosecha)
    case "secado":
      return con(`Secado · día ${m.diaFase}`, "neutro", "Termina el secado", f.finSecado)
    case "limpieza":
      return con("Limpieza", "neutro", "Queda libre", f.libre)
    default:
      return con("Sala libre", "neutro", null, null)
  }
}

export interface LecturaSala {
  sala_id: number
  temperatura_c: number | null
  humedad_rh: number | null
  vpd: number | null
  luz_lux?: number | null
  leido_en: string
}

export interface ResumenDia {
  min: number
  max: number
  prom: number
}

/** Mínimo, máximo y promedio de una serie (null si no hay datos). */
export function resumenDia(valores: (number | null | undefined)[]): ResumenDia | null {
  const xs = valores.filter((v): v is number => typeof v === "number" && Number.isFinite(v))
  if (xs.length === 0) return null
  return { min: Math.min(...xs), max: Math.max(...xs), prom: xs.reduce((a, b) => a + b, 0) / xs.length }
}

/** La lectura más nueva de cada sala. */
export function ultimaPorSala(lecturas: LecturaSala[]): Map<number, LecturaSala> {
  const m = new Map<number, LecturaSala>()
  for (const l of lecturas) {
    const actual = m.get(l.sala_id)
    if (!actual || l.leido_en > actual.leido_en) m.set(l.sala_id, l)
  }
  return m
}

/** "22,3 °C", "63 %", "1,01": como se escriben en Argentina; "—" si no hay dato. */
export function numeroAR(n: number | null, decimales: number): string {
  if (n === null || !Number.isFinite(n)) return "—"
  return n.toLocaleString("es-AR", { minimumFractionDigits: decimales, maximumFractionDigits: decimales })
}
