// Guardián de luces (pedido de Joaquín, 13/11/2026; idea de supercycler.app).
// Compara la luz que mide el Pulse con el horario de cada sala
// (salas_cultivo.luz_prende / luz_apaga, script 099) y detecta:
//   - "alto": luces prendidas en horario de oscuridad. Lo más grave en flora:
//     interrumpir la noche estresa las plantas y puede dar hermafroditas.
//   - "bajo": las luces no prendieron a su hora (timer roto, corte de luz).
// No avisa por un apagado a mitad del día: en Sala 1 lo hacen a propósito.
// Cálculo puro; el motor lo usa en lib/guardian-luces-aviso.ts.

/** Pulse da la luz como un nivel de 0 a ~100: por encima de esto está prendida. */
export const LUZ_PRENDIDA = 10
/** Alrededor del cambio de horario no se decide nada: timers y lecturas cada 5 minutos se corren un poco. */
export const TOLERANCIA_MIN = 15
/** Para "no prendió": se mira entre 30 y 120 minutos después de la hora de encendido. */
const NO_PRENDIO_DESDE_MIN = 30
const NO_PRENDIO_HASTA_MIN = 120

export interface HorarioLuz {
  prende: string // "HH:MM" o "HH:MM:SS"
  apaga: string
}

export interface LecturaLuz {
  leido_en: string
  luz_lux: number | null
}

export interface ProblemaLuz {
  lado: "alto" | "bajo"
  valor: number
  mensaje: string
}

const DIA = 24 * 60

export function aMinutos(hora: string): number {
  const [h, m] = hora.split(":").map(Number)
  return ((h * 60 + (m || 0)) % DIA + DIA) % DIA
}

export function horaCorta(hora: string): string {
  return hora.slice(0, 5)
}

/** Minuto del día en Argentina. */
export function minutoAR(iso: string | Date): number {
  const d = typeof iso === "string" ? new Date(iso) : iso
  const [h, m] = d
    .toLocaleTimeString("en-GB", { timeZone: "America/Argentina/Buenos_Aires", hour12: false, hour: "2-digit", minute: "2-digit" })
    .split(":")
    .map(Number)
  return (h % 24) * 60 + m
}

/** Minutos desde `desde` hasta `hasta` yendo hacia adelante en el reloj (0..1439). */
const distancia = (desde: number, hasta: number) => (hasta - desde + DIA) % DIA

export function deberiaHaberLuz(minuto: number, h: HorarioLuz): boolean {
  const prende = aMinutos(h.prende)
  const apaga = aMinutos(h.apaga)
  return distancia(prende, minuto) < distancia(prende, apaga)
}

export function cercaDeCambio(minuto: number, h: HorarioLuz, tolerancia = TOLERANCIA_MIN): boolean {
  const cerca = (x: number) => Math.min(distancia(x, minuto), distancia(minuto, x)) <= tolerancia
  return cerca(aMinutos(h.prende)) || cerca(aMinutos(h.apaga))
}

const prendida = (l: LecturaLuz) => l.luz_lux !== null && Number(l.luz_lux) > LUZ_PRENDIDA
const hhmm = (minuto: number) => `${String(Math.floor(minuto / 60)).padStart(2, "0")}:${String(minuto % 60).padStart(2, "0")}`

function recientes(lecturas: LecturaLuz[], ahora: Date, minutos: number): LecturaLuz[] {
  const t = ahora.getTime()
  return lecturas
    .filter((l) => l.luz_lux !== null && t - new Date(l.leido_en).getTime() <= minutos * 60000 && new Date(l.leido_en).getTime() <= t)
    .sort((a, b) => a.leido_en.localeCompare(b.leido_en))
}

/** ¿Hay un problema de luces ahora? */
export function revisarLuz(lecturas: LecturaLuz[], h: HorarioLuz, ahora: Date = new Date()): ProblemaLuz | null {
  const oscuridad = `${horaCorta(h.apaga)} a ${horaCorta(h.prende)}`

  // Prendidas de noche: las 2 últimas lecturas (≥ 10 minutos) con luz, en horario de oscuridad.
  const ultimas = recientes(lecturas, ahora, 12).slice(-2)
  if (
    ultimas.length === 2 &&
    ultimas.every((l) => prendida(l) && !deberiaHaberLuz(minutoAR(l.leido_en), h) && !cercaDeCambio(minutoAR(l.leido_en), h))
  ) {
    return {
      lado: "alto",
      valor: Number(ultimas[1].luz_lux),
      mensaje: `luces prendidas a las ${hhmm(minutoAR(ultimas[0].leido_en))}, en horario de oscuridad (${oscuridad})`,
    }
  }

  // No prendieron: entre 30 y 120 minutos después de la hora, todo oscuro desde la hora + 15.
  const desdeQuePrende = distancia(aMinutos(h.prende), minutoAR(ahora))
  if (desdeQuePrende >= NO_PRENDIO_DESDE_MIN && desdeQuePrende <= NO_PRENDIO_HASTA_MIN && deberiaHaberLuz(minutoAR(ahora), h)) {
    const desde = recientes(lecturas, ahora, desdeQuePrende - TOLERANCIA_MIN)
    if (desde.length >= 3 && desde.every((l) => !prendida(l))) {
      return { lado: "bajo", valor: Number(desde[desde.length - 1].luz_lux), mensaje: `las luces no prendieron a las ${horaCorta(h.prende)}` }
    }
  }
  return null
}

/** ¿Se resolvió la alerta abierta? null si no hay lecturas recientes para saberlo. */
export function luzVolvioANormal(lecturas: LecturaLuz[], lado: "alto" | "bajo", ahora: Date = new Date()): boolean | null {
  const ultimas = recientes(lecturas, ahora, 12).slice(-2)
  if (ultimas.length === 0) return null
  return lado === "alto" ? ultimas.length === 2 && ultimas.every((l) => !prendida(l)) : prendida(ultimas[ultimas.length - 1])
}
