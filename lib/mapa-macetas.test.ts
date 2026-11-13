import { describe, expect, it } from "vitest"
import { cargarCama, diasEntre, redimensionarMapa, validarCicloCama } from "./mapa-macetas"
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

describe("cargarCama", () => {
  const vacia = { filas: 2, columnas: 3, macetas: [] }
  const m = (fila: number, columna: number, genetica_id = "9") =>
    ({ fila, columna, etiqueta: "", genetica_id, salud: "sana" as const, notas: "ya estaba" })

  it("llena toda la cama en orden A1, A2… B1", () => {
    const r = cargarCama(vacia, { genetica_id: "1", etiqueta: "", cantidad: "todas", reemplazar: false })
    expect(r.cargadas).toBe(6)
    expect(r.mapa.macetas.map(x => `${x.fila}${x.columna}`)).toEqual(["00", "01", "02", "10", "11", "12"])
    expect(r.mapa.macetas.every(x => x.genetica_id === "1" && x.salud === "sin_evaluar")).toBe(true)
  })

  it("carga una cantidad y deja el resto para otra genética", () => {
    const a = cargarCama(vacia, { genetica_id: "1", etiqueta: "", cantidad: 4, reemplazar: false })
    const b = cargarCama(a.mapa, { genetica_id: "2", etiqueta: "", cantidad: "todas", reemplazar: false })
    expect(b.cargadas).toBe(2)
    expect(b.mapa.macetas.filter(x => x.genetica_id === "2").map(x => `${x.fila}${x.columna}`)).toEqual(["11", "12"])
  })

  it("no toca las macetas que ya estaban, salvo con reemplazar", () => {
    const mapa = { ...vacia, macetas: [m(0, 1)] }
    const r = cargarCama(mapa, { genetica_id: "1", etiqueta: "", cantidad: "todas", reemplazar: false })
    expect(r.cargadas).toBe(5)
    expect(r.mapa.macetas.find(x => x.fila === 0 && x.columna === 1)).toEqual(m(0, 1))
    const p = cargarCama(mapa, { genetica_id: "1", etiqueta: "", cantidad: "todas", reemplazar: true })
    expect(p.cargadas).toBe(6)
    expect(p.mapa.macetas.every(x => x.genetica_id === "1")).toBe(true)
  })

  it("acepta una genética que no está en Stock como nombre", () => {
    const r = cargarCama(vacia, { genetica_id: null, etiqueta: "  GMO ", cantidad: 2, reemplazar: false })
    expect(r.mapa.macetas.every(x => x.genetica_id === null && x.etiqueta === "GMO")).toBe(true)
  })

  it("avisa los errores", () => {
    expect(() => cargarCama(vacia, { genetica_id: null, etiqueta: " ", cantidad: 1, reemplazar: false })).toThrow(/genética/)
    expect(() => cargarCama(vacia, { genetica_id: "1", etiqueta: "", cantidad: 0, reemplazar: false })).toThrow(/cuántas/)
    expect(() => cargarCama(vacia, { genetica_id: "1", etiqueta: "", cantidad: 7, reemplazar: false })).toThrow(/6 posiciones/)
    const llena = cargarCama(vacia, { genetica_id: "1", etiqueta: "", cantidad: "todas", reemplazar: false }).mapa
    expect(() => cargarCama(llena, { genetica_id: "2", etiqueta: "", cantidad: "todas", reemplazar: false })).toThrow(/completa/)
  })
})
