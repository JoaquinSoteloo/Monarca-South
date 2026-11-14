// Resumen semanal de Nubi (pedido de Joaquín, 13/11/2026; idea de
// supercycler.app). Junta la semana de cada sala (tiempo en rango, extremos,
// alertas, riegos cargados), lo que propuso Nubi y las órdenes que fallaron, y
// arma un texto corto con UNA sola sugerencia prioritaria. La redacción la
// hace el modelo (lib/ia.ts); si no hay modelo, queda un texto armado acá.
import type { SupabaseClient } from "@supabase/supabase-js"
import { cicloActual, type CicloSala } from "@/lib/ciclo"
import { rangoClima } from "@/lib/clima-alertas"
import { completar } from "@/lib/ia"

const ZONA = "America/Argentina/Buenos_Aires"
const fechaAR = (d: Date | string) => new Date(d).toLocaleDateString("en-CA", { timeZone: ZONA })

export interface ResumenSala {
  sala: string
  etapa: string | null
  horas_medidas: number
  temperatura: { prom: number | null; min: number | null; max: number | null; pct_en_rango: number | null; rango: [number, number] | null; mas_tiempo_fuera: "alto" | "bajo" | null }
  humedad: { prom: number | null; min: number | null; max: number | null; pct_en_rango: number | null; rango: [number, number] | null; mas_tiempo_fuera: "alto" | "bajo" | null }
  alertas: { temperatura: number; humedad: number; luz: number }
  riegos_cargados: number
}

export interface DatosSemana {
  desde: string
  hasta: string
  salas: ResumenSala[]
  nubi: { mandadas: number; descartadas: number; vencidas: number; avisos: number }
  ordenes_fallidas: number
}

type HoraClima = { sala_id: number; hora: string; temperatura_prom: number | null; temperatura_min: number | null; temperatura_max: number | null; humedad_prom: number | null; humedad_min: number | null; humedad_max: number | null }

const r1 = (n: number) => Math.round(n * 10) / 10

function estadistica(horas: HoraClima[], campo: "temperatura" | "humedad", rangoDe: (h: HoraClima) => [number, number] | null) {
  const validas = horas.filter((h) => h[`${campo}_prom`] !== null)
  if (validas.length === 0) return { prom: null, min: null, max: null, pct_en_rango: null, rango: null, mas_tiempo_fuera: null }
  const prom = validas.reduce((s, h) => s + Number(h[`${campo}_prom`]), 0) / validas.length
  const min = Math.min(...validas.map((h) => Number(h[`${campo}_min`] ?? h[`${campo}_prom`])))
  const max = Math.max(...validas.map((h) => Number(h[`${campo}_max`] ?? h[`${campo}_prom`])))
  let enRango = 0, alto = 0, bajo = 0, conRango = 0
  let ultimoRango: [number, number] | null = null
  for (const h of validas) {
    const r = rangoDe(h)
    if (!r) continue
    ultimoRango = r
    conRango++
    const v = Number(h[`${campo}_prom`])
    if (v > r[1]) alto++
    else if (v < r[0]) bajo++
    else enRango++
  }
  return {
    prom: r1(prom),
    min: r1(min),
    max: r1(max),
    pct_en_rango: conRango ? Math.round((enRango / conRango) * 100) : null,
    rango: ultimoRango,
    mas_tiempo_fuera: alto === 0 && bajo === 0 ? null : alto >= bajo ? ("alto" as const) : ("bajo" as const),
  }
}

/** Junta los datos de la semana [desde, hasta). */
export async function datosSemana(supabase: SupabaseClient, desde: Date, hasta: Date): Promise<DatosSemana> {
  const d = desde.toISOString(), h = hasta.toISOString()
  const [clima, salasR, ciclosR, alertasR, propuestasR, fallasR, riegosR] = await Promise.all([
    supabase.rpc("clima_por_hora", { p_desde: d, p_hasta: h }),
    supabase.from("salas_cultivo").select("id, nombre").eq("activo", true).order("id"),
    supabase.from("ciclos_sala").select("*").eq("estado", "abierto"),
    supabase.from("alertas_clima").select("sala_id, variable").gte("desde", d).lt("desde", h),
    supabase.from("propuestas_nubi").select("estado").gte("creada_en", d).lt("creada_en", h),
    supabase.from("comandos_dispositivo").select("id").in("estado", ["fallido", "timeout"]).gte("creado_en", d).lt("creado_en", h),
    supabase.from("registros_riego").select("sala_id").gte("fecha", fechaAR(desde)).lt("fecha", fechaAR(hasta)),
  ])
  if (clima.error) throw new Error(clima.error.message)
  const horas = (clima.data ?? []) as HoraClima[]
  const ciclos = (ciclosR.data ?? []) as CicloSala[]
  const alertas = (alertasR.data ?? []) as { sala_id: number; variable: string }[]
  const propuestas = (propuestasR.data ?? []) as { estado: string }[]
  const riegos = (riegosR.data ?? []) as { sala_id: number }[]

  const salas = ((salasR.data ?? []) as { id: number; nombre: string }[]).map((s) => {
    const suyas = horas.filter((x) => x.sala_id === s.id)
    const rangoDe = (x: HoraClima) => {
      const dia = fechaAR(x.hora)
      return rangoClima(s.nombre, cicloActual(ciclos, s.id, dia), dia)
    }
    const hoyRango = rangoClima(s.nombre, cicloActual(ciclos, s.id, fechaAR(hasta)), fechaAR(hasta))
    const deLaSala = alertas.filter((a) => a.sala_id === s.id)
    return {
      sala: s.nombre,
      etapa: hoyRango?.etapa ?? null,
      horas_medidas: suyas.length,
      temperatura: estadistica(suyas, "temperatura", (x) => rangoDe(x)?.temperatura ?? null),
      humedad: estadistica(suyas, "humedad", (x) => rangoDe(x)?.humedad ?? null),
      alertas: {
        temperatura: deLaSala.filter((a) => a.variable === "temperatura").length,
        humedad: deLaSala.filter((a) => a.variable === "humedad").length,
        luz: deLaSala.filter((a) => a.variable === "luz").length,
      },
      riegos_cargados: riegos.filter((r) => r.sala_id === s.id).length,
    }
  })

  return {
    desde: fechaAR(desde),
    hasta: fechaAR(new Date(hasta.getTime() - 1)),
    salas,
    nubi: {
      mandadas: propuestas.filter((p) => p.estado === "aprobada").length,
      descartadas: propuestas.filter((p) => p.estado === "rechazada").length,
      vencidas: propuestas.filter((p) => p.estado === "vencida").length,
      avisos: propuestas.filter((p) => p.estado === "informada").length,
    },
    ordenes_fallidas: (fallasR.data ?? []).length,
  }
}

/** Sugerencia de respaldo: lo que más tiempo estuvo fuera de rango. */
export function sugerenciaPorReglas(d: DatosSemana): string {
  let peor: { sala: string; variable: "temperatura" | "humedad"; pct: number; lado: "alto" | "bajo" | null } | null = null
  for (const s of d.salas) {
    for (const variable of ["temperatura", "humedad"] as const) {
      const pct = s[variable].pct_en_rango
      if (pct === null) continue
      if (!peor || pct < peor.pct) peor = { sala: s.sala, variable, pct, lado: s[variable].mas_tiempo_fuera }
    }
  }
  if (!peor || peor.pct >= 90) {
    const sinRiegos = d.salas.filter((s) => s.etapa && s.riegos_cargados === 0).map((s) => s.sala)
    return sinRiegos.length
      ? `Cargar los riegos en la app (EC, pH y runoff): esta semana no hubo ninguno en ${sinRiegos.join(", ")}, y sin eso no se puede ver cómo está la raíz.`
      : "Semana tranquila: el clima estuvo en rango casi todo el tiempo. Seguir así."
  }
  const que = peor.variable === "humedad"
    ? peor.lado === "alto" ? "bajar la humedad (deshumidificador, extracción)" : "subir la humedad (humidificador, menos extracción)"
    : peor.lado === "alto" ? "bajar la temperatura (aire, extracción)" : "subir la temperatura (calefacción, menos extracción)"
  return `${peor.sala}: la ${peor.variable} estuvo en rango solo el ${peor.pct} % del tiempo. Prioridad de la semana: ${que}.`
}

/** Texto de respaldo, sin modelo. */
export function textoPorReglas(d: DatosSemana): string {
  const lineas = d.salas
    .filter((s) => s.horas_medidas > 0)
    .map((s) => {
      const t = s.temperatura, h = s.humedad
      const pct = (x: number | null) => (x === null ? "sin rango" : `${x} % en rango`)
      return `- **${s.sala}**${s.etapa ? ` (${s.etapa})` : ""}: ${t.prom} °C (${t.min}–${t.max}), ${pct(t.pct_en_rango)} · ${h.prom} % HR (${h.min}–${h.max}), ${pct(h.pct_en_rango)}${s.riegos_cargados ? ` · ${s.riegos_cargados} riegos` : ""}`
    })
  const n = d.nubi
  const extra = `Nubi propuso ${n.mandadas + n.descartadas + n.vencidas} ajustes (${n.mandadas} mandados, ${n.descartadas} descartados, ${n.vencidas} sin respuesta). Órdenes que fallaron: ${d.ordenes_fallidas}.`
  return `Semana del ${d.desde} al ${d.hasta}.\n${lineas.join("\n")}\n${extra}`
}

const SISTEMA = `Sos Nubi, la IA que vigila el clima de las salas de cultivo de Monarca South (cannabis medicinal en interior, coco, LED).
Con los datos de la semana escribí un resumen para el equipo, en español rioplatense, para leer en el celular:
- Una línea por sala con lo importante (tiempo en rango de temperatura y humedad, extremos si fueron graves, alertas). Usá "- " y **negrita** solo para el nombre de la sala.
- Una línea sobre lo que propuso Nubi y las órdenes fallidas, si hubo.
- Si alguna sala en etapa no tiene riegos cargados, mencionalo.
Al final, en una línea aparte que empiece exactamente con "SUGERENCIA:", UNA sola sugerencia prioritaria y concreta para esta semana (la que más impacto tenga en el cultivo), en una frase.
No inventes datos: usá solo los números que te paso. Nada de tablas ni títulos.`

export interface ResumenArmado {
  texto: string
  sugerencia: string
  datos: DatosSemana
  conIA: boolean
}

export async function armarResumen(supabase: SupabaseClient, desde: Date, hasta: Date): Promise<ResumenArmado> {
  const datos = await datosSemana(supabase, desde, hasta)
  const respuesta = await completar(SISTEMA, JSON.stringify(datos))
  if (respuesta) {
    const partes = respuesta.split(/\n?\s*SUGERENCIA:\s*/i)
    if (partes.length >= 2 && partes[1].trim()) {
      return { texto: partes[0].trim(), sugerencia: partes.slice(1).join(" ").trim(), datos, conIA: true }
    }
  }
  return { texto: textoPorReglas(datos), sugerencia: sugerenciaPorReglas(datos), datos, conIA: false }
}

/** Lunes de la semana pasada (fecha AR) si hoy es lunes desde las 09:00; si no, null. */
export function semanaParaResumir(ahora: Date): { desde: Date; hasta: Date; semana: string } | null {
  const partes = new Intl.DateTimeFormat("en-US", { timeZone: ZONA, weekday: "short", hour: "2-digit", hour12: false }).formatToParts(ahora)
  const dia = partes.find((p) => p.type === "weekday")?.value
  const hora = Number(partes.find((p) => p.type === "hour")?.value) % 24
  if (dia !== "Mon" || hora < 9) return null
  const hoy = fechaAR(ahora)
  const hasta = new Date(`${hoy}T00:00:00-03:00`)
  const desde = new Date(hasta.getTime() - 7 * 86400_000)
  return { desde, hasta, semana: fechaAR(desde) }
}
