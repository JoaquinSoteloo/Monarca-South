import { describe, expect, it } from "vitest"
import { estadoAire, hayQueEsperar, proponer, temperaturaEn, type EstadoAire } from "./nubi"
import type { RangoClima } from "./clima-alertas"

const flora: RangoClima = { etapa: "flora", temperatura: [22, 26], humedad: [45, 55] }
const enFrio = (setpoint: number): EstadoAire => ({ tipo: "frio", setpoint })

describe("estadoAire", () => {
  it("la última orden cumplida es el estado", () => {
    expect(estadoAire({ ultimo_comando_estado: "ejecutado", ultimo_comando_payload: { accion: "apagar" } })).toEqual({ tipo: "apagado" })
    expect(estadoAire({ ultimo_comando_estado: "ejecutado", ultimo_comando_payload: { accion: "encender", modo: "frio", setpoint: 23 } }))
      .toEqual({ tipo: "frio", setpoint: 23 })
    expect(estadoAire({ ultimo_comando_estado: "ejecutado", ultimo_comando_payload: { accion: "encender" } })).toEqual({ tipo: "prendido_otro" })
  })
  it("orden en camino o fallida: no se sabe", () => {
    expect(estadoAire({ ultimo_comando_estado: "pendiente", ultimo_comando_payload: { accion: "apagar" } }).tipo).toBe("en_curso")
    expect(estadoAire({ ultimo_comando_estado: "fallido", ultimo_comando_payload: { accion: "apagar" } }).tipo).toBe("desconocido")
    expect(estadoAire({ ultimo_comando_estado: null, ultimo_comando_payload: null }).tipo).toBe("desconocido")
  })
})

describe("proponer (los ejemplos acordados con Joaquín)", () => {
  it("calor con el aire apagado: frío al medio del rango menos lo que se pasó", () => {
    expect(proponer(flora, 27.4, { tipo: "apagado" })).toMatchObject({ tipo: "orden", payload: { accion: "encender", modo: "frio", setpoint: 22, fan: "auto" }, resumen: "encender el aire en frío 22 °C" })
  })
  it("calor con el aire en frío: baja lo que se pasó", () => {
    expect(proponer(flora, 27.4, enFrio(23))).toMatchObject({ payload: { setpoint: 21 }, resumen: "bajar el aire de 23 a 21 °C" })
    expect(proponer(flora, 30, enFrio(23))).toMatchObject({ payload: { setpoint: 19 } })
    expect(proponer(flora, 26.1, enFrio(23))).toMatchObject({ payload: { setpoint: 22 } })
  })
  it("nunca baja de 16; si ya está en 16 avisa que no alcanza", () => {
    expect(proponer(flora, 31, enFrio(18))).toMatchObject({ payload: { setpoint: 16 } })
    expect(proponer(flora, 27, enFrio(16))).toMatchObject({ tipo: "aviso" })
  })
  it("frío con el aire en frío: sube, o lo apaga si llega al máximo del rango", () => {
    expect(proponer(flora, 21, enFrio(20))).toMatchObject({ payload: { setpoint: 21 }, resumen: "subir el aire de 20 a 21 °C" })
    expect(proponer(flora, 19.5, enFrio(23))).toMatchObject({ payload: { accion: "apagar" }, resumen: "apagar el aire" })
  })
  it("frío con el aire apagado, en rango, o sin saber el estado: nada", () => {
    expect(proponer(flora, 20, { tipo: "apagado" })).toBeNull()
    expect(proponer(flora, 24, enFrio(23))).toBeNull()
    expect(proponer(flora, 28, { tipo: "en_curso" })).toBeNull()
    expect(proponer(flora, 28, { tipo: "desconocido" })).toBeNull()
  })
})

describe("hayQueEsperar", () => {
  const ahora = new Date("2026-11-13T18:30:00Z")
  const hace = (m: number) => new Date(ahora.getTime() - m * 60000).toISOString()
  it("menos de 10 minutos desde la última orden: espera", () => {
    expect(hayQueEsperar({ ahora, ultimaOrdenEn: hace(8), temperaturaAlMandar: 28, temperaturaAhora: 28, lado: "alto" })).toBe(true)
  })
  it("después de 10 minutos espera solo si viene mejorando", () => {
    expect(hayQueEsperar({ ahora, ultimaOrdenEn: hace(12), temperaturaAlMandar: 28, temperaturaAhora: 27.6, lado: "alto" })).toBe(true)
    expect(hayQueEsperar({ ahora, ultimaOrdenEn: hace(12), temperaturaAlMandar: 28, temperaturaAhora: 27.9, lado: "alto" })).toBe(false)
    expect(hayQueEsperar({ ahora, ultimaOrdenEn: hace(12), temperaturaAlMandar: 20, temperaturaAhora: 20.5, lado: "bajo" })).toBe(true)
  })
  it("órdenes viejas o sin datos no frenan", () => {
    expect(hayQueEsperar({ ahora, ultimaOrdenEn: hace(90), temperaturaAlMandar: 28, temperaturaAhora: 27, lado: "alto" })).toBe(false)
    expect(hayQueEsperar({ ahora, ultimaOrdenEn: null, temperaturaAlMandar: null, temperaturaAhora: 27, lado: "alto" })).toBe(false)
  })
})

describe("temperaturaEn", () => {
  it("toma la última lectura anterior al momento", () => {
    const l = [
      { leido_en: "2026-11-13T18:00:00Z", temperatura_c: 27 },
      { leido_en: "2026-11-13T18:05:00Z", temperatura_c: 27.44 },
      { leido_en: "2026-11-13T18:10:00Z", temperatura_c: 26 },
    ]
    expect(temperaturaEn(l, "2026-11-13T18:07:00Z")).toBe(27.4)
    expect(temperaturaEn(l, "2026-11-13T17:00:00Z")).toBeNull()
  })
})
