import { describe, expect, it } from "vitest"
import { gramosSueltosDeVenta, resumirMes } from "./consumo"
import { getArgentinaMonthStartUTC } from "./timezone"

describe("gramosSueltosDeVenta", () => {
  it("cuenta sólo las líneas de genética, sin el peso de los enrolados", () => {
    // ventas.gramos (12) incluye 2 enrolados de 1 g; los sueltos son 10.
    const venta = {
      socio_id: "s1",
      gramos: 12,
      detalles: [
        { gramos: 10, genetica_id: "g1" },
        { gramos: 0, genetica_id: "g2" }, // línea sólo de enrolados
        { gramos: 0, genetica_id: null }, // producto
      ],
    }
    expect(gramosSueltosDeVenta(venta)).toBe(10)
  })

  it("una entrega legacy sin detalle cuenta ventas.gramos", () => {
    expect(gramosSueltosDeVenta({ socio_id: "s1", gramos: 7, detalles: [] })).toBe(7)
  })
})

describe("resumirMes", () => {
  it("suma sueltos y cuenta entregas por socio", () => {
    const resumen = resumirMes([
      { socio_id: "s1", gramos: 5, detalles: [{ gramos: 5, genetica_id: "g1" }] },
      { socio_id: "s1", gramos: 3, detalles: [{ gramos: 0, genetica_id: "g1" }] },
      { socio_id: "s2", gramos: 2, detalles: null },
      { socio_id: null, gramos: 9, detalles: null },
    ])
    expect(resumen.sueltosPorSocio).toEqual({ s1: 5, s2: 2 })
    expect(resumen.entregasPorSocio).toEqual({ s1: 2, s2: 1 })
  })
})

describe("getArgentinaMonthStartUTC", () => {
  it("usa el mes argentino: el 1/7 a las 01:00 UTC todavía es junio en Argentina", () => {
    expect(getArgentinaMonthStartUTC(new Date("2024-07-01T01:00:00.000Z"))).toBe("2024-06-01T03:00:00.000Z")
  })

  it("arranca a las 00:00 argentinas del día 1", () => {
    expect(getArgentinaMonthStartUTC(new Date("2024-07-15T12:00:00.000Z"))).toBe("2024-07-01T03:00:00.000Z")
  })
})
