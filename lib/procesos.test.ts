import { describe, expect, it } from "vitest"
import { avance, metaSala, resumen, serializar, validar, valoresIniciales, type Campo, type Testigo } from "./procesos"
import type { CicloSala } from "./ciclo"

const mezcla: Campo[] = [
  { clave: "ec", etiqueta: "EC de la mezcla", tipo: "numero", unidad: "mS/cm", min: 0, max: 5, requerido: true },
  { clave: "ph", etiqueta: "pH de la mezcla", tipo: "numero", min: 3, max: 9, requerido: true },
  { clave: "productos", etiqueta: "Qué le pusiste", tipo: "texto_largo", requerido: true, recordar: true },
]
const riego: Campo[] = [
  { clave: "litros_maceta", etiqueta: "Litros por maceta", tipo: "numero", min: 0, max: 10 },
  { clave: "testigos", etiqueta: "Macetas testigo", tipo: "testigos", requerido: true, cantidad: 2 },
]

describe("valoresIniciales", () => {
  it("sugiere lo último que se usó en los campos que lo piden", () => {
    const v = valoresIniciales(mezcla, {}, { productos: "Ryanodine A 2 ml/L", ec: 1.7 })
    expect(v).toEqual({ ec: "", ph: "", productos: "Ryanodine A 2 ml/L" })
  })
  it("arma las macetas testigo con las sugeridas del ciclo", () => {
    const v = valoresIniciales(riego, {}, null, ["Cama 1 · 3", "Cama 3 · 12"])
    expect((v.testigos as Testigo[]).map((t) => t.maceta)).toEqual(["Cama 1 · 3", "Cama 3 · 12"])
  })
  it("muestra los números con coma", () => {
    expect(valoresIniciales(mezcla, { ec: 1.7 }, null).ec).toBe("1,7")
  })
})

describe("validar", () => {
  it("pide los campos obligatorios", () => {
    expect(validar(mezcla, { ec: "", ph: "5,8", productos: "" })).toEqual([
      "EC de la mezcla: falta completar",
      "Qué le pusiste: falta completar",
    ])
  })
  it("controla rangos y números con coma", () => {
    expect(validar(mezcla, { ec: "1,7", ph: "5,8", productos: "A+B" })).toEqual([])
    expect(validar(mezcla, { ec: "7", ph: "abc", productos: "A+B" })).toEqual([
      "EC de la mezcla: máximo 5",
      "pH de la mezcla: no es un número",
    ])
  })
  it("exige al menos una maceta testigo con su maceta y alguna medición", () => {
    const vacio = valoresIniciales(riego, {}, null)
    expect(validar(riego, vacio)).toEqual(["Macetas testigo: cargá al menos una"])
    const sinMaceta = { ...vacio, testigos: [{ maceta: "", ec: "2,1", ph: "", drenaje: "" }] }
    expect(validar(riego, sinMaceta)).toEqual(["Testigo 1: falta cuál es la maceta"])
    const fueraDeRango = { ...vacio, testigos: [{ maceta: "C1", ec: "2,1", ph: "12", drenaje: "20" }] }
    expect(validar(riego, fueraDeRango)).toEqual(["Testigo 1 pH: máximo 9"])
  })
  it("un sí/no obligatorio tiene que estar en sí", () => {
    expect(validar([{ clave: "h", etiqueta: "Higiene", tipo: "si_no", requerido: true }], { h: false })).toEqual([
      "Higiene: tiene que estar en «Sí»",
    ])
  })
})

describe("serializar", () => {
  it("guarda números con punto y descarta vacíos", () => {
    expect(serializar(mezcla, { ec: "1,7", ph: "5,8", productos: "  A+B " })).toEqual({ ec: 1.7, ph: 5.8, productos: "A+B" })
    expect(serializar(riego, { litros_maceta: "", testigos: [{ maceta: "C1", ec: "2,1", ph: "6", drenaje: "" }, { maceta: "", ec: "", ph: "", drenaje: "" }] })).toEqual({
      testigos: [{ maceta: "C1", ec: 2.1, ph: 6, drenaje: null }],
    })
  })
})

describe("metaSala", () => {
  const ciclo = { id: 7, sala_id: 2, nombre: null, estado: "abierto", geneticas: null, plantas: null, m2: 6, fecha_inicio: "2026-10-02",
    dias_vege: 21, dias_flora: 60, dias_lavado: 7, dias_secado: 6, dias_limpieza: 2, notas: null, testigos: ["C1"] } as CicloSala
  it("toma la etapa, la semana y los testigos del ciclo de la sala", () => {
    expect(metaSala([ciclo], 2, "2026-10-31")).toEqual({ ciclo_id: 7, etapa: "floracion", semana: 2, testigos: ["C1"] })
  })
  it("sin ciclo (sala de vege) queda en vegetativo", () => {
    expect(metaSala([ciclo], 3, "2026-10-31")).toEqual({ ciclo_id: null, etapa: "vegetativo", semana: null, testigos: [] })
  })
})

describe("resumen y avance", () => {
  it("resume lo cargado", () => {
    expect(resumen([...mezcla, ...riego], { ec: 1.7, productos: "A+B", testigos: [{ maceta: "C1", ec: 2.1, ph: 6.2, drenaje: 20 }] })).toEqual([
      "EC de la mezcla: 1,7 mS/cm",
      "Qué le pusiste: A+B",
      "C1: EC 2,1 · pH 6,2 · 20 %",
    ])
  })
  it("cuenta los pasos hechos", () => {
    expect(avance([{ estado: "hecho" }, { estado: "pendiente" }, { estado: "espera" }])).toEqual({ hechos: 1, total: 3 })
  })
})
