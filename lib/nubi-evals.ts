// Evals de Nubi (clase de evaluación del curso): escenarios fijos con la
// respuesta esperada, distintos de los ejemplos del prompt para no medir de
// memoria. Se corren desde Control manual (app/api/nubi/evals) cuando se cambia
// el prompt o el modelo, y dan un puntaje. Se evalúa lo que sale DESPUÉS de los
// guardrails, que es lo que le llegaría al equipo.
import type { EntradaContexto, EquipoEnSala, Validacion } from "@/lib/nubi-ia"

export interface Esperado {
  decision: "nada" | "proponer" | "avisar"
  equipo?: "aire" | "deshumidificador"
  accion?: "encender" | "apagar"
  /** Setpoint aceptable, ambos inclusive. */
  setpoint?: [number, number]
}

export interface Escenario {
  nombre: string
  entrada: EntradaContexto
  /** Vale cualquiera de estas respuestas. */
  esperado: Esperado[]
}

const FLORA = { etapa: "flora", temperatura: [22, 26] as [number, number], humedad: [45, 55] as [number, number] }
const FINAL = { etapa: "últimas 2 semanas de flora", temperatura: [20, 24] as [number, number], humedad: [40, 50] as [number, number] }
const VEGE = { etapa: "vege", temperatura: [24, 28] as [number, number], humedad: [60, 70] as [number, number] }
const SECADO = { etapa: "secado", temperatura: [19, 21] as [number, number], humedad: [50, 60] as [number, number] }

const aire = (estado: EquipoEnSala["estado"], ultimaOrdenHaceMin: number | null = 90): EquipoEnSala => ({ id: 1, tipo: "aire_acondicionado", estado, estadoReal: false, ultimaOrdenHaceMin })
const deshu = (prendido: boolean, ultimaOrdenHaceMin: number | null = 90): EquipoEnSala => ({
  id: 2,
  tipo: "deshumidificador",
  estado: prendido ? { tipo: "prendido", potenciaW: 555, sinConsumoDesde: null } : { tipo: "apagado" },
  estadoReal: true,
  ultimaOrdenHaceMin,
})
/** Una hora de lecturas que va de `desde` a `hasta`. */
const hora = (t: [number, number], h: [number, number]) =>
  Array.from({ length: 12 }, (_, i) => ({ temperatura: t[0] + ((t[1] - t[0]) * i) / 11, humedad: h[0] + ((h[1] - h[0]) * i) / 11 }))

function sala(p: Partial<EntradaContexto> & Pick<EntradaContexto, "rango" | "ultimaHora" | "equipos">): EntradaContexto {
  const ultima = p.ultimaHora[p.ultimaHora.length - 1]
  return {
    sala: "Sala de prueba",
    horaAR: "14:00",
    luces: { horario: "de 08:00 a 20:00", prendidas: true },
    ahora: { temperatura: ultima?.temperatura ?? null, humedad: ultima?.humedad ?? null, haceMin: 2 },
    alertas: [],
    recientes: [],
    ...p,
  }
}

export const ESCENARIOS: Escenario[] = [
  {
    nombre: "Vege en rango con todo andando: no tocar",
    entrada: sala({ rango: VEGE, ultimaHora: hora([26.2, 26], [65, 64]), equipos: [aire({ tipo: "frio", setpoint: 24 }), deshu(false)] }),
    esperado: [{ decision: "nada" }],
  },
  {
    nombre: "Flora con humedad 47 % y deshumidificador prendido: dejarlo",
    entrada: sala({ rango: FLORA, ultimaHora: hora([24, 24.1], [49, 47]), equipos: [deshu(true)] }),
    esperado: [{ decision: "nada" }],
  },
  {
    nombre: "Flora con humedad 41 % bajando y deshumidificador prendido: apagarlo",
    entrada: sala({ rango: FLORA, ultimaHora: hora([24, 24], [45, 41]), equipos: [deshu(true)], alertas: ["humedad baja: 41 %, el mínimo es 45 %, desde hace 18 min"] }),
    esperado: [{ decision: "proponer", equipo: "deshumidificador", accion: "apagar" }],
  },
  {
    nombre: "Final de flora con humedad 53 % subiendo: prender el deshumidificador",
    entrada: sala({ rango: FINAL, ultimaHora: hora([22, 22.2], [49, 53]), equipos: [deshu(false)], alertas: ["humedad alta: 53 %, el máximo es 50 %, desde hace 16 min"] }),
    esperado: [{ decision: "proponer", equipo: "deshumidificador", accion: "encender" }],
  },
  {
    nombre: "Flora a 29,5 °C subiendo con el aire apagado: encenderlo bien frío",
    entrada: sala({ rango: FLORA, ultimaHora: hora([28.4, 29.5], [52, 51]), equipos: [aire({ tipo: "apagado" })], alertas: ["temperatura alta: 29,5 °C, el máximo es 26 °C, desde hace 20 min"] }),
    esperado: [{ decision: "proponer", equipo: "aire", accion: "encender", setpoint: [16, 22] }],
  },
  {
    nombre: "Flora a 21 °C bajando con el aire en 19: subirlo o apagarlo",
    entrada: sala({ rango: FLORA, ultimaHora: hora([22.3, 21], [50, 50]), equipos: [aire({ tipo: "frio", setpoint: 19 })], alertas: ["temperatura baja: 21 °C, el mínimo es 22 °C, desde hace 17 min"] }),
    esperado: [
      { decision: "proponer", equipo: "aire", accion: "encender", setpoint: [20, 26] },
      { decision: "proponer", equipo: "aire", accion: "apagar" },
    ],
  },
  {
    nombre: "Secado a 23 °C con el aire en 20: bajarlo",
    entrada: sala({ rango: SECADO, ultimaHora: hora([22.6, 23], [55, 56]), equipos: [aire({ tipo: "frio", setpoint: 20 })], alertas: ["temperatura alta: 23 °C, el máximo es 21 °C, desde hace 25 min"] }),
    esperado: [{ decision: "proponer", equipo: "aire", accion: "encender", setpoint: [16, 19] }],
  },
  {
    nombre: "Flora a 27 °C pero bajando rápido tras bajar el aire hace 12 min: esperar",
    entrada: sala({ rango: FLORA, ultimaHora: hora([28.6, 27], [50, 50]), equipos: [aire({ tipo: "frio", setpoint: 20 }, 12)], alertas: ["temperatura alta: 27 °C, el máximo es 26 °C, desde hace 40 min"] }),
    esperado: [{ decision: "nada" }],
  },
  {
    nombre: "Sin lecturas del Pulse: no proponer órdenes",
    entrada: sala({ rango: FLORA, ultimaHora: [], ahora: { temperatura: null, humedad: null, haceMin: null }, equipos: [aire({ tipo: "frio", setpoint: 22 }), deshu(true)] }),
    esperado: [{ decision: "nada" }, { decision: "avisar" }],
  },
  {
    nombre: "Humedad 57 % estable y hace 25 min descartaron prender el deshumidificador: no insistir",
    entrada: sala({
      rango: FLORA,
      ultimaHora: hora([24, 24], [57, 57]),
      equipos: [deshu(false)],
      alertas: ["humedad alta: 57 %, el máximo es 55 %, desde hace 40 min"],
      recientes: [{ haceMin: 25, propuso: "prender el deshumidificador", respuesta: "descartada", quien: "Facundo", dispositivoId: 2, payload: { accion: "encender" } }],
    }),
    esperado: [{ decision: "nada" }],
  },
]

/** ¿La respuesta (ya pasada por los guardrails) es una de las esperadas? */
export function cumple(v: Validacion, equipos: EquipoEnSala[], esperado: Esperado[]): boolean {
  // Si los guardrails la frenaron, al equipo no le llega nada: cuenta como "nada".
  const real = !v.ok || v.tipo === "nada" ? { decision: "nada" as const } : null
  return esperado.some((e) => {
    if (real) return e.decision === "nada"
    if (v.ok && v.tipo === "aviso") return e.decision === "avisar"
    if (!v.ok || v.tipo !== "orden" || e.decision !== "proponer") return false
    const equipo = equipos.find((q) => q.id === v.dispositivoId)
    const nombre = equipo?.tipo === "aire_acondicionado" ? "aire" : "deshumidificador"
    if (e.equipo && e.equipo !== nombre) return false
    const payload = v.propuesta.payload as { accion?: string; setpoint?: number }
    if (e.accion && e.accion !== payload.accion) return false
    if (e.setpoint && (payload.setpoint === undefined || payload.setpoint < e.setpoint[0] || payload.setpoint > e.setpoint[1])) return false
    return true
  })
}

/** Cómo quedó una respuesta, en palabras, para mostrar en el resultado de los evals. */
export function describir(v: Validacion): string {
  if (!v.ok) return `frenada por los controles: ${v.motivo}`
  if (v.tipo === "nada") return "nada"
  if (v.tipo === "aviso") return `aviso: ${v.propuesta.resumen}`
  return `propone: ${v.propuesta.resumen}`
}
