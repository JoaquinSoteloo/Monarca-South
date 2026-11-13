import { describe, expect, it } from "vitest"
import { evaluarRiego, parseDecimal, rangoEcEntrada, rangoPhEntrada, type LecturaRiego } from "./riego"

const base: LecturaRiego = {
  etapa: "floracion",
  semana: 4,
  ec_entrada: 1.8,
  ph_entrada: 6.0,
  ec_runoff: 2.0,
  ph_runoff: 6.1,
  drenaje_pct: 18,
  pincho: { t1_humedad: 45, t1_ec: 2.1, t2_humedad: 48, t2_ec: 2.3, humedad_despues: 70 },
}

describe("evaluarRiego", () => {
  it("un riego dentro de lo esperado no tiene alertas", () => {
    expect(evaluarRiego(base)).toEqual([])
  })

  it("detecta sales acumuladas cuando el runoff supera la entrada en más de 0,5", () => {
    const alertas = evaluarRiego({ ...base, ec_runoff: 2.4 })
    expect(alertas.some((a) => a.mensaje.includes("se acumulan sales"))).toBe(true)
  })

  it("no marca sales con exactamente 0,5 de diferencia", () => {
    expect(evaluarRiego({ ...base, ec_runoff: 2.3 })).toEqual([])
  })

  it("avisa si la planta come más de lo que recibe", () => {
    const alertas = evaluarRiego({ ...base, ec_runoff: 1.4 })
    expect(alertas).toHaveLength(1)
    expect(alertas[0].nivel).toBe("info")
  })

  it("marca pH del runoff fuera de 5,5–6,5", () => {
    expect(evaluarRiego({ ...base, ph_runoff: 5.3 })[0].mensaje).toContain("acidificación")
    expect(evaluarRiego({ ...base, ph_runoff: 6.8 })[0].mensaje).toContain("alcalinización")
  })

  it("marca drenaje bajo y alto", () => {
    expect(evaluarRiego({ ...base, drenaje_pct: 5 })[0].mensaje).toContain("no se lavan")
    expect(evaluarRiego({ ...base, drenaje_pct: 40 })[0].mensaje).toContain("desperdicia")
  })

  it("marca EC y pH de entrada fuera de la tabla de la semana", () => {
    const alertas = evaluarRiego({ ...base, ec_entrada: 2.3, ec_runoff: 2.4, ph_entrada: 6.6 })
    expect(alertas.map((a) => a.mensaje).join(" ")).toContain("EC de entrada")
    expect(alertas.map((a) => a.mensaje).join(" ")).toContain("pH de entrada")
  })

  it("sin runoff no avisa nada: desde el 16/11 se mide con el pincho", () => {
    expect(evaluarRiego({ ...base, ec_runoff: null, ph_runoff: null, drenaje_pct: null })).toEqual([])
  })

  it("pide el pincho si falta, salvo en esquejes y lavado", () => {
    const sinPincho = { ...base, pincho: null }
    expect(evaluarRiego(sinPincho)[0].mensaje).toContain("Faltan las mediciones del pincho")
    expect(evaluarRiego({ ...sinPincho, etapa: "esqueje", semana: null, ec_entrada: 0.9, ph_entrada: 5.8, ec_runoff: null })).toEqual([])
    expect(evaluarRiego({ ...sinPincho, etapa: "lavado", semana: null, ec_entrada: 0.05, ph_entrada: 6.0, ec_runoff: null })).toEqual([])
  })

  it("marca sales si el pincho da más de 1 punto arriba de la mezcla, y falta de alimento si da 0,5 abajo", () => {
    const p = base.pincho!
    expect(evaluarRiego({ ...base, pincho: { ...p, t1_ec: 3.0, t2_ec: 2.9 } })[0].mensaje).toContain("acumulación de sales")
    expect(evaluarRiego({ ...base, pincho: { ...p, t1_ec: 2.8, t2_ec: 2.8 } })).toEqual([])
    expect(evaluarRiego({ ...base, pincho: { ...p, t1_ec: 1.2, t2_ec: 1.2 } })[0].mensaje).toContain("faltando alimento")
  })

  it("avisa si las 2 testigo tienen más de 10 puntos de humedad de diferencia", () => {
    const p = base.pincho!
    expect(evaluarRiego({ ...base, pincho: { ...p, t1_humedad: 30, t2_humedad: 45 } })[0].mensaje).toContain("humedad muy distinta")
  })

  it("en la semana 8 de flora espera solo agua y no marca sales", () => {
    const lavado = { ...base, semana: 8, ec_entrada: 0.05, ec_runoff: 1.5, drenaje_pct: 25 }
    expect(evaluarRiego(lavado)).toEqual([])
  })
})

describe("rangoEcEntrada", () => {
  it("sigue la progresión del Manual 3", () => {
    expect(rangoEcEntrada("vegetativo", 2)).toEqual({ min: 1.1, max: 1.3 })
    expect(rangoEcEntrada("floracion", 1)).toEqual({ min: 1.5, max: 1.7 })
    expect(rangoEcEntrada("floracion", 5)).toEqual({ min: 1.7, max: 2.0 })
  })
})

describe("parseDecimal", () => {
  it("acepta coma o punto y vacío", () => {
    expect(parseDecimal("1,6")).toBe(1.6)
    expect(parseDecimal(" 6.0 ")).toBe(6)
    expect(parseDecimal("")).toBeNull()
    expect(parseDecimal("abc")).toBeNull()
  })
  it("pH de entrada: máximo 6,0 en cualquier etapa", () => {
    expect(rangoPhEntrada("floracion", 4).max).toBe(6)
    expect(rangoPhEntrada("vegetativo", null).max).toBe(6)
    const alertas = evaluarRiego({ ...base, ph_entrada: 6.1 })
    expect(alertas.map((a) => a.mensaje).join(" ")).toContain("pH de entrada")
  })
})
