import { describe, expect, it } from "vitest"
import { diasEntre, redimensionarMapa, validarCicloCama } from "./mapa-macetas"
import type { CicloCama, MacetaCultivo } from "./types"

const maceta: MacetaCultivo = {
  fila: 1, columna: 2, etiqueta: "01", genetica_id: null, salud: "sin_evaluar",
  notas: "",
}
const cama: CicloCama = {
  estado: "floracion", fecha_vegetativo: "2026-08-01", fecha_floracion: "2026-09-01",
  fecha_cosecha: null,
}
describe("fechas y posiciones del mapa", () => {
  it("cuenta días civiles y congela etapas cerradas", () => {
    expect(diasEntre("2026-08-01", "2026-09-01", "2026-09-11")).toBe(31)
    expect(diasEntre("2026-09-01", null, "2026-09-11")).toBe(10)
    expect(diasEntre("2024-02-28", "2024-03-01")).toBe(2)
    expect(diasEntre(null, null)).toBeNull()
  })
  it("rechaza fechas invertidas y futuras", () => {
    expect(validarCicloCama(cama, "2026-09-11")).toBeNull()
    expect(validarCicloCama({ ...cama, fecha_floracion: "2026-07-01" }, "2026-09-11")).toBeTruthy()
    expect(validarCicloCama({ ...cama, fecha_floracion: "2026-09-12" }, "2026-09-11")).toBeTruthy()
  })
  it("no acepta una etapa anterior con fechas de etapas posteriores", () => {
    expect(validarCicloCama({ ...cama, estado: "vegetativo" }, "2026-09-11")).toBeTruthy()
  })
  it("no permite ocultar macetas al achicar la cama", () => {
    const mapa = { filas: 2, columnas: 4, macetas: [maceta] }
    expect(() => redimensionarMapa(mapa, 1, 4)).toThrow()
    expect(() => redimensionarMapa(mapa, 2, 2)).toThrow()
    expect(redimensionarMapa(mapa, 3, 4).macetas).toEqual([maceta])
    expect(() => redimensionarMapa(mapa, 1.5, 4)).toThrow()
    expect(() => redimensionarMapa(mapa, 13, 4)).toThrow()
  })
})
