// Nubi decide con IA (pedido de Joaquín, 14/11/2026), con lo del curso de AI
// Engineering:
//   - Chain, no agente (clase 6): el problema es acotado, así que se le pasa
//     todo el contexto ya armado en palabras, sin que salga a buscar datos.
//   - System prompt con criterios, few-shot y un análisis antes de decidir
//     (Chain-of-Thought), con salida en formato fijo (Structured Outputs) (clase 2).
//   - Guardrails en el servidor (clase 6, producción): la IA no puede pedir
//     nada fuera de lo permitido; si se pasa, se descarta.
//   - Human-in-the-loop (clase 7): solo PROPONE; una persona aprueba.
//   - Memoria (clases 3 y 7): ve lo que propuso antes y qué le respondieron.
// Cálculo puro: lo usan lib/nubi-aviso.ts (motor) y los evals.
import type { RangoClima } from "@/lib/clima-alertas"
import type { EstadoAire, EstadoOnOff, Propuesta } from "@/lib/nubi"
import { SETPOINT_MAX, SETPOINT_MIN, textoEstadoAire, textoEstadoOnOff } from "@/lib/nubi"

// --- Lo que ve la IA ----------------------------------------------------------

export interface EquipoEnSala {
  id: number
  tipo: "aire_acondicionado" | "deshumidificador"
  estado: EstadoAire | EstadoOnOff
  estadoReal: boolean
  ultimaOrdenHaceMin: number | null
}

export interface DecisionReciente {
  haceMin: number
  propuso: string
  respuesta: "mandada" | "descartada" | "venció sin respuesta" | "pendiente" | "aviso"
  quien: string | null
  /** Para los guardrails: a qué equipo y con qué orden (no se le muestra a la IA). */
  dispositivoId?: number
  payload?: Record<string, unknown> | null
}

export interface EntradaContexto {
  sala: string
  rango: RangoClima
  horaAR: string
  luces: { horario: string | null; prendidas: boolean | null }
  ahora: { temperatura: number | null; humedad: number | null; haceMin: number | null }
  /** Lecturas de la última hora, de la más vieja a la más nueva. */
  ultimaHora: { temperatura: number | null; humedad: number | null }[]
  alertas: string[]
  equipos: EquipoEnSala[]
  recientes: DecisionReciente[]
}

const coma = (n: number) => String(Math.round(n * 10) / 10).replace(".", ",")

function tendencia(valores: (number | null)[], unidad: string): string {
  const v = valores.filter((x): x is number => x !== null)
  if (v.length < 3) return "sin datos suficientes"
  const dif = v[v.length - 1] - v[0]
  const umbral = unidad === "°C" ? 0.4 : 2
  if (Math.abs(dif) < umbral) return "estable"
  return `${dif > 0 ? "subiendo" : "bajando"} ${coma(Math.abs(dif))} ${unidad} en la última hora`
}

const nombreEquipo = (t: EquipoEnSala["tipo"]) => (t === "aire_acondicionado" ? "aire" : "deshumidificador")

/** El contexto en palabras: lo que recibe el modelo. */
export function armarContexto(e: EntradaContexto) {
  const t = e.ultimaHora.map((l) => l.temperatura)
  const h = e.ultimaHora.map((l) => l.humedad)
  const extremos = (v: (number | null)[], u: string) => {
    const ok = v.filter((x): x is number => x !== null)
    return ok.length ? `entre ${coma(Math.min(...ok))} y ${coma(Math.max(...ok))} ${u}` : "sin datos"
  }
  return {
    sala: e.sala,
    etapa: e.rango.etapa,
    hora: e.horaAR,
    luces: e.luces.horario
      ? `horario de luz ${e.luces.horario}; ahora ${e.luces.prendidas === null ? "sin dato" : e.luces.prendidas ? "prendidas" : "apagadas"}`
      : "sin horario cargado",
    rango_de_la_etapa: {
      temperatura: `entre ${e.rango.temperatura[0]} y ${e.rango.temperatura[1]} °C`,
      humedad: `entre ${e.rango.humedad[0]} y ${e.rango.humedad[1]} %`,
    },
    ahora:
      e.ahora.temperatura === null && e.ahora.humedad === null
        ? "sin lecturas del Pulse en la última hora"
        : {
            temperatura: e.ahora.temperatura === null ? null : `${coma(e.ahora.temperatura)} °C`,
            humedad: e.ahora.humedad === null ? null : `${Math.round(e.ahora.humedad)} %`,
            medido_hace: e.ahora.haceMin === null ? null : `${e.ahora.haceMin} min`,
          },
    ultima_hora: {
      temperatura: `${extremos(t, "°C")}, ${tendencia(t, "°C")}`,
      humedad: `${extremos(h, "%")}, ${tendencia(h, "%")}`,
    },
    alertas_abiertas: e.alertas.length ? e.alertas : "ninguna",
    equipos: e.equipos.map((q) => ({
      equipo: nombreEquipo(q.tipo),
      estado:
        q.tipo === "aire_acondicionado"
          ? textoEstadoAire(q.estado as EstadoAire)
          : textoEstadoOnOff(q.estado as EstadoOnOff),
      como_se_sabe: q.estadoReal ? "estado real informado por el equipo" : "última orden cumplida (el equipo no informa su estado)",
      ultima_orden: q.ultimaOrdenHaceMin === null ? "nunca" : `hace ${q.ultimaOrdenHaceMin} min`,
      que_puede_hacer:
        q.tipo === "aire_acondicionado"
          ? `encender en frío entre ${SETPOINT_MIN} y ${SETPOINT_MAX} °C, o apagar (no tiene calor ni ventilador)`
          : "prender o apagar",
    })),
    lo_que_propuso_nubi_hace_poco: e.recientes.length
      ? e.recientes.map((r) => `hace ${r.haceMin} min propuso "${r.propuso}": ${r.respuesta}${r.quien ? ` por ${r.quien}` : ""}`)
      : "nada en las últimas 6 horas",
  }
}

// --- Filtro antes de la IA (ahorro de tokens, 14/11/2026) ---------------------
// Algo fijo y barato decide si vale la pena consultar al modelo. Con la sala
// tranquila, la IA igual contestaría "nada": se la consulta solo si algo se
// mueve, y una vez por hora como control.

/** Qué tan cerca del borde del rango ya amerita pensar. */
export const MARGEN_C = 0.5
export const MARGEN_HUMEDAD = 2
/** Cuánto movimiento en la última hora ya amerita pensar. */
export const MOVIMIENTO_C = 0.8
export const MOVIMIENTO_HUMEDAD = 4

/** Por qué conviene consultar a la IA ahora, o null si la sala está tranquila. */
export function motivoParaPensar(e: EntradaContexto, ahora: Date): string | null {
  if (e.alertas.length) return "hay alertas abiertas"
  const [tMin, tMax] = e.rango.temperatura
  const [hMin, hMax] = e.rango.humedad
  const t = e.ahora.temperatura
  const h = e.ahora.humedad
  if (t !== null && (t < tMin + MARGEN_C || t > tMax - MARGEN_C)) return "la temperatura está cerca del borde del rango"
  if (h !== null && (h < hMin + MARGEN_HUMEDAD || h > hMax - MARGEN_HUMEDAD)) return "la humedad está cerca del borde del rango"
  const cambio = (v: (number | null)[]) => {
    const ok = v.filter((x): x is number => x !== null)
    return ok.length >= 2 ? Math.abs(ok[ok.length - 1] - ok[0]) : 0
  }
  if (cambio(e.ultimaHora.map((l) => l.temperatura)) >= MOVIMIENTO_C) return "la temperatura se está moviendo"
  if (cambio(e.ultimaHora.map((l) => l.humedad)) >= MOVIMIENTO_HUMEDAD) return "la humedad se está moviendo"
  if (e.equipos.some((q) => q.estado.tipo === "prendido" && q.estado.sinConsumoDesde)) return "un equipo prendido no consume"
  if (e.recientes.some((r) => r.haceMin < 30 && r.respuesta !== "aviso")) return "hubo una propuesta hace poco"
  if (ahora.getUTCMinutes() < 5) return "control de cada hora"
  return null
}

// --- Prompt (system + few-shot) ----------------------------------------------

export const SISTEMA_NUBI = `Sos Nubi, la IA que cuida el clima de las salas de cultivo de Monarca South (cannabis medicinal en interior, coco, LED). Cada tanto mirás una sala y decidís si conviene proponerle al equipo un cambio en sus equipos. Vos solo PROPONÉS: una persona lo aprueba o lo descarta.

OBJETIVO
Mantener la temperatura y la humedad dentro del rango de la etapa, sin tocar los equipos de más.

CRITERIOS
- Si todo está en rango y estable, la respuesta correcta es no hacer nada. No propongas cambios por diferencias chicas dentro del rango.
- En flora, la humedad del lado bajo del rango es lo mejor (menos hongos en los cogollos). Con el deshumidificador prendido y la humedad en rango, dejalo andando. Proponé apagarlo solo si la humedad bajó del mínimo.
- Proponé prender el deshumidificador si la humedad está arriba del máximo o subiendo rápido hacia él.
- Aire: si la temperatura pasa el máximo, proponé encenderlo en frío o bajarlo; cuanto más se pasó, más fuerte el ajuste. Si baja del mínimo con el aire prendido, proponé subirlo o apagarlo. El aire no tiene calor.
- Mirá la tendencia: si ya está volviendo al rango sola o por una orden reciente, esperá.
- Después de una orden a un equipo, esperá al menos 10 minutos para ver el efecto antes de proponer otra cosa en ese equipo.
- Respetá al equipo: si hace poco descartaron una propuesta, no la repitas salvo que la situación haya empeorado claramente.
- Si algo no cierra (por ejemplo, el aire en frío al mínimo y la sala no baja), avisá en vez de proponer una orden. El aviso de un equipo prendido sin consumir lo manda el sistema aparte: no lo repitas.
- Si faltan lecturas del Pulse, no propongas órdenes.
- Una sola propuesta por vez: la más importante.

RANGOS DE MONARCA (para entender el contexto; el de la sala viene en cada consulta)
- Vege: 24 a 28 °C, humedad 60 a 70 %.
- Madres y esquejes (Sala 3): 24 a 28 °C, humedad 60 a 75 %.
- Flora: 22 a 26 °C, humedad 45 a 55 %.
- Últimas 2 semanas de flora: 20 a 24 °C, humedad 40 a 50 %.
- Secado: 19 a 21 °C, humedad 50 a 60 %. En secado, los cambios bruscos arruinan el curado: ajustá de a poco.

EQUIPOS
- El aire se maneja por infrarrojo desde la app: su estado es la última orden cumplida, no lo informa el equipo. Solo enfría: frío entre 16 y 30 °C con ventilador automático, o apagado.
- El deshumidificador se prende y apaga con un enchufe inteligente que informa su estado real y su consumo. Prendido y andando consume unos 500 a 600 W.
- Bajar el aire también baja un poco la humedad; prender el deshumidificador sube un poco la temperatura de la sala.
- Con las luces apagadas la sala se enfría sola y la humedad suele subir: tenelo en cuenta antes de bajar el aire de noche.

CÓMO RESPONDER
Primero escribí "analisis": 2 a 4 frases sobre cómo está la sala, hacia dónde va y qué hacen los equipos. Después decidí:
- "nada": no hace falta tocar nada.
- "proponer": una orden para un equipo (equipo, accion y, para encender el aire, setpoint).
- "avisar": algo que el equipo tiene que mirar, sin orden.
"titulo": la propuesta o el aviso en pocas palabras, en minúscula, por ejemplo "prender el deshumidificador" o "bajar el aire a 21 °C".
"explicacion": para el equipo, en español rioplatense, claro, 1 o 2 frases, sin paréntesis, con los números que importan y por qué conviene.

EJEMPLOS
1) Flora, humedad 50 % (rango 45 a 55), bajando; deshumidificador prendido consumiendo 560 W.
→ nada. La humedad está en la parte baja del rango, que en flora es lo mejor: dejar el deshumidificador andando.
2) Flora, humedad 62 % y subiendo; deshumidificador apagado; alerta de humedad abierta.
→ proponer: deshumidificador, encender. "La humedad está en 62 % y sigue subiendo, arriba del máximo de 55: prenderlo para evitar hongos."
3) Flora, temperatura 27,6 °C (rango 22 a 26) subiendo; aire en frío 23 °C hace 40 min.
→ proponer: aire, encender, setpoint 21. "Hace calor y sigue subiendo aunque el aire está en 23: bajarlo a 21."
4) Flora, humedad 58 %; hace 15 min descartaron "prender el deshumidificador"; estable.
→ nada. Lo descartaron hace poco y no empeoró.
5) Flora, temperatura 28,4 °C subiendo; aire en frío 16 °C hace 50 min.
→ avisar: "el aire no alcanza". "El aire ya está en el mínimo de 16 °C y la sala sigue subiendo, va por 28,4 °C: revisen el aire o si entra calor de otro lado."`

// --- Formato fijo de la respuesta (Structured Outputs) -----------------------

export interface DecisionIA {
  analisis: string
  decision: "nada" | "proponer" | "avisar"
  equipo: "aire" | "deshumidificador" | null
  accion: "encender" | "apagar" | null
  setpoint: number | null
  titulo: string
  explicacion: string
}

export const ESQUEMA_DECISION = {
  type: "object",
  additionalProperties: false,
  required: ["analisis", "decision", "equipo", "accion", "setpoint", "titulo", "explicacion"],
  properties: {
    analisis: { type: "string" },
    decision: { type: "string", enum: ["nada", "proponer", "avisar"] },
    equipo: { type: ["string", "null"], enum: ["aire", "deshumidificador", null] },
    accion: { type: ["string", "null"], enum: ["encender", "apagar", null] },
    setpoint: { type: ["integer", "null"] },
    titulo: { type: "string" },
    explicacion: { type: "string" },
  },
} as const

// --- Guardrails ---------------------------------------------------------------

export type Validacion =
  | { ok: true; tipo: "nada" }
  | { ok: true; tipo: "orden"; dispositivoId: number; propuesta: Extract<Propuesta, { tipo: "orden" }> }
  | { ok: true; tipo: "aviso"; dispositivoId: number | null; propuesta: Extract<Propuesta, { tipo: "aviso" }> }
  | { ok: false; motivo: string }

/** Revisa lo que decidió la IA contra lo permitido. Nada sale de acá sin pasar estos límites. */
export function validarDecision(d: DecisionIA, equipos: EquipoEnSala[], recientes: DecisionReciente[]): Validacion {
  if (!d || typeof d !== "object") return { ok: false, motivo: "respuesta sin formato" }
  if (d.decision === "nada") return { ok: true, tipo: "nada" }
  const titulo = String(d.titulo ?? "").trim().slice(0, 120)
  const explicacion = String(d.explicacion ?? "").trim().slice(0, 600)
  if (!titulo || !explicacion) return { ok: false, motivo: "falta el título o la explicación" }

  if (d.decision === "avisar") {
    const avisos = recientes.filter((r) => r.respuesta === "aviso")
    if (avisos.some((r) => r.haceMin < 60)) return { ok: false, motivo: "ya salió un aviso de esta sala en la última hora" }
    if (avisos.some((r) => r.haceMin < 180 && r.propuso.toLowerCase().startsWith(titulo.toLowerCase()))) {
      return { ok: false, motivo: "el mismo aviso ya salió en las últimas 3 horas" }
    }
    const equipo = equipos.find((q) => d.equipo && (q.tipo === "aire_acondicionado" ? "aire" : "deshumidificador") === d.equipo)
    return { ok: true, tipo: "aviso", dispositivoId: equipo?.id ?? equipos[0]?.id ?? null, propuesta: { tipo: "aviso", resumen: `${titulo}. ${explicacion}` } }
  }

  if (d.decision !== "proponer") return { ok: false, motivo: `decisión desconocida: ${String(d.decision)}` }
  const equipo = equipos.find((q) => (q.tipo === "aire_acondicionado" ? "aire" : "deshumidificador") === d.equipo)
  if (!equipo) return { ok: false, motivo: `la sala no tiene ${d.equipo ?? "ese equipo"}` }
  if (d.accion !== "encender" && d.accion !== "apagar") return { ok: false, motivo: "acción inválida" }
  if (equipo.ultimaOrdenHaceMin !== null && equipo.ultimaOrdenHaceMin < 10) {
    return { ok: false, motivo: "hubo una orden a ese equipo hace menos de 10 minutos" }
  }

  let payload: Record<string, unknown>
  if (equipo.tipo === "aire_acondicionado") {
    if (d.accion === "apagar") {
      if (equipo.estado.tipo === "apagado") return { ok: false, motivo: "el aire ya está apagado" }
      payload = { accion: "apagar" }
    } else {
      const sp = Number(d.setpoint)
      if (!Number.isInteger(sp) || sp < SETPOINT_MIN || sp > SETPOINT_MAX) {
        return { ok: false, motivo: `setpoint fuera de lo permitido (${SETPOINT_MIN} a ${SETPOINT_MAX} °C)` }
      }
      if (equipo.estado.tipo === "frio" && equipo.estado.setpoint === sp) return { ok: false, motivo: `el aire ya está en frío ${sp} °C` }
      payload = { accion: "encender", modo: "frio", setpoint: sp, fan: "auto" }
    }
  } else {
    if (d.setpoint !== null && d.setpoint !== undefined) return { ok: false, motivo: "el deshumidificador no tiene setpoint" }
    if (d.accion === "encender" && equipo.estado.tipo === "prendido") return { ok: false, motivo: "el deshumidificador ya está prendido" }
    if (d.accion === "apagar" && equipo.estado.tipo === "apagado") return { ok: false, motivo: "el deshumidificador ya está apagado" }
    payload = { accion: d.accion }
  }

  const mismaOrden = (r: DecisionReciente) =>
    r.dispositivoId !== undefined && r.payload ? r.dispositivoId === equipo.id && JSON.stringify(r.payload) === JSON.stringify(payload) : r.propuso === titulo
  const rechazadaHacePoco = recientes.some(
    (r) => (r.respuesta === "descartada" || r.respuesta === "venció sin respuesta") && r.haceMin < 60 && mismaOrden(r),
  )
  if (rechazadaHacePoco) return { ok: false, motivo: "esa misma propuesta se descartó o venció hace menos de una hora" }

  return { ok: true, tipo: "orden", dispositivoId: equipo.id, propuesta: { tipo: "orden", payload, resumen: titulo } }
}

/** El texto que va como "motivo" de la propuesta: la explicación para el equipo. */
export function motivoDe(d: DecisionIA): string {
  return String(d.explicacion ?? "").trim().replace(/\.$/, "")
}
