/**
 * Pantalla Sede: el simulador 3D (public/sede/index.html) dentro del sistema.
 * El simulador corre en un iframe y le pide los datos a la página con
 * postMessage; acá viven las conversiones puras entre los dos lados.
 */
import type { EtapaRiego } from "@/lib/riego"

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
