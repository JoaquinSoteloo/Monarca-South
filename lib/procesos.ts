/**
 * Procedimientos paso a paso (scripts 077 y 078): riego, cosecha, esquejes,
 * sanidad. Cada paso tiene un formulario; al completarlo se activa el paso
 * siguiente y le llega el aviso a quien le toca.
 * Lógica pura, sin Supabase, para poder testearla.
 */

import { cicloActual, etapaRiegoDe, momentoCiclo, type CicloSala } from "@/lib/ciclo"
import { parseDecimal } from "@/lib/riego"

export type TipoCampo = "numero" | "texto" | "texto_largo" | "si_no" | "opciones" | "testigos"

export interface Campo {
  clave: string
  etiqueta: string
  tipo: TipoCampo
  requerido?: boolean
  unidad?: string
  min?: number
  max?: number
  opciones?: string[]
  /** Sugerir el último valor cargado en este mismo paso (ej.: qué le puso a la mezcla). */
  recordar?: boolean
  /** Para `testigos`: cuántas macetas (por defecto 2). */
  cantidad?: number
  ayuda?: string
}

export interface Testigo {
  maceta: string
  ec: string
  ph: string
  drenaje: string
}

/** Valores tal como los maneja el formulario (texto, para no pelear con comas). */
export type ValorCampo = string | boolean | Testigo[]
export type Valores = Record<string, ValorCampo>

export interface ProcesoPlantilla {
  clave: string
  nombre: string
  descripcion: string | null
  usa_salas: boolean
  orden: number
  activo: boolean
}

export type EstadoPaso = "espera" | "pendiente" | "hecho" | "problema"

export interface ProcesoPaso {
  id: number
  proceso_id: number
  clave: string
  orden: number
  titulo: string
  detalle: string | null
  sala_id: number | null
  responsable_id: string | null
  campos: Campo[]
  valores: Record<string, unknown>
  estado: EstadoPaso
  nota: string | null
  hecho_por: string | null
  hecho_at: string | null
  tarea_id: number | null
}

export interface Proceso {
  id: number
  plantilla_clave: string
  titulo: string
  salas: number[]
  fecha: string
  estado: "en_curso" | "terminado" | "cancelado"
  nota: string | null
  iniciado_por: string | null
  created_at: string
  terminado_at: string | null
}

export const ESTADO_PASO_LABEL: Record<EstadoPaso, string> = {
  espera: "En espera",
  pendiente: "Le toca",
  hecho: "Hecho",
  problema: "Problema",
}

/** Valores iniciales del formulario: lo ya cargado, o lo último que se usó si el campo lo pide. */
export function valoresIniciales(
  campos: Campo[],
  previos: Record<string, unknown>,
  ultimos: Record<string, unknown> | null,
  testigosSugeridos: string[] = [],
): Valores {
  const out: Valores = {}
  for (const c of campos) {
    const ya = previos[c.clave]
    const ult = c.recordar && ultimos ? ultimos[c.clave] : undefined
    const v = ya !== undefined && ya !== null ? ya : ult
    if (c.tipo === "testigos") {
      const n = c.cantidad ?? 2
      const lista = Array.isArray(v) ? (v as Partial<Testigo>[]) : []
      out[c.clave] = Array.from({ length: Math.max(n, lista.length) }, (_, i) => ({
        maceta: String(lista[i]?.maceta ?? testigosSugeridos[i] ?? ""),
        ec: lista[i]?.ec != null ? String(lista[i]?.ec).replace(".", ",") : "",
        ph: lista[i]?.ph != null ? String(lista[i]?.ph).replace(".", ",") : "",
        drenaje: lista[i]?.drenaje != null ? String(lista[i]?.drenaje) : "",
      }))
    } else if (c.tipo === "si_no") {
      out[c.clave] = v === true
    } else if (c.tipo === "numero") {
      out[c.clave] = v === undefined || v === null || v === "" ? "" : String(v).replace(".", ",")
    } else {
      out[c.clave] = v === undefined || v === null ? "" : String(v)
    }
  }
  return out
}

function numeroValido(c: Campo, texto: string, etiqueta = c.etiqueta): string | null {
  const n = parseDecimal(texto)
  if (n === null) return `${etiqueta}: no es un número`
  if (c.min !== undefined && n < c.min) return `${etiqueta}: mínimo ${c.min}`
  if (c.max !== undefined && n > c.max) return `${etiqueta}: máximo ${c.max}`
  return null
}

/** Revisa el formulario. Devuelve la lista de errores (vacía si está todo bien). */
export function validar(campos: Campo[], v: Valores): string[] {
  const errores: string[] = []
  for (const c of campos) {
    const x = v[c.clave]
    if (c.tipo === "testigos") {
      const lista = (Array.isArray(x) ? x : []) as Testigo[]
      const cargadas = lista.filter((t) => t.maceta.trim() || t.ec.trim() || t.ph.trim() || t.drenaje.trim())
      if (c.requerido && cargadas.length === 0) errores.push(`${c.etiqueta}: cargá al menos una`)
      cargadas.forEach((t, i) => {
        const n = `Testigo ${i + 1}`
        if (!t.maceta.trim()) errores.push(`${n}: falta cuál es la maceta`)
        if (!t.ec.trim() && !t.ph.trim() && !t.drenaje.trim()) errores.push(`${n}: falta EC, pH o drenaje`)
        if (t.ec.trim()) { const e = numeroValido({ ...c, min: 0, max: 10 }, t.ec, `${n} EC`); if (e) errores.push(e) }
        if (t.ph.trim()) { const e = numeroValido({ ...c, min: 3, max: 9 }, t.ph, `${n} pH`); if (e) errores.push(e) }
        if (t.drenaje.trim()) { const e = numeroValido({ ...c, min: 0, max: 100 }, t.drenaje, `${n} drenaje`); if (e) errores.push(e) }
      })
      continue
    }
    if (c.tipo === "si_no") {
      if (c.requerido && x !== true) errores.push(`${c.etiqueta}: tiene que estar en «Sí»`)
      continue
    }
    const texto = typeof x === "string" ? x.trim() : ""
    if (!texto) {
      if (c.requerido) errores.push(`${c.etiqueta}: falta completar`)
      continue
    }
    if (c.tipo === "numero") {
      const e = numeroValido(c, texto)
      if (e) errores.push(e)
    }
    if (c.tipo === "opciones" && c.opciones && !c.opciones.includes(texto)) errores.push(`${c.etiqueta}: opción inválida`)
  }
  return errores
}

/** Pasa el formulario a lo que se guarda: números como número (punto decimal), vacíos afuera. */
export function serializar(campos: Campo[], v: Valores): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const c of campos) {
    const x = v[c.clave]
    if (c.tipo === "testigos") {
      const lista = ((Array.isArray(x) ? x : []) as Testigo[])
        .filter((t) => t.maceta.trim())
        .map((t) => ({ maceta: t.maceta.trim(), ec: parseDecimal(t.ec), ph: parseDecimal(t.ph), drenaje: parseDecimal(t.drenaje) }))
      if (lista.length) out[c.clave] = lista
    } else if (c.tipo === "si_no") {
      out[c.clave] = x === true
    } else if (c.tipo === "numero") {
      const n = typeof x === "string" ? parseDecimal(x) : null
      if (n !== null) out[c.clave] = n
    } else if (typeof x === "string" && x.trim()) {
      out[c.clave] = x.trim()
    }
  }
  return out
}

/** Datos de la sala para el riego: etapa y semana según su ciclo (como en la pantalla Riego). */
export function metaSala(ciclos: CicloSala[], salaId: number, hoy: string) {
  const c = cicloActual(ciclos, salaId, hoy)
  if (!c) return { ciclo_id: null, etapa: "vegetativo", semana: null, testigos: [] as string[] }
  const er = etapaRiegoDe(momentoCiclo(c, hoy))
  return {
    ciclo_id: c.id,
    etapa: er?.etapa ?? "vegetativo",
    semana: er?.semana ?? null,
    testigos: ((c as CicloSala & { testigos?: string[] }).testigos ?? []) as string[],
  }
}

/** Resumen corto de lo cargado en un paso, para mostrar en la lista. */
export function resumen(campos: Campo[], valores: Record<string, unknown>): string[] {
  const out: string[] = []
  for (const c of campos) {
    const v = valores[c.clave]
    if (v === undefined || v === null || v === "") continue
    if (c.tipo === "testigos" && Array.isArray(v)) {
      for (const t of v as Array<{ maceta: string; ec: number | null; ph: number | null; drenaje: number | null }>) {
        const partes = [t.ec != null && `EC ${fmt(t.ec)}`, t.ph != null && `pH ${fmt(t.ph)}`, t.drenaje != null && `${t.drenaje} %`].filter(Boolean)
        out.push(`${t.maceta}: ${partes.join(" · ")}`)
      }
    } else if (c.tipo === "si_no") {
      out.push(`${c.etiqueta.replace(/^¿|\?$/g, "")}: ${v ? "sí" : "no"}`)
    } else {
      out.push(`${c.etiqueta}: ${typeof v === "number" ? fmt(v) : String(v)}${c.unidad ? ` ${c.unidad}` : ""}`)
    }
  }
  return out
}

function fmt(n: number): string {
  return String(n).replace(".", ",")
}

/** Avance de un procedimiento: pasos hechos sobre el total. */
export function avance(pasos: Pick<ProcesoPaso, "estado">[]): { hechos: number; total: number } {
  return { hechos: pasos.filter((p) => p.estado === "hecho").length, total: pasos.length }
}
