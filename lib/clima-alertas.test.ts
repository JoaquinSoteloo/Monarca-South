import { describe, expect, it } from "vitest"
import { objetivos, momentoCiclo, type CicloSala } from "./ciclo"
import { problemasDeSala, rangoClima, textoProblema, volvioAlRango, type LecturaClima } from "./clima-alertas"

const ciclo = (over: Partial<CicloSala> = {}): CicloSala => ({
  id: 1, sala_id: 9, nombre: null, estado: "abierto", geneticas: null, plantas: null, m2: 10,
  fecha_inicio: "2026-09-22", dias_vege: 50, dias_flora: 60, dias_lavado: 7, dias_secado: 6, dias_limpieza: 2, notas: null,
  ...over,
})
const AHORA = new Date("2026-11-13T18:30:00.000Z")
const lect = (minAtras: number, t: number | null, h: number | null): LecturaClima => ({
  leido_en: new Date(AHORA.getTime() - minAtras * 60000).toISOString(), temperatura_c: t, humedad_rh: h,
})

describe("rangoClima", () => {
  it("flora: 22–26 °C y 45–55 %", () => {
    expect(rangoClima("Sala 5", ciclo(), "2026-11-13")).toMatchObject({ etapa: "flora", temperatura: [22, 26], humedad: [45, 55] })
  })
  it("vege, últimas 2 semanas de flora y secado", () => {
    expect(rangoClima("Sala 1", ciclo({ fecha_inicio: "2026-10-30", dias_vege: 48 }), "2026-11-13")?.etapa).toBe("vege")
    expect(rangoClima("Sala 5", ciclo(), "2026-12-30")).toMatchObject({ temperatura: [20, 24], humedad: [40, 50] })
    expect(rangoClima("Sala 5", ciclo(), "2027-01-12")?.etapa).toBe("secado")
  })
  it("Sala 3 sin ciclo es la de madres; otra sala sin ciclo no se vigila", () => {
    expect(rangoClima("Sala 3", null, "2026-11-13")).toMatchObject({ temperatura: [24, 28], humedad: [60, 75] })
    expect(rangoClima("Sala 2", null, "2026-11-13")).toBeNull()
  })
  it("usa los mismos rangos que la ficha de la sala", () => {
    for (const hoy of ["2026-10-01", "2026-11-13", "2026-12-30"]) {
      const c = ciclo()
      const o = objetivos(momentoCiclo(c, hoy), c)
      const r = rangoClima("Sala 5", c, hoy)!
      expect(o.temperatura).toBe(`${r.temperatura[0]}–${r.temperatura[1]} °C`)
      expect(o.humedad).toBe(`${r.humedad[0]}–${r.humedad[1]} %`)
    }
  })
})

describe("problemasDeSala", () => {
  const flora = rangoClima("Sala 5", ciclo(), "2026-11-13")!

  it("avisa si estuvo fuera de rango del mismo lado en las últimas lecturas", () => {
    const p = problemasDeSala([lect(15, 23.2, 71), lect(10, 23.3, 72), lect(5, 23.3, 73), lect(0, 23.4, 72)], flora, AHORA)
    expect(p).toEqual([{ variable: "humedad", lado: "alto", valor: 72, limite: 55 }])
    expect(textoProblema(p[0])).toBe("humedad 72 % (máx 55)")
  })
  it("un pico no alcanza", () => {
    expect(problemasDeSala([lect(15, 23, 50), lect(10, 23, 50), lect(5, 23, 50), lect(0, 27, 50)], flora, AHORA)).toEqual([])
  })
  it("pocas lecturas o sensor sin conexión: no decide", () => {
    expect(problemasDeSala([lect(5, 30, 80), lect(0, 30, 80)], flora, AHORA)).toEqual([])
    expect(problemasDeSala([lect(19, 30, 80), lect(17, 30, 80), lect(15, 30, 80)], flora, AHORA)).toEqual([])
  })
  it("compara el número que se muestra (26,0 no pasa el máximo 26)", () => {
    expect(problemasDeSala([lect(10, 26.04, 50), lect(5, 26.02, 50), lect(0, 26.0, 50)], flora, AHORA)).toEqual([])
    const bajo = problemasDeSala([lect(10, 21.5, 50), lect(5, 21.4, 50), lect(0, 21.3, 50)], flora, AHORA)
    expect(bajo).toEqual([{ variable: "temperatura", lado: "bajo", valor: 21.3, limite: 22 }])
    expect(textoProblema(bajo[0])).toBe("temperatura 21,3 °C (mín 22)")
  })
})

describe("volvioAlRango", () => {
  const flora = rangoClima("Sala 5", ciclo(), "2026-11-13")!
  it("necesita las 2 últimas lecturas adentro", () => {
    expect(volvioAlRango([lect(10, 23, 70), lect(5, 23, 54), lect(0, 23, 53)], flora, "humedad", AHORA)).toBe(true)
    expect(volvioAlRango([lect(10, 23, 70), lect(5, 23, 70), lect(0, 23, 53)], flora, "humedad", AHORA)).toBe(false)
  })
  it("sin lecturas recientes no sabe", () => {
    expect(volvioAlRango([lect(30, 23, 50)], flora, "humedad", AHORA)).toBeNull()
  })
})
