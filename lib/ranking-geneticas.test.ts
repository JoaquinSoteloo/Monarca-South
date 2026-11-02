import { describe, expect, it } from "vitest"
import { desdePeriodo, pesoEnrolados, rankingGeneticas } from "./ranking-geneticas"

const nombres = { a: "Lemon Cherry Gelato", b: "Gary Payton", c: "Tropical Runtz" }

describe("pesoEnrolados", () => {
  it("usa peso_enrolados si está cargado", () => {
    expect(pesoEnrolados({ genetica_id: "a", gramos: 0, peso_enrolados: 4.5 })).toBe(4.5)
  })
  it("si no, cantidad × peso por enrolado", () => {
    expect(pesoEnrolados({ genetica_id: "a", gramos: 0, cantidad_enrolados: 3, peso_por_enrolado: 1.5 })).toBe(4.5)
  })
})

describe("rankingGeneticas", () => {
  it("suma sueltos y enrolados por genética y ordena por total", () => {
    const filas = rankingGeneticas(
      [
        { detalles: [{ genetica_id: "a", gramos: 5 }, { genetica_id: "b", gramos: 10 }] },
        { detalles: [{ genetica_id: "a", gramos: "5", cantidad_enrolados: 2, peso_por_enrolado: 1.5 }] },
        { detalles: [{ genetica_id: "a", gramos: 2 }, { genetica_id: "a", gramos: 3 }] },
      ],
      nombres,
    )
    expect(filas.map((f) => f.nombre)).toEqual(["Lemon Cherry Gelato", "Gary Payton"])
    expect(filas[0]).toMatchObject({ sueltos: 15, enrolados: 3, total: 18, entregas: 3 })
    expect(filas[1]).toMatchObject({ total: 10, entregas: 1 })
    expect(filas[0].participacion + filas[1].participacion).toBeCloseTo(1)
  })

  it("cuenta entregas legacy sin detalle e ignora productos", () => {
    const filas = rankingGeneticas(
      [
        { genetica_id: "c", gramos: 7, detalles: [] },
        { genetica_id: null, gramos: 0, detalles: [{ genetica_id: null, gramos: 0 }] },
      ],
      nombres,
    )
    expect(filas).toEqual([
      expect.objectContaining({ genetica_id: "c", sueltos: 7, enrolados: 0, total: 7, entregas: 1, participacion: 1 }),
    ])
  })

  it("no inventa nombres y deja afuera lo que suma 0", () => {
    const filas = rankingGeneticas([{ detalles: [{ genetica_id: "z", gramos: 2 }, { genetica_id: "b", gramos: 0 }] }], nombres)
    expect(filas).toHaveLength(1)
    expect(filas[0].nombre).toBe("Genética sin nombre")
  })
})

describe("desdePeriodo", () => {
  const hoy = new Date("2026-11-02T15:00:00Z")
  it("todo no tiene límite", () => expect(desdePeriodo("todo", hoy)).toBeNull())
  it("30 días", () => expect(desdePeriodo("30d", hoy)).toBe("2026-10-03T15:00:00.000Z"))
  it("este año arranca el 1/1 a las 0 h de Argentina", () => expect(desdePeriodo("anio", hoy)).toBe("2026-01-01T03:00:00.000Z"))
})
