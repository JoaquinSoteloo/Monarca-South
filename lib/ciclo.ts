/**
 * Superciclo Monarca: el ciclo de cada sala de flora y todo lo que se deriva
 * de él (fechas, fase del día, objetivos, tareas del protocolo).
 *
 * Ciclo real de Monarca (Manual 1): entrada a la sala con 18/6 → 21 días de
 * vege → 12/12 por 60 días (la última semana, solo agua) → secado en la misma
 * sala 5–6 días → 2 días de limpieza → sala libre. Las duraciones se pueden
 * cambiar por ciclo (planificador de cosecha) y todo se recalcula.
 *
 * Fechas como "YYYY-MM-DD" (día civil en Argentina), sin horas.
 */
import { rangoDrenaje, rangoEcEntrada, rangoPhEntrada, type EtapaRiego } from "./riego"
import type { Perfil, RolEquipo } from "./equipo"

export interface CicloSala {
  id: number
  sala_id: number
  nombre: string | null
  estado: "abierto" | "cerrado"
  geneticas: string | null
  plantas: number | null
  m2: number | null
  fecha_inicio: string
  dias_vege: number
  dias_flora: number
  dias_lavado: number
  dias_secado: number
  dias_limpieza: number
  notas: string | null
}

export type Fase = "planificado" | "vegetativo" | "floracion" | "lavado" | "secado" | "limpieza" | "libre"

export const FASE_LABEL: Record<Fase, string> = {
  planificado: "Planificado",
  vegetativo: "Vege (18/6)",
  floracion: "Flora (12/12)",
  lavado: "Lavado (solo agua)",
  secado: "Secado",
  limpieza: "Limpieza",
  libre: "Sala libre",
}

export const DEFAULTS = { dias_vege: 21, dias_flora: 60, dias_lavado: 7, dias_secado: 6, dias_limpieza: 2 }

// --- Fechas -----------------------------------------------------------------

export function sumarDias(fecha: string, dias: number): string {
  const [y, m, d] = fecha.split("-").map(Number)
  const t = Date.UTC(y, m - 1, d) + dias * 86400000
  return new Date(t).toISOString().slice(0, 10)
}

export function diasEntreFechas(desde: string, hasta: string): number {
  const a = Date.UTC(+desde.slice(0, 4), +desde.slice(5, 7) - 1, +desde.slice(8, 10))
  const b = Date.UTC(+hasta.slice(0, 4), +hasta.slice(5, 7) - 1, +hasta.slice(8, 10))
  return Math.round((b - a) / 86400000)
}

export function fechaCorta(fecha: string): string {
  return `${fecha.slice(8, 10)}/${fecha.slice(5, 7)}`
}

export interface FechasCiclo {
  inicio: string
  flip: string
  lavado: string
  cosecha: string
  finSecado: string
  libre: string
}

type Duraciones = Pick<CicloSala, "fecha_inicio" | "dias_vege" | "dias_flora" | "dias_lavado" | "dias_secado" | "dias_limpieza">

/** Todas las fechas del ciclo a partir de la entrada y las duraciones. */
export function fechasCiclo(c: Duraciones): FechasCiclo {
  const flip = sumarDias(c.fecha_inicio, c.dias_vege)
  const cosecha = sumarDias(flip, c.dias_flora)
  const lavado = sumarDias(cosecha, -Math.min(c.dias_lavado, c.dias_flora))
  const finSecado = sumarDias(cosecha, c.dias_secado)
  return { inicio: c.fecha_inicio, flip, lavado, cosecha, finSecado, libre: sumarDias(finSecado, c.dias_limpieza) }
}

export interface Momento {
  fase: Fase
  /** Día del ciclo desde la entrada a la sala (1 = primer día). */
  diaCiclo: number
  /** Día dentro de la fase de vege o de flora (lavado cuenta como flora). */
  diaFase: number
  /** Semana dentro de vege o de flora (1-based). */
  semana: number
  /** Días que faltan para la cosecha (negativo si ya pasó). */
  faltanCosecha: number
  /** 0–100, avance desde la entrada hasta la sala libre. */
  avance: number
}

export function momentoCiclo(c: Duraciones, hoy: string): Momento {
  const f = fechasCiclo(c)
  const total = diasEntreFechas(f.inicio, f.libre)
  const d = diasEntreFechas(f.inicio, hoy)
  const faltanCosecha = diasEntreFechas(hoy, f.cosecha)
  const avance = Math.max(0, Math.min(100, Math.round((d / total) * 100)))
  const base = { diaCiclo: d + 1, faltanCosecha, avance }
  if (d < 0) return { ...base, fase: "planificado", diaFase: 0, semana: 0 }
  if (hoy < f.flip) return { ...base, fase: "vegetativo", diaFase: d + 1, semana: Math.floor(d / 7) + 1 }
  const df = diasEntreFechas(f.flip, hoy)
  if (hoy < f.cosecha) {
    return { ...base, fase: hoy >= f.lavado ? "lavado" : "floracion", diaFase: df + 1, semana: Math.floor(df / 7) + 1 }
  }
  if (hoy < f.finSecado) return { ...base, fase: "secado", diaFase: diasEntreFechas(f.cosecha, hoy) + 1, semana: 0 }
  if (hoy < f.libre) return { ...base, fase: "limpieza", diaFase: diasEntreFechas(f.finSecado, hoy) + 1, semana: 0 }
  return { ...base, fase: "libre", diaFase: 0, semana: 0 }
}

/** Etapa y semana para precargar el registro de riego. */
export function etapaRiegoDe(m: Momento): { etapa: EtapaRiego; semana: number | null } | null {
  if (m.fase === "vegetativo") return { etapa: "vegetativo", semana: Math.min(m.semana, 3) }
  if (m.fase === "floracion") return { etapa: "floracion", semana: Math.min(m.semana, 7) }
  if (m.fase === "lavado") return { etapa: "lavado", semana: null }
  return null
}

// --- Objetivos del día --------------------------------------------------------

export interface Objetivos {
  fotoperiodo: string | null
  ecEntrada: string | null
  phEntrada: string | null
  drenaje: string | null
  temperatura: string | null
  humedad: string | null
  vpd: string | null
  ppfd: string | null
}

const n = (x: number, dec = 1) => x.toFixed(dec).replace(".", ",")
const rango = (a: number, b: number) => (n(a) === n(b) ? n(a) : `${n(a)}–${n(b)}`)

/** Valores de referencia del Manual 2 (clima) y del Manual 3 (riego) para el momento del ciclo. */
export function objetivos(m: Momento, c: Pick<CicloSala, "dias_flora">): Objetivos {
  const vacio: Objetivos = { fotoperiodo: null, ecEntrada: null, phEntrada: null, drenaje: null, temperatura: null, humedad: null, vpd: null, ppfd: null }
  if (m.fase === "secado") return { ...vacio, fotoperiodo: "Luces apagadas", temperatura: "20 °C", humedad: "55 %" }
  if (m.fase === "planificado" || m.fase === "libre" || m.fase === "limpieza") return vacio
  const er = etapaRiegoDe(m)
  const ec = er ? rangoEcEntrada(er.etapa, er.semana) : null
  const ph = er ? rangoPhEntrada(er.etapa, er.semana) : null
  const dr = er ? rangoDrenaje(er.etapa, er.semana) : null
  const riego = {
    ecEntrada: er?.etapa === "lavado" ? "Solo agua de ósmosis" : ec ? rango(ec.min + 0.1, ec.max - 0.1) : null,
    phEntrada: ph ? rango(ph.min + 0.2, ph.max - 0.2) : null,
    drenaje: dr ? `${dr.min}–${dr.max} %` : null,
  }
  if (m.fase === "vegetativo") {
    return { ...riego, fotoperiodo: "18/6", temperatura: "24–28 °C", humedad: "60–70 %", vpd: "0,8–1,1 kPa", ppfd: "300–500" }
  }
  const ultimasDos = m.diaFase > c.dias_flora - 14
  return {
    ...riego,
    fotoperiodo: "12/12",
    temperatura: ultimasDos ? "20–24 °C" : "22–26 °C",
    humedad: ultimasDos ? "40–50 %" : "45–55 %",
    vpd: ultimasDos ? "1,2–1,5 kPa" : "1,1–1,4 kPa",
    ppfd: "600–900",
  }
}

// --- Protocolo: tareas del ciclo ----------------------------------------------

export interface TareaCiclo {
  clave: string
  fecha: string
  titulo: string
  detalle: string | null
  rol: RolEquipo
  afecta: RolEquipo[]
  orden: number
}

/** Plantas para llenar una sala: 16 por m² y un 10 % de reserva. */
export function plantasPara(m2: number | null): number | null {
  return m2 ? Math.round(m2 * 16 * 1.1) : null
}

/**
 * Protocolo Monarca: lo que hay que hacer en cada ciclo y cuándo. Cada tarea
 * va al rol que corresponde (cultivo = Lucho, mantenimiento = Vilela,
 * atención = Demian, dirección = Facundo).
 */
export function protocoloMonarca(c: CicloSala, nombreSala: string): TareaCiclo[] {
  const f = fechasCiclo(c)
  const s = nombreSala
  const esquejes = plantasPara(c.m2)
  const cant = esquejes ? `~${esquejes} ` : ""
  const t: TareaCiclo[] = [
    { clave: "entrada", fecha: f.inicio, rol: "cultivo", afecta: ["mantenimiento"], orden: 5,
      titulo: `${s} · Entrada de plantas a la sala (18/6)`,
      detalle: "Macetas de 5 L numeradas por genética, malla de tutorado desde el trasplante, timer en 18/6." },
    { clave: "ppfd_flip", fecha: sumarDias(f.flip, -1), rol: "cultivo", afecta: [], orden: 6,
      titulo: `${s} · Mapa de PPFD y altura de luces antes de flora`, detalle: "Manual 1. Objetivo en flora: 600–900." },
    { clave: "flip", fecha: f.flip, rol: "cultivo", afecta: ["direccion"], orden: 5,
      titulo: `${s} · Pasar a 12/12`, detalle: "Cambiar el timer, confirmar en el monitoreo que se apagó a la hora correcta." },
    { clave: "poda_bajos", fecha: sumarDias(f.flip, 21), rol: "cultivo", afecta: ["mantenimiento"], orden: 20,
      titulo: `${s} · Poda de bajos (semana 3 de flora)`, detalle: "Limpiar bajos para cocos grandes; acomodar la luz bajo canopia." },
    { clave: "lavado", fecha: f.lavado, rol: "cultivo", afecta: ["mantenimiento"], orden: 6,
      titulo: `${s} · Empieza el lavado: solo agua de ósmosis`,
      detalle: "Drenaje buscado 20–30 %. El tanque de vege puede usarse como tanque de solo agua." },
    { clave: "higiene", fecha: sumarDias(f.cosecha, -3), rol: "mantenimiento", afecta: ["cultivo"], orden: 5,
      titulo: `${s} · Higiene obligatoria antes del corte`, detalle: "Checklist del Manual 4: herramientas, redes, bandejas, ropa y sala de secado." },
    { clave: "pre_corte", fecha: sumarDias(f.cosecha, -1), rol: "mantenimiento", afecta: ["cultivo"], orden: 6,
      titulo: `${s} · Preparar redes, tijeras y bandejas para el corte`, detalle: null },
    { clave: "corte", fecha: f.cosecha, rol: "cultivo", afecta: ["mantenimiento", "atencion", "direccion"], orden: 1,
      titulo: `${s} · Cosecha: corte y colgado (todo el equipo)`, detalle: "Secado en la misma sala: 20 °C y 55 %, luces apagadas." },
    { clave: "peso_humedo", fecha: f.cosecha, rol: "atencion", afecta: ["direccion"], orden: 2,
      titulo: `${s} · Pesar en húmedo y abrir el lote`, detalle: "Manual 4, registro de lote." },
    { clave: "fin_secado", fecha: f.finSecado, rol: "atencion", afecta: ["direccion", "cultivo"], orden: 1,
      titulo: `${s} · Fin de secado: descocado, manicura y pesaje en seco`,
      detalle: "Todo el equipo en descocado y manicura. Demian y Facundo pesan, envasan y cargan el stock." },
    { clave: "limpieza", fecha: f.finSecado, rol: "mantenimiento", afecta: ["cultivo"], orden: 3,
      titulo: `${s} · Limpieza de sala: camas, luces y ventiladores`, detalle: "Vilela y Lucho. Sala libre el " + fechaCorta(f.libre) + "." },
    { clave: "esquejes_corte", fecha: sumarDias(f.libre, -44), rol: "cultivo", afecta: [], orden: 10,
      titulo: `${s} · Cortar ${cant}esquejes para la próxima tanda`,
      detalle: `Tienen que estar enraizados y en vege el ${fechaCorta(sumarDias(f.libre, -30))} para entrar a la sala el ${fechaCorta(f.libre)}.` },
    { clave: "esquejes_vege", fecha: sumarDias(f.libre, -30), rol: "cultivo", afecta: ["mantenimiento"], orden: 10,
      titulo: `${s} · Pasar ${cant}esquejes enraizados a la sala de vege`,
      detalle: `30 días de vege antes de entrar a ${s} el ${fechaCorta(f.libre)}. Si no alcanzan, avisar a Facundo para comprar.` },
  ]
  for (let i = 1; i < c.dias_secado; i++) {
    t.push({ clave: `secado_${i}`, fecha: sumarDias(f.cosecha, i), rol: "mantenimiento", afecta: [], orden: 15,
      titulo: `${s} · Controlar secado (día ${i + 1})`, detalle: "20 °C y 55 % de humedad. Si se va de rango, marcar \"Problema\"." })
  }
  return t.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.orden - b.orden)
}

/** Primer perfil activo con ese rol (el responsable por defecto de cada rol). */
export function perfilPorRol(rol: RolEquipo, perfiles: Perfil[]): Perfil | null {
  return perfiles.find((p) => p.activo && p.rol === rol) ?? null
}

/** Filas listas para insertar en `tareas`, solo desde `desde` en adelante. */
export function filasTareasCiclo(c: CicloSala, nombreSala: string, perfiles: Perfil[], desde: string) {
  return protocoloMonarca(c, nombreSala)
    .filter((t) => t.fecha >= desde)
    .flatMap((t) => {
      const resp = perfilPorRol(t.rol, perfiles) ?? perfilPorRol("cultivo", perfiles)
      if (!resp) return []
      const afecta = t.afecta
        .map((r) => perfilPorRol(r, perfiles)?.id)
        .filter((id): id is string => Boolean(id) && id !== resp.id)
      return [{
        fecha: t.fecha, titulo: t.titulo, detalle: t.detalle, responsable_id: resp.id,
        afecta_a: [...new Set(afecta)], orden: t.orden, ciclo_id: c.id, clave: t.clave,
      }]
    })
}

/** Ciclo que manda hoy en una sala: el que contiene hoy, si no el próximo planificado. */
export function cicloActual(ciclos: CicloSala[], salaId: number, hoy: string): CicloSala | null {
  const abiertos = ciclos.filter((c) => c.sala_id === salaId && c.estado === "abierto")
  const enCurso = abiertos.find((c) => c.fecha_inicio <= hoy && hoy < fechasCiclo(c).libre)
  if (enCurso) return enCurso
  return abiertos.filter((c) => c.fecha_inicio > hoy).sort((a, b) => a.fecha_inicio.localeCompare(b.fecha_inicio))[0] ?? null
}

/** Ciclos de una misma sala que se pisan (el siguiente entra antes de que la sala quede libre). */
export function solapamientos(ciclos: CicloSala[]): Array<[CicloSala, CicloSala]> {
  const out: Array<[CicloSala, CicloSala]> = []
  const abiertos = ciclos.filter((c) => c.estado === "abierto").sort((a, b) => a.fecha_inicio.localeCompare(b.fecha_inicio))
  for (let i = 0; i < abiertos.length; i++) {
    for (let j = i + 1; j < abiertos.length; j++) {
      const a = abiertos[i], b = abiertos[j]
      if (a.sala_id === b.sala_id && b.fecha_inicio < fechasCiclo(a).libre) out.push([a, b])
    }
  }
  return out
}
