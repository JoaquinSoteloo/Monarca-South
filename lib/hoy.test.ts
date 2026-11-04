import { describe, expect, it } from "vitest"
import type { Perfil, Tarea } from "./equipo"
import {
  destinatariosProblema,
  fechaLarga,
  listaNombres,
  primerNombre,
  puedeEditarTarea,
  resumenEquipo,
  separarDia,
  sinTareas,
} from "./hoy"

const perfil = (id: string, nombre: string, extra: Partial<Perfil> = {}): Perfil => ({
  id, nombre, rol: "cultivo", ve_todas_las_tareas: false, supervisor_id: null, activo: true, ...extra,
})
const facundo = perfil("f", "Facundo", { rol: "direccion", ve_todas_las_tareas: true })
const lucho = perfil("l", "Lucho", { ve_todas_las_tareas: true })
const vilela = perfil("v", "Vilela", { rol: "mantenimiento", supervisor_id: "l" })
const demian = perfil("d", "Demian", { rol: "atencion", supervisor_id: "f" })
const pato = perfil("p", "Pato", { rol: "ayudante", supervisor_id: "l" })
const equipo = [facundo, lucho, vilela, demian, pato]

const tarea = (id: number, responsable_id: string, estado: Tarea["estado"], orden = 100, extra: Partial<Tarea> = {}): Tarea => ({
  id, fecha: "2026-11-03", titulo: `T${id}`, detalle: null, responsable_id, creada_por: null, plantilla_id: null,
  afecta_a: [], estado, nota: null, completada_at: null, completada_por: null, orden, created_at: "", ...extra,
})

describe("separarDia", () => {
  it("la primera pendiente por orden es la actual y el resto va después", () => {
    const dia = separarDia([tarea(3, "v", "pendiente", 30), tarea(1, "v", "hecha", 1), tarea(2, "v", "pendiente", 20), tarea(4, "v", "pendiente", 40)])
    expect(dia.actual?.id).toBe(2)
    expect(dia.despues.map((t) => t.id)).toEqual([3, 4])
    expect(dia.hechas.map((t) => t.id)).toEqual([1])
    expect(dia.total).toBe(4)
  })
  it("los problemas no cuentan como pendientes", () => {
    const dia = separarDia([tarea(1, "v", "problema", 10), tarea(2, "v", "pendiente", 20)])
    expect(dia.actual?.id).toBe(2)
    expect(dia.problemas.map((t) => t.id)).toEqual([1])
  })
  it("sin pendientes no hay actual", () => {
    expect(separarDia([tarea(1, "v", "hecha")]).actual).toBeNull()
    expect(separarDia([]).actual).toBeNull()
  })
  it("las hechas van de la última a la primera", () => {
    const dia = separarDia([
      tarea(1, "v", "hecha", 1, { completada_at: "2026-11-03T11:05:00Z" }),
      tarea(2, "v", "hecha", 2, { completada_at: "2026-11-03T13:40:00Z" }),
    ])
    expect(dia.hechas.map((t) => t.id)).toEqual([2, 1])
  })
})

describe("fechaLarga", () => {
  it("día de la semana con mayúscula, sin coma", () => {
    expect(fechaLarga("2026-11-03")).toBe("Martes 3 de noviembre")
    expect(fechaLarga("2026-11-01")).toBe("Domingo 1 de noviembre")
  })
})

describe("puedeEditarTarea", () => {
  it("quien la hace, quien ve todas y el supervisor", () => {
    const t = tarea(1, "v", "pendiente")
    expect(puedeEditarTarea(t, vilela, equipo)).toBe(true)
    expect(puedeEditarTarea(t, facundo, equipo)).toBe(true)
    expect(puedeEditarTarea(t, { ...lucho, ve_todas_las_tareas: false }, equipo)).toBe(true)
    expect(puedeEditarTarea(t, demian, equipo)).toBe(false)
  })
})

describe("destinatariosProblema", () => {
  it("supervisor primero, después quienes ven todas, sin uno mismo", () => {
    const t = tarea(1, "v", "pendiente")
    expect(destinatariosProblema(t, equipo, "v").map((p) => p.nombre)).toEqual(["Lucho", "Facundo"])
  })
  it("suma a los que afecta y no repite", () => {
    const t = tarea(1, "d", "pendiente", 1, { afecta_a: ["p", "f"] })
    expect(destinatariosProblema(t, equipo, "d").map((p) => p.nombre)).toEqual(["Facundo", "Lucho", "Pato"])
  })
  it("si lo avisa quien ve todo, no se avisa a sí mismo", () => {
    const t = tarea(1, "l", "pendiente")
    expect(destinatariosProblema(t, equipo, "l").map((p) => p.nombre)).toEqual(["Facundo"])
  })
})

describe("primerNombre", () => {
  it("el primer nombre, o lo de antes de la arroba si es un mail", () => {
    expect(primerNombre("Facundo Velazquez")).toBe("Facundo")
    expect(primerNombre("Vilela")).toBe("Vilela")
    expect(primerNombre("joaquin.sotelo@gmail.com")).toBe("joaquin.sotelo")
  })
})

describe("listaNombres", () => {
  it("une con comas y «y»", () => {
    expect(listaNombres([])).toBe("")
    expect(listaNombres(["Lucho"])).toBe("Lucho")
    expect(listaNombres(["Lucho", "Facundo"])).toBe("Lucho y Facundo")
    expect(listaNombres(["Lucho", "Facundo", "Joaquín"])).toBe("Lucho, Facundo y Joaquín")
  })
})

describe("resumenEquipo", () => {
  const tareas = [
    tarea(1, "v", "hecha"), tarea(2, "v", "problema"), tarea(3, "v", "pendiente"),
    tarea(4, "d", "hecha"), tarea(5, "d", "hecha"), tarea(6, "d", "pendiente"),
    tarea(7, "p", "pendiente"),
    tarea(8, "f", "pendiente"),
  ]
  it("sin uno mismo; primero quien tiene problemas, después quien va más atrás", () => {
    const r = resumenEquipo(equipo, tareas, "f")
    expect(r.map((x) => x.persona.nombre)).toEqual(["Vilela", "Pato", "Demian"])
    expect(r[0]).toMatchObject({ hechas: 1, problemas: 1, total: 3, porcentaje: 33 })
  })
  it("quien no tiene tareas no aparece en el resumen", () => {
    expect(resumenEquipo(equipo, tareas, "f").some((x) => x.persona.id === "l")).toBe(false)
    expect(sinTareas(equipo, tareas, "f").map((p) => p.nombre)).toEqual(["Lucho"])
  })
})
