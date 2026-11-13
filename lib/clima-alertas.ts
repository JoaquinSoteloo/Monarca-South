// Alertas de clima (pedido de Joaquín, 13/11/2026): cuándo una sala está fuera
// del rango de temperatura o humedad de su etapa. Cálculo puro, sin base ni
// push: lo usan el motor (lib/clima-alertas-aviso.ts, que avisa al celular) y
// los tests. Los rangos son los mismos que muestra la ficha de la sala
// (objetivos() en lib/ciclo.ts y la Sede 3D).
import { momentoCiclo, type CicloSala } from "@/lib/ciclo"

export type VariableClima = "temperatura" | "humedad"
export type Lado = "alto" | "bajo"

export interface RangoClima {
  /** Etapa en palabras, para el aviso ("flora", "últimas 2 semanas de flora"…). */
  etapa: string
  temperatura: [number, number]
  humedad: [number, number]
}

/** La sala de vege con madres no tiene ciclo: rango fijo (igual que la Sede 3D). */
export const SALA_MADRES = "Sala 3"

/** Rango de la etapa en que está la sala hoy, o null si no hay nada que vigilar (sala libre, limpieza…). */
export function rangoClima(salaNombre: string, ciclo: CicloSala | null, hoy: string): RangoClima | null {
  if (!ciclo) {
    return salaNombre === SALA_MADRES ? { etapa: "madres y esquejes", temperatura: [24, 28], humedad: [60, 75] } : null
  }
  const m = momentoCiclo(ciclo, hoy)
  if (m.fase === "vegetativo") return { etapa: "vege", temperatura: [24, 28], humedad: [60, 70] }
  if (m.fase === "floracion" || m.fase === "lavado") {
    return m.diaFase > ciclo.dias_flora - 14
      ? { etapa: "últimas 2 semanas de flora", temperatura: [20, 24], humedad: [40, 50] }
      : { etapa: "flora", temperatura: [22, 26], humedad: [45, 55] }
  }
  // Secado: 20 °C y 55 %, con el mismo margen que usa la ficha (1 °C y 5 %).
  if (m.fase === "secado") return { etapa: "secado", temperatura: [19, 21], humedad: [50, 60] }
  return null
}

export interface LecturaClima {
  leido_en: string
  temperatura_c: number | null
  humedad_rh: number | null
}

export interface ProblemaClima {
  variable: VariableClima
  lado: Lado
  /** Última lectura, redondeada como se muestra. */
  valor: number
  /** El borde del rango que se pasó. */
  limite: number
}

/** Cuánto tiene que durar fuera de rango para avisar: un pico de 5 minutos no es un problema. */
export const MINUTOS_SOSTENIDO = 15
/** Con lecturas cada 5 minutos, mirar los últimos 20 da 3 o 4 lecturas. */
const VENTANA_MIN = 20
/** Si la última lectura es más vieja que esto, el sensor está sin conexión: no se decide nada. */
const FRESCA_MIN = 12

// Se compara el número que se muestra (si dice 26,0 °C no está "alto" con máximo 26).
const redondear = (variable: VariableClima, v: number) =>
  variable === "temperatura" ? Math.round(v * 10) / 10 : Math.round(v)

function valorDe(l: LecturaClima, variable: VariableClima): number | null {
  const v = variable === "temperatura" ? l.temperatura_c : l.humedad_rh
  return v === null || v === undefined || !Number.isFinite(Number(v)) ? null : redondear(variable, Number(v))
}

function ladoDe(valor: number, [min, max]: [number, number]): Lado | null {
  return valor > max ? "alto" : valor < min ? "bajo" : null
}

/** Lecturas de la ventana, de la más vieja a la más nueva. null si el sensor no está mandando. */
function recientes(lecturas: LecturaClima[], ahora: Date): LecturaClima[] | null {
  const t = ahora.getTime()
  const enVentana = lecturas
    .filter((l) => {
      const edad = (t - new Date(l.leido_en).getTime()) / 60000
      return edad >= 0 && edad <= VENTANA_MIN
    })
    .sort((a, b) => a.leido_en.localeCompare(b.leido_en))
  const ultima = enVentana[enVentana.length - 1]
  if (!ultima || (t - new Date(ultima.leido_en).getTime()) / 60000 > FRESCA_MIN) return null
  return enVentana
}

/**
 * Variables que estuvieron fuera de rango, del mismo lado, en todas las lecturas
 * de los últimos 20 minutos (al menos 3, o sea ~15 minutos seguidos).
 */
export function problemasDeSala(lecturas: LecturaClima[], rango: RangoClima, ahora: Date = new Date()): ProblemaClima[] {
  const ventana = recientes(lecturas, ahora)
  if (!ventana || ventana.length < 3) return []
  const problemas: ProblemaClima[] = []
  for (const variable of ["temperatura", "humedad"] as const) {
    const valores = ventana.map((l) => valorDe(l, variable))
    if (valores.some((v) => v === null)) continue
    const lados = (valores as number[]).map((v) => ladoDe(v, rango[variable]))
    const lado = lados[0]
    if (!lado || lados.some((l) => l !== lado)) continue
    const valor = valores[valores.length - 1] as number
    problemas.push({ variable, lado, valor, limite: lado === "alto" ? rango[variable][1] : rango[variable][0] })
  }
  return problemas
}

/**
 * true si la variable volvió al rango: las 2 últimas lecturas adentro (una sola
 * podría ser un pico). false si sigue afuera; null si el sensor no está mandando.
 */
export function volvioAlRango(lecturas: LecturaClima[], rango: RangoClima, variable: VariableClima, ahora: Date = new Date()): boolean | null {
  const ventana = recientes(lecturas, ahora)
  if (!ventana) return null
  const ultimas = ventana.slice(-2).map((l) => valorDe(l, variable))
  if (ultimas.length < 2 || ultimas.some((v) => v === null)) return null
  return ultimas.every((v) => ladoDe(v as number, rango[variable]) === null)
}

const formato = (variable: VariableClima, v: number) =>
  variable === "temperatura" ? `${v.toFixed(1).replace(".", ",")} °C` : `${Math.round(v)} %`

/** "humedad 72 % (máx 55)" — lo que dice Nubi y la notificación. */
export function textoProblema(p: Pick<ProblemaClima, "variable" | "lado" | "valor" | "limite">): string {
  return `${p.variable} ${formato(p.variable, p.valor)} (${p.lado === "alto" ? "máx" : "mín"} ${p.limite})`
}

/** Texto cuando vuelve: "la humedad volvió al rango (54 %)". */
export function textoResuelto(variable: VariableClima, valor: number | null): string {
  return `la ${variable} volvió al rango${valor === null ? "" : ` (${formato(variable, valor)})`}`
}

export function ultimoValor(lecturas: LecturaClima[], variable: VariableClima): number | null {
  const ordenadas = [...lecturas].sort((a, b) => b.leido_en.localeCompare(a.leido_en))
  for (const l of ordenadas) {
    const v = valorDe(l, variable)
    if (v !== null) return v
  }
  return null
}
