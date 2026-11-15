import { describe, expect, it } from "vitest"
import { armarContexto, motivoParaPensar, validarDecision, type DecisionIA, type EntradaContexto, type EquipoEnSala } from "./nubi-ia"
import { ESCENARIOS, cumple } from "./nubi-evals"
import { estadoInformado, pensadoAntes, tocaPensar } from "./nubi-pensar"

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

describe("filtro antes de la IA", () => {
  const tranquila: EntradaContexto = {
    sala: "Sala 5",
    rango: { etapa: "flora", temperatura: [22, 26], humedad: [45, 55] },
    horaAR: "14:10",
    luces: { horario: null, prendidas: null },
    ahora: { temperatura: 24, humedad: 50, haceMin: 2 },
    ultimaHora: [{ temperatura: 23.9, humedad: 51 }, { temperatura: 24, humedad: 50 }],
    alertas: [],
    equipos: [deshu],
    recientes: [],
  }
  const a10 = new Date("2026-11-14T17:10:00Z")
  it("con la sala tranquila no consulta a la IA, salvo el control de cada hora", () => {
    expect(motivoParaPensar(tranquila, a10)).toBeNull()
    expect(motivoParaPensar(tranquila, new Date("2026-11-14T17:02:00Z"))).toBe("control de cada hora")
  })
  it("consulta si algo se acerca al borde, se mueve, hay alerta o un equipo no consume", () => {
    expect(motivoParaPensar({ ...tranquila, ahora: { ...tranquila.ahora, temperatura: 25.7 } }, a10)).toMatch(/temperatura/)
    expect(motivoParaPensar({ ...tranquila, ahora: { ...tranquila.ahora, humedad: 46 } }, a10)).toMatch(/humedad/)
    expect(motivoParaPensar({ ...tranquila, ultimaHora: [{ temperatura: 23, humedad: 50 }, { temperatura: 24, humedad: 50 }] }, a10)).toMatch(/moviendo/)
    expect(motivoParaPensar({ ...tranquila, alertas: ["humedad alta"] }, a10)).toBe("hay alertas abiertas")
    const sinConsumo: EquipoEnSala = { ...deshu, estado: { tipo: "prendido", potenciaW: 0, sinConsumoDesde: "2026-11-14T16:50:00Z" } }
    expect(motivoParaPensar({ ...tranquila, equipos: [sinConsumo] }, a10)).toMatch(/no consume/)
  })

  // 15/11/2026: con una alerta que dura horas, pensaba cada 10 minutos lo mismo.
  const conAlerta: EntradaContexto = { ...tranquila, ahora: { ...tranquila.ahora, humedad: 58 }, alertas: ["humedad 58 % (máx 55)"] }
  const antes = (haceMin: number, x: Partial<{ temperatura: number; humedad: number; alertas: number }> = {}) => ({ haceMin, temperatura: 24, humedad: 58, alertas: 1, ...x })
  it("si la sala sigue igual que la última vez, espera 30 minutos", () => {
    expect(motivoParaPensar({ ...conAlerta, anterior: antes(10) }, a10)).toBeNull()
    expect(motivoParaPensar({ ...conAlerta, anterior: antes(20) }, a10)).toBeNull()
    expect(motivoParaPensar({ ...conAlerta, anterior: antes(30) }, a10)).toBe("hay alertas abiertas")
  })
  it("si ya salió un aviso en la última hora, espera a que pase la hora", () => {
    const aviso = { haceMin: 40, propuso: "revisar deshumidificación. La humedad…", respuesta: "aviso" as const, quien: null }
    expect(motivoParaPensar({ ...conAlerta, recientes: [aviso], anterior: antes(40) }, a10)).toBeNull()
    expect(motivoParaPensar({ ...conAlerta, recientes: [{ ...aviso, haceMin: 60 }], anterior: antes(60) }, a10)).toBe("hay alertas abiertas")
  })
  it("si algo cambió desde la última vez, piensa enseguida", () => {
    expect(motivoParaPensar({ ...conAlerta, anterior: antes(10, { humedad: 55 }) }, a10)).toMatch(/humedad cambió/)
    expect(motivoParaPensar({ ...conAlerta, anterior: antes(10, { temperatura: 23.4 }) }, a10)).toMatch(/temperatura cambió/)
    expect(motivoParaPensar({ ...conAlerta, anterior: antes(10, { alertas: 0 }) }, a10)).toMatch(/otra alerta/)
    expect(motivoParaPensar({ ...conAlerta, equipos: [{ ...deshu, ultimaOrdenHaceMin: 5 }], anterior: antes(10) }, a10)).toMatch(/orden/)
    const respondida = { haceMin: 8, propuso: "prender el deshumidificador", respuesta: "descartada" as const, quien: "Facu" }
    expect(motivoParaPensar({ ...conAlerta, recientes: [respondida], anterior: antes(10) }, a10)).toMatch(/respondieron/)
  })
  it("con la sala tranquila, el control es una hora después de la última vez", () => {
    expect(motivoParaPensar({ ...tranquila, anterior: antes(40, { humedad: 50 }) }, new Date("2026-11-14T17:02:00Z"))).toBeNull()
    expect(motivoParaPensar({ ...tranquila, anterior: antes(60, { humedad: 50 }) }, a10)).toBe("control de cada hora")
  })
})

describe("enchufe que dejó de informar", () => {
  const viejo: EquipoEnSala = { ...deshu, estadoReal: false, sinReporteHaceMin: 2940 }
  it("el contexto dice que no se sabe si anda", () => {
    const c = armarContexto({ ...ESCENARIOS[0].entrada, equipos: [viejo] })
    expect(c.equipos[0].como_se_sabe).toBe("el enchufe no informa hace 2 días: es la última orden, no se sabe si anda de verdad")
  })
  it("deja proponer prenderlo aunque la última orden haya sido prender", () => {
    const prender = d({ equipo: "deshumidificador", accion: "encender", setpoint: null, titulo: "prender el deshumidificador" })
    expect(validarDecision(prender, [viejo], []).ok).toBe(true)
    expect(validarDecision(prender, [deshu], []).ok).toBe(false)
  })
  it("estadoInformado: real solo con un reporte de menos de 5 minutos", () => {
    const ahora = new Date("2026-11-15T21:00:00Z")
    const base = { tipo: "deshumidificador" as const, soporta_feedback: true }
    expect(estadoInformado({ ...base, ultimo_estado_confirmado_en: "2026-11-15T20:57:00Z" }, ahora)).toEqual({ estadoReal: true })
    expect(estadoInformado({ ...base, ultimo_estado_confirmado_en: "2026-11-13T21:21:00Z" }, ahora)).toEqual({ estadoReal: false, sinReporteHaceMin: 2859 })
    expect(estadoInformado({ ...base, ultimo_estado_confirmado_en: null }, ahora)).toEqual({ estadoReal: false, sinReporteHaceMin: null })
    expect(estadoInformado({ tipo: "aire_acondicionado", soporta_feedback: false, ultimo_estado_confirmado_en: null }, ahora)).toEqual({ estadoReal: false })
  })
  it("pensadoAntes lee el contexto guardado", () => {
    const fila = { sala_id: 5, creada_en: "2026-11-15T20:40:00Z", entrada: { ahora: { temperatura: "25,2 °C", humedad: "56 %" }, alertas_abiertas: ["humedad 56 % (máx 55)"] } }
    expect(pensadoAntes(fila, new Date("2026-11-15T21:00:00Z"))).toEqual({ haceMin: 20, temperatura: 25.2, humedad: 56, alertas: 1 })
    expect(pensadoAntes({ ...fila, entrada: { ahora: "sin lecturas del Pulse en la última hora", alertas_abiertas: "ninguna" } }, new Date("2026-11-15T21:00:00Z")))
      .toEqual({ haceMin: 20, temperatura: null, humedad: null, alertas: 0 })
  })
})

describe("contexto corto", () => {
  it("de lo que propuso antes, manda solo el título", () => {
    const c = armarContexto({
      ...ESCENARIOS[0].entrada,
      recientes: [{ haceMin: 70, propuso: "revisar deshumidificación. La humedad está en 56 % y viene subiendo, revisen.", respuesta: "aviso", quien: null }],
    })
    expect(c.lo_que_propuso_nubi_hace_poco).toEqual(['hace 70 min propuso "revisar deshumidificación": aviso'])
  })
})
