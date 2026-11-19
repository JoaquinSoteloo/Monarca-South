import { describe, expect, it } from "vitest"
import { diaSemana, dosisSugeridas, evaluarProductos, productosDe, resumenProductos, totalTanque, type ProductoRiego } from "./riego-productos"

const p = (clave: string, dosis: number, unidad: "ml/L" | "g/L" = "ml/L"): ProductoRiego => ({ clave, nombre: clave, dosis, unidad })

describe("productos del riego", () => {
  it("sabe qué día es miércoles", () => {
    expect(diaSemana("2026-11-18")).toBe(3)
    expect(diaSemana("2026-11-19")).toBe(4)
  })

  it("sugiere la tabla de flora por semana, con King Crab solo los miércoles", () => {
    expect(dosisSugeridas("floracion", 2, "2026-11-19")).toEqual({ rhino_skin: 2, maikro_ab: 4, calcis: 4 })
    expect(dosisSugeridas("floracion", 4, "2026-11-18")).toEqual({ rhino_skin: 2, maikro_ab: 4, calcis: 2.8, king_crab: 0.13 })
    expect(dosisSugeridas("floracion", 7, "2026-11-19", true)).toEqual({ mikro_b: 4, finis: 0.91 })
    expect(dosisSugeridas("floracion", 8, "2026-11-18")).toEqual({})
    expect(dosisSugeridas("vegetativo", 2, "2026-11-18")).toEqual({})
  })

  it("resume y calcula el total del tanque", () => {
    expect(resumenProductos([p("maikro_ab", 4), p("calcis", 2.8), p("king_crab", 0.13)])).toBe("AB 4 · C 2,8 · KC 0,13")
    expect(resumenProductos([])).toBe("—")
    expect(totalTanque(0.13, 125)).toBe(16.3)
    expect(totalTanque(4, null)).toBeNull()
  })

  it("normaliza lo guardado y descarta dosis inválidas", () => {
    expect(productosDe([{ clave: "calcis", nombre: "Calcis", dosis: "2.8", unidad: "ml/L" }, { clave: "x", dosis: 0 }, null])).toEqual([
      { clave: "calcis", nombre: "Calcis", dosis: 2.8, unidad: "ml/L" },
    ])
    expect(productosDe("basura")).toEqual([])
  })

  it("avisa King Crab faltante los miércoles, dosis alta, silicio tarde, Calcis alto y lavado con productos", () => {
    const base = [p("maikro_ab", 4), p("calcis", 2.8)]
    expect(evaluarProductos("floracion", 4, "2026-11-18", base)[0].mensaje).toContain("King Crab")
    expect(evaluarProductos("floracion", 4, "2026-11-19", base)).toEqual([])
    expect(evaluarProductos("floracion", 4, "2026-11-18", [...base, p("king_crab", 1)])[0].nivel).toBe("atencion")
    expect(evaluarProductos("floracion", 7, "2026-11-19", [...base, p("rhino_skin", 2)])[0].mensaje).toContain("sin Rhino Skin")
    expect(evaluarProductos("floracion", 5, "2026-11-19", [p("maikro_ab", 4), p("calcis", 4)])[0].mensaje).toContain("2,8")
    expect(evaluarProductos("lavado", null, "2026-11-19", base)[0].nivel).toBe("atencion")
    expect(evaluarProductos("floracion", 7, "2026-11-19", [p("finis", 0.91, "g/L"), p("calcis", 2.8)])[0].mensaje).toContain("Finis")
    expect(evaluarProductos("floracion", 3, "2026-11-18", [])).toEqual([])
  })
})
