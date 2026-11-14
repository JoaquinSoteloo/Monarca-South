import { describe, expect, it } from "vitest"
import { armarContexto, validarDecision, type DecisionIA, type EquipoEnSala } from "./nubi-ia"
import { ESCENARIOS, cumple } from "./nubi-evals"
import { tocaPensar } from "./nubi-pensar"

const aire: EquipoEnSala = { id: 1, tipo: "aire_acondicionado", estado: { tipo: "frio", setpoint: 23 }, estadoReal: false, ultimaOrdenHaceMin: 40 }
const deshu: EquipoEnSala = { id: 2, tipo: "deshumidificador", estado: { tipo: "prendido", potenciaW: 560, sinConsumoDesde: null }, estadoReal: true, ultimaOrdenHaceMin: 90 }
const d = (x: Partial<DecisionIA>): DecisionIA => ({
  analisis: "…",
  decision: "proponer",
  equipo: "aire",
  accion: "encender",
  setpoint: 21,
  titulo: "bajar el aire a 21 °C",
  explicacion: "Hace calor.",
  ...x,
})

describe("guardrails de Nubi", () => {
  it("deja pasar una orden válida y arma el payload de siempre", () => {
    expect(validarDecision(d({}), [aire, deshu], [])).toEqual({
      ok: true,
      tipo: "orden",
      dispositivoId: 1,
      propuesta: { tipo: "orden", payload: { accion: "encender", modo: "frio", setpoint: 21, fan: "auto" }, resumen: "bajar el aire a 21 °C" },
    })
  })
  it("frena setpoints fuera de 16 a 30, decimales y el mismo que ya tiene", () => {
    expect(validarDecision(d({ setpoint: 14 }), [aire], []).ok).toBe(false)
    expect(validarDecision(d({ setpoint: 21.5 }), [aire], []).ok).toBe(false)
    expect(validarDecision(d({ setpoint: 23 }), [aire], []).ok).toBe(false)
  })
  it("frena equipos que la sala no tiene y órdenes que no cambian nada", () => {
    expect(validarDecision(d({ equipo: "deshumidificador", accion: "encender", setpoint: null }), [aire], []).ok).toBe(false)
    expect(validarDecision(d({ equipo: "deshumidificador", accion: "encender", setpoint: null }), [deshu], []).ok).toBe(false)
    expect(validarDecision(d({ equipo: "deshumidificador", accion: "apagar", setpoint: 40 }), [deshu], []).ok).toBe(false)
    expect(validarDecision(d({ equipo: "deshumidificador", accion: "apagar", setpoint: null }), [deshu], []).ok).toBe(true)
  })
  it("espera 10 minutos después de una orden", () => {
    expect(validarDecision(d({}), [{ ...aire, ultimaOrdenHaceMin: 6 }], [])).toMatchObject({ ok: false })
  })
  it("no repite una orden descartada en la última hora", () => {
    const descartada = { haceMin: 20, propuso: "otro texto", respuesta: "descartada" as const, quien: "Facu", dispositivoId: 1, payload: { accion: "encender", modo: "frio", setpoint: 21, fan: "auto" } }
    expect(validarDecision(d({}), [aire], [descartada]).ok).toBe(false)
    expect(validarDecision(d({}), [aire], [{ ...descartada, haceMin: 70 }]).ok).toBe(true)
  })
  it("no manda dos avisos seguidos de la misma sala", () => {
    const aviso = d({ decision: "avisar", equipo: "aire", accion: null, setpoint: null, titulo: "el aire no alcanza" })
    expect(validarDecision(aviso, [aire], [])).toMatchObject({ ok: true, tipo: "aviso", dispositivoId: 1 })
    expect(validarDecision(aviso, [aire], [{ haceMin: 30, propuso: "otra cosa", respuesta: "aviso", quien: null }]).ok).toBe(false)
    expect(validarDecision(aviso, [aire], [{ haceMin: 120, propuso: "El aire no alcanza. Revisen.", respuesta: "aviso", quien: null }]).ok).toBe(false)
  })
  it("'nada' siempre pasa", () => {
    expect(validarDecision(d({ decision: "nada" }), [], [])).toEqual({ ok: true, tipo: "nada" })
  })
})

describe("contexto en palabras", () => {
  it("dice rango, tendencia y estado de los equipos", () => {
    const c = armarContexto({
      sala: "Sala 2",
      rango: { etapa: "flora", temperatura: [22, 26], humedad: [45, 55] },
      horaAR: "14:00",
      luces: { horario: "de 08:00 a 20:00", prendidas: true },
      ahora: { temperatura: 27.4, humedad: 50, haceMin: 3 },
      ultimaHora: [
        { temperatura: 26, humedad: 52 },
        { temperatura: 26.8, humedad: 51 },
        { temperatura: 27.4, humedad: 50 },
      ],
      alertas: [],
      equipos: [aire, deshu],
      recientes: [],
    })
    expect(c.rango_de_la_etapa).toEqual({ temperatura: "entre 22 y 26 °C", humedad: "entre 45 y 55 %" })
    expect(c.ultima_hora.temperatura).toBe("entre 26 y 27,4 °C, subiendo 1,4 °C en la última hora")
    expect(c.ultima_hora.humedad).toBe("entre 50 y 52 %, bajando 2 % en la última hora")
    expect(c.equipos[0]).toMatchObject({ equipo: "aire", estado: "en frío 23 °C", ultima_orden: "hace 40 min" })
    expect(c.equipos[1].estado).toBe("prendido (560 W)")
  })
})

describe("evals", () => {
  it("hay 10 escenarios y el chequeo entiende rangos de setpoint", () => {
    expect(ESCENARIOS).toHaveLength(10)
    const e = ESCENARIOS.find((x) => x.nombre.startsWith("Secado"))!
    const orden = (sp: number) => validarDecision(d({ setpoint: sp }), [{ ...aire, estado: { tipo: "frio", setpoint: 20 } }], [])
    expect(cumple(orden(18), e.entrada.equipos, e.esperado)).toBe(true)
    expect(cumple(orden(21), e.entrada.equipos, e.esperado)).toBe(false)
    expect(cumple({ ok: true, tipo: "nada" }, e.entrada.equipos, e.esperado)).toBe(false)
  })
})

describe("cuándo piensa", () => {
  it("cada 10 minutos, o enseguida si se abrió una alerta", () => {
    expect(tocaPensar(new Date("2026-11-14T15:02:00Z"), [])).toBe(true)
    expect(tocaPensar(new Date("2026-11-14T15:07:00Z"), [])).toBe(false)
    expect(tocaPensar(new Date("2026-11-14T15:07:00Z"), [{ desde: "2026-11-14T14:45:00Z", notificada_en: "2026-11-14T15:03:00Z" }])).toBe(true)
  })
})
