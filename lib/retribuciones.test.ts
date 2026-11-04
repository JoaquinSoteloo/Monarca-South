import { describe, expect, it } from "vitest"
import {
  corteDeuda,
  deudaParaDescontar,
  enVentana,
  mesSiguiente,
  repartirSueldo,
  textoVentana,
  ventanaConsumo,
} from "./retribuciones"

describe("ventana de consumo (del 5 al 4)", () => {
  it("el mes siguiente pasa de diciembre a enero", () => {
    expect(mesSiguiente("2026-10-01")).toBe("2026-11-01")
    expect(mesSiguiente("2026-12-01")).toBe("2027-01-01")
  })

  it("octubre va del 5/10 a las 00:00 al 5/11 a las 00:00, hora argentina", () => {
    const { desde, hasta } = ventanaConsumo("2026-10-01")
    expect(desde.toISOString()).toBe("2026-10-05T03:00:00.000Z")
    expect(hasta.toISOString()).toBe("2026-11-05T03:00:00.000Z")
  })

  it("el 4 a la noche todavía es del mes anterior; el 5 ya no", () => {
    expect(enVentana("2026-11-05T02:59:00Z", "2026-10-01")).toBe(true) // 4/11 23:59 en Argentina
    expect(enVentana("2026-11-05T03:00:00Z", "2026-10-01")).toBe(false) // 5/11 00:00
    expect(enVentana("2026-11-05T03:00:00Z", "2026-11-01")).toBe(true)
    expect(enVentana("2026-10-05T02:59:00Z", "2026-10-01")).toBe(false) // 4/10: es de septiembre
  })

  it("muestra las fechas sin ceros", () => {
    expect(textoVentana("2026-10-01")).toBe("5/10 al 4/11")
    expect(textoVentana("2026-12-01")).toBe("5/12 al 4/1")
    expect(corteDeuda("2026-10-01")).toBe("4/11")
  })
})

describe("deuda que se descuenta del sueldo", () => {
  const entregas = [
    { socio_id: "demian", saldo_pendiente: "20000.00", created_at: "2026-07-25T15:59:19Z" }, // deuda vieja: cuenta
    { socio_id: "demian", saldo_pendiente: 40000, created_at: "2026-10-10T15:00:00Z" },
    { socio_id: "demian", saldo_pendiente: 30000, created_at: "2026-11-05T02:59:00Z" }, // 4/11 23:59
    { socio_id: "demian", saldo_pendiente: 15000, created_at: "2026-11-05T03:00:00Z" }, // 5/11: es de noviembre
    { socio_id: "facu", saldo_pendiente: 99999, created_at: "2026-10-10T15:00:00Z" },
  ]

  it("suma lo que debe hasta el 4 del mes siguiente, incluida la deuda más vieja", () => {
    expect(deudaParaDescontar(entregas, "demian", "2026-10-01")).toBe(90000)
    expect(deudaParaDescontar(entregas, "demian", "2026-11-01")).toBe(105000)
  })

  it("sin socio vinculado no hay deuda para descontar", () => {
    expect(deudaParaDescontar(entregas, null, "2026-10-01")).toBe(0)
  })

  it("si debe más que el sueldo, todo el sueldo va a la deuda y nada en plata", () => {
    expect(repartirSueldo(80000, 400000)).toEqual({ deuda: 80000, dinero: 0 })
  })

  it("si debe menos, se descuenta todo y la diferencia va en plata", () => {
    expect(repartirSueldo(800000, 190000)).toEqual({ deuda: 190000, dinero: 610000 })
    expect(repartirSueldo(100000, 0)).toEqual({ deuda: 0, dinero: 100000 })
  })

  it("redondea a centavos", () => {
    expect(repartirSueldo(1000, 333.333)).toEqual({ deuda: 333.33, dinero: 666.67 })
  })
})
