import { describe, expect, it } from "vitest"
import {
  describirFrecuencia,
  destinatariosAlertaRiego,
  ordenarTareas,
  personasVisibles,
  progreso,
  type Perfil,
  type Tarea,
} from "./equipo"

const perfil = (id: string, nombre: string, extra: Partial<Perfil> = {}): Perfil => ({
  id, nombre, rol: "cultivo", ve_todas_las_tareas: false, supervisor_id: null, activo: true, ...extra,
})
const facundo = perfil("f", "Facundo", { rol: "direccion", ve_todas_las_tareas: true })
const lucho = perfil("l", "Lucho", { ve_todas_las_tareas: true })
const vilela = perfil("v", "Vilela", { rol: "mantenimiento", supervisor_id: "l" })
const demian = perfil("d", "Demian", { rol: "atencion", supervisor_id: "f" })
const equipo = [facundo, lucho, vilela, demian]

const tarea = (id: number, responsable_id: string, estado: Tarea["estado"], orden = 100): Tarea => ({
  id, fecha: "2026-11-02", titulo: `T${id}`, detalle: null, responsable_id, creada_por: null, plantilla_id: null,
  afecta_a: [], estado, nota: null, completada_at: null, completada_por: null, orden, created_at: "",
})

describe("personasVisibles", () => {
  it("Facundo y Lucho ven a todos", () => {
    expect(personasVisibles(facundo, equipo).map((p) => p.nombre)).toEqual(["Facundo", "Lucho", "Vilela", "Demian"])
    expect(personasVisibles(lucho, equipo)).toHaveLength(4)
  })
  it("Vilela y Demian ven solo lo suyo", () => {
    expect(personasVisibles(vilela, equipo).map((p) => p.nombre)).toEqual(["Vilela"])
    expect(personasVisibles(demian, equipo).map((p) => p.nombre)).toEqual(["Demian"])
  })
  it("quien supervisa ve a sus supervisados aunque no vea todo", () => {
    const lucho2 = { ...lucho, ve_todas_las_tareas: false }
    expect(personasVisibles(lucho2, [facundo, lucho2, vilela, demian]).map((p) => p.nombre)).toEqual(["Lucho", "Vilela"])
  })
})

describe("ordenarTareas", () => {
  it("pone primero las mías y dentro de cada persona: problema, pendiente, hecha", () => {
    const ts = [tarea(1, "v", "hecha"), tarea(2, "l", "pendiente"), tarea(3, "v", "problema"), tarea(4, "v", "pendiente", 5)]
    expect(ordenarTareas(ts, equipo, "l").map((t) => t.id)).toEqual([2, 3, 4, 1])
  })
})

describe("progreso", () => {
  it("cuenta hechas y problemas como resueltas", () => {
    expect(progreso([tarea(1, "v", "hecha"), tarea(2, "v", "problema"), tarea(3, "v", "pendiente"), tarea(4, "v", "pendiente")]))
      .toEqual({ total: 4, hechas: 1, problemas: 1, pendientes: 2, porcentaje: 50 })
    expect(progreso([]).porcentaje).toBe(0)
  })
})

describe("describirFrecuencia", () => {
  it("describe en castellano", () => {
    expect(describirFrecuencia({ frecuencia: "semanal", dias_semana: [1, 2, 3, 4, 5, 6], dia_mes: null })).toBe("Lun a Sáb")
    expect(describirFrecuencia({ frecuencia: "semanal", dias_semana: [5, 1, 3], dia_mes: null })).toBe("Lun, Mié y Vie")
    expect(describirFrecuencia({ frecuencia: "semanal", dias_semana: [1, 2, 3, 4, 5, 6, 7], dia_mes: null })).toBe("Todos los días")
    expect(describirFrecuencia({ frecuencia: "semanal", dias_semana: [1], dia_mes: null })).toBe("Cada lunes")
    expect(describirFrecuencia({ frecuencia: "mensual_dia", dias_semana: [1], dia_mes: 5 })).toBe("El 5 de cada mes")
    expect(describirFrecuencia({ frecuencia: "mensual_primer", dias_semana: [2], dia_mes: null })).toBe("Primer martes del mes")
  })
})

describe("destinatariosAlertaRiego", () => {
  it("si carga Vilela avisa a Facundo y Lucho", () => {
    expect(destinatariosAlertaRiego(vilela, equipo).sort()).toEqual(["f", "l"])
  })
  it("si carga Lucho avisa solo a Facundo", () => {
    expect(destinatariosAlertaRiego(lucho, equipo)).toEqual(["f"])
  })
  it("sin perfil (cuenta admin) avisa a Facundo y Lucho", () => {
    expect(destinatariosAlertaRiego(null, equipo).sort()).toEqual(["f", "l"])
  })
})
