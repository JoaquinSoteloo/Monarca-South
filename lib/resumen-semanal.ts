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
    supabase.from("propuestas_nubi").select("estado, motivo").gte("creada_en", d).lt("creada_en", h),
    supabase.from("comandos_dispositivo").select("id").in("estado", ["fallido", "timeout"]).gte("creado_en", d).lt("creado_en", h),
    supabase.from("registros_riego").select("sala_id").gte("fecha", fechaAR(desde)).lt("fecha", fechaAR(hasta)),
  ])
  if (clima.error) throw new Error(clima.error.message)
  const horas = (clima.data ?? []) as HoraClima[]
  const ciclos = (ciclosR.data ?? []) as CicloSala[]
  const alertas = (alertasR.data ?? []) as { sala_id: number; variable: string }[]
  // Las de "Probar Nubi" no cuentan.
  const propuestas = ((propuestasR.data ?? []) as { estado: string; motivo: string }[]).filter((p) => !/PRUEBA/.test(p.motivo))
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

const coma = (n: number) => String(n).replace(".", ",")
const unidad = (v: "temperatura" | "humedad") => (v === "temperatura" ? " °C" : " %")

/** En palabras: "baja casi toda la semana", "un poco alta a veces"; null si estuvo bien. */
export function comoEstuvo(e: ResumenSala["temperatura"]): string | null {
  if (e.pct_en_rango === null || e.pct_en_rango >= 80 || !e.mas_tiempo_fuera) return null
  const lado = e.mas_tiempo_fuera === "alto" ? "alta" : "baja"
  if (e.pct_en_rango < 25) return `${lado} casi toda la semana`
  if (e.pct_en_rango < 50) return `${lado} gran parte de la semana`
  return `un poco ${lado} a veces`
}

const QUE_HACER = {
  humedad: {
    alto: "dejar el deshumidificador prendido, subir la extracción y no regar de más",
    bajo: "bajar la extracción, sumar un humidificador o poner bandejas con agua",
  },
  temperatura: {
    alto: "bajar el aire y subir la extracción",
    bajo: "bajar el aire o la extracción y, de noche, sumar calefacción",
  },
} as const

const enFlora = (s: ResumenSala) => Boolean(s.etapa?.includes("flora"))

/** La prioridad de la semana: lo más grave (pesa más la flora, y más la humedad alta en flora). */
export function prioridad(d: DatosSemana): { sala: string; variable: "temperatura" | "humedad"; como_estuvo: string; promedio: string; rango: string; que_hacer: string; por_que: string | null } | null {
  let peor: { s: ResumenSala; variable: "temperatura" | "humedad"; puntaje: number } | null = null
  for (const s of d.salas) {
    for (const variable of ["temperatura", "humedad"] as const) {
      const e = s[variable]
      if (!comoEstuvo(e)) continue
      let puntaje = (100 - (e.pct_en_rango ?? 100)) * (enFlora(s) ? 2 : 1)
      if (variable === "humedad" && e.mas_tiempo_fuera === "alto" && enFlora(s)) puntaje *= 1.5 // hongos
      if (!peor || puntaje > peor.puntaje) peor = { s, variable, puntaje }
    }
  }
  if (!peor) return null
  const { s, variable } = peor
  const e = s[variable]
  const lado = e.mas_tiempo_fuera as "alto" | "bajo"
  return {
    sala: s.sala,
    variable,
    como_estuvo: comoEstuvo(e) as string,
    promedio: `${coma(e.prom ?? 0)}${unidad(variable)}`,
    rango: e.rango ? `entre ${e.rango[0]} y ${e.rango[1]}${unidad(variable)}` : "",
    que_hacer: QUE_HACER[variable][lado],
    por_que: variable === "humedad" && lado === "alto" && enFlora(s) ? "en flora la humedad alta trae hongos en los cogollos" : null,
  }
}

/** Sugerencia de respaldo (si el modelo no responde). */
export function sugerenciaPorReglas(d: DatosSemana): string {
  const p = prioridad(d)
  if (!p) {
    const sinRiegos = d.salas.filter((s) => s.etapa && s.riegos_cargados === 0).map((s) => s.sala)
    return sinRiegos.length
      ? `Cargar los riegos en la app con EC, pH y runoff: esta semana no hubo ninguno en ${sinRiegos.join(", ")}.`
      : "Semana tranquila: el clima estuvo bien en todas las salas. Seguir así."
  }
  return `En ${p.sala}, la ${p.variable} estuvo ${p.como_estuvo}: en promedio ${p.promedio}, cuando tiene que estar ${p.rango}.${p.por_que ? ` Ojo, ${p.por_que}.` : ""} Para corregirlo: ${p.que_hacer}.`
}

/** Texto de respaldo (si el modelo no responde). */
export function textoPorReglas(d: DatosSemana): string {
  const fecha = (x: string) => `${x.slice(8, 10)}/${x.slice(5, 7)}`
  const parrafos = d.salas
    .filter((s) => s.horas_medidas > 0)
    .map((s) => {
      const partes = (["temperatura", "humedad"] as const).map((v) => {
        const como = comoEstuvo(s[v])
        return como ? `la ${v} estuvo **${como}**, en promedio ${coma(s[v].prom ?? 0)}${unidad(v)}` : `la ${v} estuvo bien`
      })
      return `**${s.sala}**${s.etapa ? `, en ${s.etapa}` : ""}: ${partes.join(" y ")}.`
    })
  return [`Semana del ${fecha(d.desde)} al ${fecha(d.hasta)}.`, ...parrafos].join("\n\n")
}

/** Lo que recibe el modelo: todo ya interpretado en palabras, sin porcentajes que confundan. */
export function datosParaIA(d: DatosSemana) {
  return {
    semana: `del ${d.desde} al ${d.hasta}`,
    salas: d.salas
      .filter((s) => s.horas_medidas > 0)
      .map((s) => ({
        sala: s.sala,
        etapa: s.etapa ?? "sin ciclo",
        ...Object.fromEntries(
          (["temperatura", "humedad"] as const).map((v) => {
            const e = s[v]
            const como = comoEstuvo(e)
            return [
              v,
              {
                como_estuvo: como ?? "bien",
                promedio: e.prom === null ? null : `${coma(e.prom)}${unidad(v)}`,
                minimo: e.min === null ? null : `${coma(e.min)}${unidad(v)}`,
                maximo: e.max === null ? null : `${coma(e.max)}${unidad(v)}`,
                tiene_que_estar: e.rango ? `entre ${e.rango[0]} y ${e.rango[1]}${unidad(v)}` : null,
                que_hacer: como && e.mas_tiempo_fuera ? QUE_HACER[v][e.mas_tiempo_fuera] : null,
              },
            ]
          }),
        ),
        alertas_de_luces: s.alertas.luz,
        riegos_cargados: s.riegos_cargados,
      })),
    nubi: d.nubi,
    ordenes_a_equipos_que_fallaron: d.ordenes_fallidas,
    prioridad_de_la_semana: prioridad(d) ?? "ninguna sala con problemas de clima",
  }
}

const SISTEMA = `Sos Nubi, la IA que vigila el clima de las salas de cultivo de Monarca South (cannabis medicinal en interior). Escribí el resumen de la semana para el equipo, que lo lee en el celular. No todos son técnicos: tiene que entenderlo cualquiera.

CÓMO ESCRIBIRLO
- Español rioplatense, claro, en frases completas. Explayate un poco: explicá qué pasó y qué significa para las plantas en su etapa.
- Un párrafo corto por sala (2 a 4 frases), separado por una línea en blanco. Empezá cada párrafo con el nombre de la sala en **negrita**.
- Usá **negrita** para lo importante: lo que estuvo mal y lo que hay que hacer.
- Evitá los paréntesis. En vez de "humedad alta (prom 65 %)", escribí "la humedad estuvo alta casi toda la semana: en promedio 65 %, cuando tiene que estar entre 45 y 55 %".
- No uses porcentajes de "tiempo en rango" ni listas con guiones. Nada de tablas ni títulos.
- Si algo estuvo "bien", decilo en pocas palabras y seguí.

REGLAS (no las rompas)
- Usá solo los datos que te paso. No inventes números ni causas.
- Respetá SIEMPRE "como_estuvo": si dice "baja", la variable estuvo baja y hay que subirla; si dice "alta", hay que bajarla. Para qué hacer, usá "que_hacer".
- Después de las salas, un párrafo con lo demás, solo si hay algo: salas sin riegos cargados (importa porque sin eso no se ve cómo está la raíz), problemas de luces, lo que propuso Nubi y las órdenes que fallaron.
- Al final, en una línea aparte que empiece exactamente con "SUGERENCIA:", explicá en una o dos frases la "prioridad_de_la_semana" que te paso (no elijas otra): qué sala, qué pasó, por qué importa y qué hacer. Si no hay prioridad de clima, sugerí cargar los riegos o decí que fue una semana tranquila.`

export interface ResumenArmado {
  texto: string
  sugerencia: string
  datos: DatosSemana
  conIA: boolean
}

export async function armarResumen(supabase: SupabaseClient, desde: Date, hasta: Date): Promise<ResumenArmado> {
  const datos = await datosSemana(supabase, desde, hasta)
  const respuesta = await completar(SISTEMA, JSON.stringify(datosParaIA(datos)), 1400)
  if (respuesta) {
    const partes = respuesta.split(/\n?\s*\**SUGERENCIA:?\**:?\s*/i)
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
