import { describe, expect, it } from "vitest"
import { cercaDeCambio, deberiaHaberLuz, luzVolvioANormal, revisarLuz, type LecturaLuz } from "./guardian-luces"

// Horas en Argentina (UTC−3): "03:10" AR = 06:10 UTC.
const ar = (dia: string, hora: string) => new Date(`${dia}T${hora}:00-03:00`)
const lect = (dia: string, hora: string, lux: number): LecturaLuz => ({ leido_en: ar(dia, hora).toISOString(), luz_lux: lux })

const sala5 = { prende: "17:00", apaga: "05:00" } // flora: luz 17 a 05, oscura 05 a 17
const sala2 = { prende: "10:00:00", apaga: "22:00:00" }

describe("horario", () => {
  it("entiende horarios que cruzan la medianoche", () => {
    expect(deberiaHaberLuz(3 * 60, sala5)).toBe(true) // 03:00
    expect(deberiaHaberLuz(10 * 60, sala5)).toBe(false) // 10:00
    expect(deberiaHaberLuz(12 * 60, sala2)).toBe(true)
    expect(deberiaHaberLuz(23 * 60, sala2)).toBe(false)
  })
  it("no decide cerca del cambio", () => {
    expect(cercaDeCambio(17 * 60 + 10, sala5)).toBe(true)
    expect(cercaDeCambio(4 * 60 + 50, sala5)).toBe(true)
    expect(cercaDeCambio(12 * 60, sala5)).toBe(false)
  })
})

describe("revisarLuz", () => {
  it("luces prendidas en horario de oscuridad (2 lecturas seguidas)", () => {
    const p = revisarLuz([lect("2026-11-14", "10:05", 0), lect("2026-11-14", "10:10", 90), lect("2026-11-14", "10:15", 92)], sala5, ar("2026-11-14", "10:16"))
    expect(p).toEqual({ lado: "alto", valor: 92, mensaje: "luces prendidas a las 10:10, en horario de oscuridad (05:00 a 17:00)" })
  })
  it("una sola lectura con luz no alcanza (alguien entró un minuto)", () => {
    expect(revisarLuz([lect("2026-11-14", "10:10", 0), lect("2026-11-14", "10:15", 92)], sala5, ar("2026-11-14", "10:16"))).toBeNull()
  })
  it("las luces prendidas en su horario están bien", () => {
    expect(revisarLuz([lect("2026-11-14", "20:00", 90), lect("2026-11-14", "20:05", 91)], sala5, ar("2026-11-14", "20:06"))).toBeNull()
  })
  it("no prendieron a su hora", () => {
    const l = ["10:20", "10:25", "10:30", "10:35"].map((h) => lect("2026-11-14", h, 0))
    expect(revisarLuz(l, sala2, ar("2026-11-14", "10:36"))).toMatchObject({ lado: "bajo", mensaje: "las luces no prendieron a las 10:00" })
  })
  it("un apagado a mitad del día no es una alerta (Sala 1 lo hace a propósito)", () => {
    const sala1 = { prende: "09:35", apaga: "03:35" }
    const l = ["11:20", "11:25", "11:30", "11:35"].map((h) => lect("2026-11-14", h, 0))
    expect(revisarLuz(l, sala1, ar("2026-11-14", "11:36"))).toBeNull()
  })
})

describe("luzVolvioANormal", () => {
  it("prendidas de noche: se resuelve con 2 lecturas apagadas", () => {
    expect(luzVolvioANormal([lect("2026-11-14", "10:20", 0), lect("2026-11-14", "10:25", 0)], "alto", ar("2026-11-14", "10:26"))).toBe(true)
    expect(luzVolvioANormal([lect("2026-11-14", "10:20", 90), lect("2026-11-14", "10:25", 0)], "alto", ar("2026-11-14", "10:26"))).toBe(false)
  })
  it("no prendieron: se resuelve apenas prenden", () => {
    expect(luzVolvioANormal([lect("2026-11-14", "10:50", 88)], "bajo", ar("2026-11-14", "10:51"))).toBe(true)
  })
})
