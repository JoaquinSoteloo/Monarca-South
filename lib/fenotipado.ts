/**
 * Fenotipado (pedido de Facundo, 18/11/2026; script 104).
 *
 * Plantas de semilla de genéticas compradas: Lucho y Demian anotan cómo
 * crece cada una (en la pantalla Fenotipado o contándoselo al Asistente) y el
 * sistema arma la evolución y un ranking por genética para elegir madres.
 * Acá viven los tipos y las cuentas puras, para poder probarlas.
 */

export const ETAPAS_FENO = ["germinacion", "vege", "flora", "cosecha", "curado"] as const
export type EtapaFeno = (typeof ETAPAS_FENO)[number]
export const ETAPA_FENO_LABEL: Record<EtapaFeno, string> = {
  germinacion: "Germinación",
  vege: "Vege",
  flora: "Flora",
  cosecha: "Cosecha",
  curado: "Curado",
}

export const ESTADOS_FENO = ["en_curso", "madre", "descartada", "cosechada"] as const
export type EstadoFeno = (typeof ESTADOS_FENO)[number]
export const ESTADO_FENO_LABEL: Record<EstadoFeno, string> = {
  en_curso: "En curso",
  madre: "Elegida como madre",
  descartada: "Descartada",
  cosechada: "Cosechada",
}

export const SEXOS_FENO = ["sin_definir", "hembra", "macho", "hermafrodita"] as const
export type SexoFeno = (typeof SEXOS_FENO)[number]
export const SEXO_FENO_LABEL: Record<SexoFeno, string> = {
  sin_definir: "Sin definir",
  hembra: "Hembra",
  macho: "Macho",
  hermafrodita: "Hermafrodita",
}

export const NUDOS = ["cortos", "medios", "largos"] as const
export const FORMAS = ["indica", "sativa", "mixta"] as const
export const FORMA_LABEL: Record<(typeof FORMAS)[number], string> = { indica: "Índica", sativa: "Sativa", mixta: "Mixta" }
export const SALUDES = ["bien", "regular", "mal"] as const

/** Los 6 puntajes de 1 a 5 que se ponen al final de cada etapa. */
export const PUNTAJES = ["vigor", "estructura", "aroma", "resina", "resistencia", "rendimiento"] as const
export type Puntaje = (typeof PUNTAJES)[number]
export const PUNTAJE_LABEL: Record<Puntaje, string> = {
  vigor: "Vigor",
  estructura: "Estructura",
  aroma: "Aroma",
  resina: "Resina",
  resistencia: "Resistencia",
  rendimiento: "Rendimiento",
}

export interface PlantaFeno {
  id: number
  codigo: string
  genetica: string
  banco: string | null
  fecha_germinacion: string | null
  ubicacion: string | null
  estado: EstadoFeno
  sexo: SexoFeno
  notas: string | null
  creado_por?: string | null
  created_at?: string
}

export interface ObservacionFeno {
  id: number
  planta_id: number
  fecha: string
  etapa: EtapaFeno
  semana: number | null
  altura_cm: number | null
  nudos: (typeof NUDOS)[number] | null
  forma: (typeof FORMAS)[number] | null
  salud: (typeof SALUDES)[number] | null
  olor: string | null
  vigor: number | null
  estructura: number | null
  aroma: number | null
  resina: number | null
  resistencia: number | null
  rendimiento: number | null
  peso_humedo_g: number | null
  peso_seco_g: number | null
  nota: string | null
  origen?: "pantalla" | "asistente"
  cargado_por?: string | null
  created_at?: string
}

/** "gel 3" / "Gel-03" → "GEL-03". Devuelve null si no parece un código. */
export function normalizarCodigo(texto: string): string | null {
  const t = texto.trim().toUpperCase().replace(/\s+/g, " ")
  const m = t.match(/^([A-ZÁÉÍÓÚÑ]{1,8})[\s\-_.]*(\d{1,3})$/)
  if (!m) return t.length ? t.replace(/\s+/g, "-") : null
  return `${m[1]}-${m[2].padStart(2, "0")}`
}

/** Días desde la germinación (null si no hay fecha). Fechas YYYY-MM-DD. */
export function diasDesde(fecha: string | null, hoy: string): number | null {
  if (!fecha) return null
  const a = Date.parse(`${fecha}T00:00:00Z`)
  const b = Date.parse(`${hoy}T00:00:00Z`)
  if (Number.isNaN(a) || Number.isNaN(b)) return null
  return Math.round((b - a) / 86400000)
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

const r1 = (n: number) => Math.round(n * 10) / 10

/** Observaciones de más vieja a más nueva (por fecha y luego por carga). */
export function ordenarObservaciones<T extends Pick<ObservacionFeno, "fecha" | "id">>(obs: T[]): T[] {
  return [...obs].sort((a, b) => (a.fecha === b.fecha ? a.id - b.id : a.fecha < b.fecha ? -1 : 1))
}

/** Último valor cargado de un puntaje para la planta (los puntajes se ponen al cerrar cada etapa). */
export function ultimoPuntaje(obs: ObservacionFeno[], p: Puntaje): number | null {
  const orden = ordenarObservaciones(obs)
  for (let i = orden.length - 1; i >= 0; i--) {
    const v = num(orden[i][p])
    if (v !== null) return v
  }
  return null
}

export interface ResumenPlanta {
  planta: PlantaFeno
  observaciones: number
  ultima_fecha: string | null
  etapa_actual: EtapaFeno | null
  semana_actual: number | null
  altura_actual: number | null
  /** cm por semana entre la primera y la última altura medidas (null si hay menos de 2 o mismo día). */
  crecimiento_cm_semana: number | null
  /** Estiramiento en flora: última altura de flora menos última altura de vege (cm). */
  estiramiento_cm: number | null
  alturas: { fecha: string; altura: number }[]
  puntajes: Record<Puntaje, number | null>
  /** Promedio de los puntajes cargados (null si ninguno). */
  puntaje_promedio: number | null
  peso_seco_g: number | null
  ultima_nota: string | null
  ultimo_olor: string | null
  alertas: string[]
}

export function resumirPlanta(planta: PlantaFeno, todas: ObservacionFeno[], hoy: string): ResumenPlanta {
  const obs = ordenarObservaciones(todas.filter((o) => o.planta_id === planta.id))
  const ultima = obs[obs.length - 1]
  const alturas = obs
    .map((o) => ({ fecha: o.fecha, altura: num(o.altura_cm), etapa: o.etapa }))
    .filter((a): a is { fecha: string; altura: number; etapa: EtapaFeno } => a.altura !== null)

  let crecimiento: number | null = null
  if (alturas.length >= 2) {
    const dias = diasDesde(alturas[0].fecha, alturas[alturas.length - 1].fecha) ?? 0
    if (dias > 0) crecimiento = r1(((alturas[alturas.length - 1].altura - alturas[0].altura) / dias) * 7)
  }

  const ultVege = [...alturas].reverse().find((a) => a.etapa === "vege" || a.etapa === "germinacion")
  const ultFlora = [...alturas].reverse().find((a) => a.etapa === "flora")
  const estiramiento = ultVege && ultFlora ? r1(ultFlora.altura - ultVege.altura) : null

  const puntajes = Object.fromEntries(PUNTAJES.map((p) => [p, ultimoPuntaje(obs, p)])) as Record<Puntaje, number | null>
  const cargados = PUNTAJES.map((p) => puntajes[p]).filter((v): v is number => v !== null)
  const promedio = cargados.length ? r1(cargados.reduce((a, b) => a + b, 0) / cargados.length) : null

  const pesoSeco = [...obs].reverse().map((o) => num(o.peso_seco_g)).find((v) => v !== null) ?? null
  const ultimaNota = [...obs].reverse().find((o) => o.nota?.trim())?.nota?.trim() ?? null
  const ultimoOlor = [...obs].reverse().find((o) => o.olor?.trim())?.olor?.trim() ?? null

  const alertas: string[] = []
  if (planta.sexo === "macho" || planta.sexo === "hermafrodita") {
    if (planta.estado === "en_curso") alertas.push(`Es ${SEXO_FENO_LABEL[planta.sexo].toLowerCase()}: decidir si se descarta.`)
  }
  if (planta.estado === "en_curso") {
    const sinMirar = ultima ? diasDesde(ultima.fecha, hoy) : diasDesde(planta.fecha_germinacion, hoy)
    if (sinMirar !== null && sinMirar > 7) alertas.push(`Hace ${sinMirar} días que no se anota nada.`)
    if (ultima?.salud === "mal") alertas.push("La última revisión dice salud mal.")
  }

  return {
    planta,
    observaciones: obs.length,
    ultima_fecha: ultima?.fecha ?? null,
    etapa_actual: ultima?.etapa ?? null,
    semana_actual: ultima?.semana ?? null,
    altura_actual: alturas.length ? alturas[alturas.length - 1].altura : null,
    crecimiento_cm_semana: crecimiento,
    estiramiento_cm: estiramiento,
    alturas: alturas.map(({ fecha, altura }) => ({ fecha, altura })),
    puntajes,
    puntaje_promedio: promedio,
    peso_seco_g: pesoSeco,
    ultima_nota: ultimaNota,
    ultimo_olor: ultimoOlor,
    alertas,
  }
}

export interface RankingGenetica {
  genetica: string
  plantas: ResumenPlanta[]
}

/**
 * Plantas agrupadas por genética y ordenadas de mejor a peor: primero las
 * elegidas como madre, después por puntaje promedio; las descartadas, machos
 * y hermafroditas al final.
 */
export function rankingPorGenetica(resumenes: ResumenPlanta[]): RankingGenetica[] {
  const grupos = new Map<string, ResumenPlanta[]>()
  for (const r of resumenes) {
    const g = r.planta.genetica.trim() || "Sin genética"
    grupos.set(g, [...(grupos.get(g) ?? []), r])
  }
  const peso = (r: ResumenPlanta) => {
    if (r.planta.estado === "madre") return 0
    if (r.planta.estado === "descartada" || r.planta.sexo === "macho" || r.planta.sexo === "hermafrodita") return 2
    return 1
  }
  return [...grupos.entries()]
    .sort(([a], [b]) => a.localeCompare(b, "es"))
    .map(([genetica, plantas]) => ({
      genetica,
      plantas: [...plantas].sort(
        (a, b) =>
          peso(a) - peso(b) ||
          (b.puntaje_promedio ?? -1) - (a.puntaje_promedio ?? -1) ||
          a.planta.codigo.localeCompare(b.planta.codigo, "es"),
      ),
    }))
}

/** Texto compacto con todo el fenotipado, para el resumen de la IA. */
export function datosParaResumen(resumenes: ResumenPlanta[], obs: ObservacionFeno[]): string {
  return rankingPorGenetica(resumenes)
    .map(({ genetica, plantas }) => {
      const filas = plantas.map((r) => {
        const p = r.planta
        const historia = ordenarObservaciones(obs.filter((o) => o.planta_id === p.id))
          .slice(-12)
          .map((o) => {
            const partes = [
              `${o.fecha} ${ETAPA_FENO_LABEL[o.etapa]}${o.semana !== null ? ` sem ${o.semana}` : ""}`,
              o.altura_cm !== null ? `${o.altura_cm} cm` : null,
              o.nudos ? `nudos ${o.nudos}` : null,
              o.forma ? o.forma : null,
              o.salud ? `salud ${o.salud}` : null,
              o.olor ? `olor: ${o.olor}` : null,
              o.peso_seco_g !== null ? `seco ${o.peso_seco_g} g` : null,
              o.nota ? `nota: ${o.nota}` : null,
            ].filter(Boolean)
            return `    · ${partes.join(", ")}`
          })
        const pts = PUNTAJES.filter((k) => r.puntajes[k] !== null).map((k) => `${PUNTAJE_LABEL[k]} ${r.puntajes[k]}`)
        return [
          `  ${p.codigo} — ${ESTADO_FENO_LABEL[p.estado]}, ${SEXO_FENO_LABEL[p.sexo]}` +
            `${p.fecha_germinacion ? `, germinó ${p.fecha_germinacion}` : ""}` +
            `${r.crecimiento_cm_semana !== null ? `, crece ${r.crecimiento_cm_semana} cm/sem` : ""}` +
            `${r.estiramiento_cm !== null ? `, estiró ${r.estiramiento_cm} cm` : ""}` +
            `${pts.length ? `, puntajes: ${pts.join(", ")} (prom. ${r.puntaje_promedio})` : ""}`,
          ...historia,
        ].join("\n")
      })
      return `${genetica}:\n${filas.join("\n")}`
    })
    .join("\n\n")
}
