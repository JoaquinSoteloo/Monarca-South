import { describe, expect, it } from "vitest"
import { formatHoraArgentina, getArgentinaDateString, getArgentinaDayRangeUTC } from "./timezone"

describe("getArgentinaDateString", () => {
  it("usa el día argentino, no el día UTC", () => {
    // 2024-06-10 23:30 en Argentina (UTC-3) = 2024-06-11 02:30 UTC.
    // El día UTC ya es 11; el día argentino todavía es 10.
    expect(getArgentinaDateString(new Date("2024-06-11T02:30:00.000Z"))).toBe("2024-06-10")
  })
})

describe("getArgentinaDayRangeUTC", () => {
  it("arranca a las 00:00 argentinas (03:00 UTC) y termina 24h después", () => {
    const { startUTC, endUTC } = getArgentinaDayRangeUTC(new Date("2024-06-10T15:00:00.000Z"))
    expect(startUTC).toBe("2024-06-10T03:00:00.000Z")
    expect(endUTC).toBe("2024-06-11T03:00:00.000Z")
  })

  it("una venta justo antes de la medianoche argentina cae en el día que termina", () => {
    // 2024-06-10 23:59:59.999 ART = 2024-06-11 02:59:59.999Z
    const ventaAntes = new Date("2024-06-11T02:59:59.999Z")
    const { startUTC, endUTC } = getArgentinaDayRangeUTC(ventaAntes)

    expect(ventaAntes.toISOString() >= startUTC).toBe(true)
    expect(ventaAntes.toISOString() < endUTC).toBe(true)
    // Es la última venta de ESE día: al pedir el rango de la fecha
    // calendario correspondiente a esa venta, cae adentro.
    expect(getArgentinaDateString(ventaAntes)).toBe("2024-06-10")
  })

  it("una venta justo después de la medianoche argentina pertenece al día siguiente", () => {
    // 2024-06-11 00:00:00.000 ART = 2024-06-11 03:00:00.000Z
    const ventaDespues = new Date("2024-06-11T03:00:00.000Z")
    const rangoDiaAnterior = getArgentinaDayRangeUTC(new Date("2024-06-10T15:00:00.000Z"))

    // Ya no pertenece al rango del día anterior (el fin es exclusivo).
    expect(ventaDespues.toISOString() < rangoDiaAnterior.endUTC).toBe(false)
    expect(getArgentinaDateString(ventaDespues)).toBe("2024-06-11")

    const rangoDiaSiguiente = getArgentinaDayRangeUTC(ventaDespues)
    expect(ventaDespues.toISOString() >= rangoDiaSiguiente.startUTC).toBe(true)
    expect(ventaDespues.toISOString() < rangoDiaSiguiente.endUTC).toBe(true)
  })

  it("un día sin ventas no debe encontrar registros del día siguiente ni del anterior", () => {
    const ventas = [
      { created_at: "2024-06-09T23:00:00.000Z" }, // 2024-06-09 20:00 ART
      { created_at: "2024-06-11T04:00:00.000Z" }, // 2024-06-11 01:00 ART
    ]
    const { startUTC, endUTC } = getArgentinaDayRangeUTC(new Date("2024-06-10T15:00:00.000Z"))

    const deHoy = ventas.filter((v) => v.created_at >= startUTC && v.created_at < endUTC)
    expect(deHoy).toHaveLength(0)
  })
})

describe("formatHoraArgentina", () => {
  it("formatea en 24 horas, sin a. m./p. m.", () => {
    // 2024-06-10 19:37 UTC = 2024-06-10 16:37 ART.
    expect(formatHoraArgentina("2024-06-10T19:37:00.000Z")).toBe("16:37")
  })

  it("no muestra '24:00' a la medianoche argentina", () => {
    // 2024-06-11 00:00 ART = 2024-06-11 03:00 UTC.
    expect(formatHoraArgentina("2024-06-11T03:00:00.000Z")).toBe("00:00")
  })
})
