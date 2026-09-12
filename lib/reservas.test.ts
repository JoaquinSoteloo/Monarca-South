import { describe, expect, it } from "vitest"
import { bigintComoNumero, mapReservaError, normalizarDni } from "./reservas"

describe("normalizarDni", () => {
  it("deja solo dígitos, igual que regexp_replace en las RPC", () => {
    expect(normalizarDni("30.123.456")).toBe("30123456")
    expect(normalizarDni("  30 123 456  ")).toBe("30123456")
    expect(normalizarDni("abc")).toBe("")
    expect(normalizarDni("")).toBe("")
  })
})

describe("mapReservaError", () => {
  it("devuelve el mensaje tal cual para códigos MC00X conocidos", () => {
    expect(mapReservaError({ code: "MC003", message: "Este horario ya está completo, elegí otro" })).toBe(
      "Este horario ya está completo, elegí otro",
    )
  })

  it("no confía en el mensaje si el código es desconocido", () => {
    expect(mapReservaError({ code: "23505", message: "duplicate key value violates unique constraint" })).toBe(
      "Ocurrió un error al procesar tu reserva. Intentá nuevamente.",
    )
  })

  it("cae al mensaje genérico sin error o sin código", () => {
    expect(mapReservaError(null)).toBe("Ocurrió un error al procesar tu reserva. Intentá nuevamente.")
    expect(mapReservaError({ message: "algo" })).toBe("Ocurrió un error al procesar tu reserva. Intentá nuevamente.")
  })

  it("cae al mensaje genérico si el código es conocido pero no vino message", () => {
    expect(mapReservaError({ code: "MC001" })).toBe("Ocurrió un error al procesar tu reserva. Intentá nuevamente.")
  })
})

describe("bigintComoNumero", () => {
  it("convierte el bigint serializado como string por PostgREST", () => {
    expect(bigintComoNumero("2")).toBe(2)
    expect(bigintComoNumero(0)).toBe(0)
  })

  it("trata null/undefined como 0 (sin citas en ese horario)", () => {
    expect(bigintComoNumero(null)).toBe(0)
    expect(bigintComoNumero(undefined)).toBe(0)
  })
})
