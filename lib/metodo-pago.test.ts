import { describe, expect, it } from "vitest"
import { cobradoEnPlata, etiquetaMetodo } from "./metodo-pago"

describe("etiquetaMetodo", () => {
  it("nombra cada método", () => {
    expect(etiquetaMetodo("efectivo")).toBe("Efectivo")
    expect(etiquetaMetodo("retribucion")).toBe("Retribución")
    expect(etiquetaMetodo("mixto")).toBe("Mixto")
    expect(etiquetaMetodo(null)).toBe("Pendiente")
  })
})

describe("cobradoEnPlata", () => {
  it("una entrega común cuenta entera por su método", () => {
    expect(cobradoEnPlata({ total: "5000.00", metodo_pago: "efectivo" })).toEqual({ efectivo: 5000, transferencia: 0 })
    expect(cobradoEnPlata({ total: 5000, metodo_pago: "transferencia", pagos: [] })).toEqual({ efectivo: 0, transferencia: 5000 })
    expect(cobradoEnPlata({ total: 5000, metodo_pago: "pendiente", saldo_pendiente: 5000 })).toEqual({ efectivo: 0, transferencia: 0 })
  })

  it("pagada toda con la retribución, no entra plata", () => {
    const v = { total: 20000, metodo_pago: "retribucion", saldo_pendiente: 0, pagos: [{ monto: 20000, metodo_pago: "retribucion" }] }
    expect(cobradoEnPlata(v)).toEqual({ efectivo: 0, transferencia: 0 })
  })

  it("mitad en efectivo y mitad con la retribución: cuenta solo el efectivo", () => {
    const v = {
      total: 50000,
      metodo_pago: "mixto",
      saldo_pendiente: "0.00",
      pagos: [
        { monto: "10000.00", metodo_pago: "efectivo" },
        { monto: "40000.00", metodo_pago: "retribucion" },
      ],
    }
    expect(cobradoEnPlata(v)).toEqual({ efectivo: 10000, transferencia: 0 })
  })

  it("aunque la entrega quede marcada en efectivo, lo descontado del sueldo no cuenta como plata", () => {
    const v = {
      total: 15000,
      metodo_pago: "efectivo",
      saldo_pendiente: 0,
      pagos: [
        { monto: 10000, metodo_pago: "retribucion" },
        { monto: 5000, metodo_pago: "transferencia" },
      ],
    }
    expect(cobradoEnPlata(v)).toEqual({ efectivo: 0, transferencia: 5000 })
  })

  it("con saldo todavía pendiente no cuenta, igual que las demás entregas con deuda", () => {
    const v = { total: 15000, metodo_pago: "pendiente", saldo_pendiente: 5000, pagos: [{ monto: 10000, metodo_pago: "retribucion" }] }
    expect(cobradoEnPlata(v)).toEqual({ efectivo: 0, transferencia: 0 })
  })
})
