import { describe, expect, it } from "vitest"
import type { Mensaje, Perfil, Tarea } from "./equipo"
import {
  armarLista,
  claveConversacion,
  contarSinLeer,
  conversacionDeMensaje,
  etiquetaDia,
  leerConversacion,
  mensajesDe,
  teInvolucra,
} from "./chat"

const perfil = (id: string, nombre: string, extra: Partial<Perfil> = {}): Perfil => ({
  id, nombre, rol: "cultivo", ve_todas_las_tareas: false, supervisor_id: null, activo: true, ...extra,
})
const facundo = perfil("f", "Facundo", { rol: "direccion", ve_todas_las_tareas: true })
const lucho = perfil("l", "Lucho", { ve_todas_las_tareas: true })
const vilela = perfil("v", "Vilela", { rol: "mantenimiento", supervisor_id: "l" })
const demian = perfil("d", "Demian", { rol: "atencion", supervisor_id: "f" })
const equipo = [facundo, lucho, vilela, demian]

let n = 0
const msg = (autor_id: string, cuerpo: string, created_at: string, extra: Partial<Mensaje> = {}): Mensaje => ({
  id: ++n, autor_id, tarea_id: null, para_id: null, cuerpo, created_at, ...extra,
})
const tarea = (id: number, responsable_id: string, extra: Partial<Tarea> = {}): Tarea => ({
  id, fecha: "2026-11-03", titulo: `T${id}`, detalle: null, responsable_id, creada_por: null, plantilla_id: null,
  afecta_a: [], estado: "problema", nota: null, completada_at: null, completada_por: null, orden: 1, created_at: "2026-11-03T08:00:00Z", ...extra,
})

describe("leerConversacion", () => {
  it("lee las cuatro clases y descarta lo raro", () => {
    expect(leerConversacion("asistente")).toEqual({ tipo: "asistente" })
    expect(leerConversacion("todos")).toEqual({ tipo: "todos" })
    expect(leerConversacion("p:abc")).toEqual({ tipo: "privado", con: "abc" })
    expect(leerConversacion("t:12")).toEqual({ tipo: "tarea", id: 12 })
    expect(leerConversacion("t:x")).toBeNull()
    expect(leerConversacion("p:")).toBeNull()
    expect(leerConversacion(null)).toBeNull()
  })
  it("ida y vuelta con la clave", () => {
    for (const c of ["asistente", "todos", "p:abc", "t:12"]) expect(claveConversacion(leerConversacion(c)!)).toBe(c)
  })
})

describe("conversacionDeMensaje", () => {
  it("un privado es con la otra persona, lo haya escrito yo o no", () => {
    expect(conversacionDeMensaje({ autor_id: "v", para_id: "l", tarea_id: null }, "v")).toBe("p:l")
    expect(conversacionDeMensaje({ autor_id: "l", para_id: "v", tarea_id: null }, "v")).toBe("p:l")
    expect(conversacionDeMensaje({ autor_id: "l", para_id: null, tarea_id: null }, "v")).toBe("todos")
    expect(conversacionDeMensaje({ autor_id: "l", para_id: null, tarea_id: 7 }, "v")).toBe("t:7")
  })
})

describe("contarSinLeer", () => {
  const ms = [
    msg("l", "a", "2026-11-03T10:00:00Z"),
    msg("v", "mío", "2026-11-03T10:05:00Z"),
    msg("d", "b", "2026-11-03T10:10:00Z"),
    msg("l", "privado", "2026-11-03T10:20:00Z", { para_id: "v" }),
  ]
  it("solo lo de otros, después de lo leído y en esa conversación", () => {
    expect(contarSinLeer(ms, "todos", "v", "2026-11-03T09:00:00Z")).toBe(2)
    expect(contarSinLeer(ms, "todos", "v", "2026-11-03T10:00:00Z")).toBe(1)
    expect(contarSinLeer(ms, "p:l", "v", "2026-11-03T09:00:00Z")).toBe(1)
    expect(contarSinLeer(ms, "todos", "v", undefined)).toBe(0)
  })
})

describe("teInvolucra", () => {
  it("lo propio, lo de quien supervisa, lo que afecta y todo para quien ve todo", () => {
    const t = tarea(1, "v")
    expect(teInvolucra(t, vilela, equipo)).toBe(true)
    expect(teInvolucra(t, facundo, equipo)).toBe(true)
    expect(teInvolucra(t, { ...lucho, ve_todas_las_tareas: false }, equipo)).toBe(true)
    expect(teInvolucra(t, demian, equipo)).toBe(false)
    expect(teInvolucra(tarea(2, "v", { afecta_a: ["d"] }), demian, equipo)).toBe(true)
  })
})

describe("armarLista", () => {
  const generales = [
    msg("d", "El mostrador quedó impecable", "2026-11-03T13:12:00Z"),
    msg("l", "Dale, mañana", "2026-11-02T18:00:00Z", { para_id: "v" }),
    msg("v", "Lo dejo lleno", "2026-11-02T18:05:00Z", { para_id: "l" }),
  ]
  const problema = tarea(9, "v", { titulo: "Recorrer las salas", nota: "Mosquitas en la sala 2", completada_at: "2026-11-03T13:58:00Z" })
  const comentarios = [msg("l", "A la tarde paso", "2026-11-03T14:05:00Z", { tarea_id: 9 })]
  const lista = armarLista({
    yo: vilela,
    perfiles: equipo,
    generales,
    problemas: [problema],
    comentarios,
    leidos: { "p:l": "2026-11-02T19:00:00Z" },
    desde: "2026-11-01T00:00:00Z",
  })

  it("la más reciente arriba y las personas sin mensajes al final", () => {
    expect(lista.map((f) => f.clave)).toEqual(["t:9", "todos", "p:l", "p:d", "p:f"])
  })
  it("vista previa con quién lo dijo", () => {
    expect(lista[0]).toMatchObject({ titulo: "Recorrer las salas", vistaPrevia: "Lucho: A la tarde paso", sinLeer: 1 })
    expect(lista[1].vistaPrevia).toBe("Demian: El mostrador quedó impecable")
    expect(lista[2]).toMatchObject({ titulo: "Lucho", vistaPrevia: "Vos: Lo dejo lleno", sinLeer: 0 })
    expect(lista[3].vistaPrevia).toBe("Sin mensajes todavía")
  })
  it("sin ningún mensaje, el canal de todos va primero", () => {
    const vacia = armarLista({ yo: vilela, perfiles: equipo, generales: [], problemas: [], comentarios: [], leidos: {}, desde: "2026-11-01T00:00:00Z" })
    expect(vacia.map((f) => f.clave)).toEqual(["todos", "p:d", "p:f", "p:l"])
  })
  it("sin comentarios, la tarea muestra el problema avisado", () => {
    const sola = armarLista({ yo: lucho, perfiles: equipo, generales: [], problemas: [problema], comentarios: [], leidos: {}, desde: "2026-11-01T00:00:00Z" })
    expect(sola.find((f) => f.clave === "t:9")?.vistaPrevia).toBe("Vilela: Mosquitas en la sala 2")
  })
})

describe("mensajesDe", () => {
  it("separa el canal, los privados y los comentarios, en orden", () => {
    const generales = [
      msg("l", "privado 2", "2026-11-03T10:02:00Z", { para_id: "v" }),
      msg("l", "canal", "2026-11-03T10:00:00Z"),
      msg("v", "privado 1", "2026-11-03T10:01:00Z", { para_id: "l" }),
    ]
    expect(mensajesDe({ tipo: "privado", con: "l" }, generales, [], "v").map((m) => m.cuerpo)).toEqual(["privado 1", "privado 2"])
    expect(mensajesDe({ tipo: "todos" }, generales, [], "v").map((m) => m.cuerpo)).toEqual(["canal"])
  })
})

describe("etiquetaDia", () => {
  const ahora = new Date("2026-11-03T15:00:00Z")
  it("hoy, ayer o el día", () => {
    expect(etiquetaDia("2026-11-03T13:00:00Z", ahora)).toBe("Hoy")
    expect(etiquetaDia("2026-11-02T13:00:00Z", ahora)).toBe("Ayer")
    expect(etiquetaDia("2026-10-30T13:00:00Z", ahora)).toBe("viernes 30/10")
  })
})
