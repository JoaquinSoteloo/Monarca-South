import { describe, expect, it } from "vitest"
import type { Perfil } from "./equipo"
import { leerConversacion } from "./chat"
import { avisoDeMensaje, destinatariosDeMensaje, recortar } from "./chat-push"

const perfil = (id: string, nombre: string, extra: Partial<Perfil> = {}): Perfil => ({
  id, nombre, rol: "cultivo", ve_todas_las_tareas: false, supervisor_id: null, activo: true, ...extra,
})
const facundo = perfil("f", "Facundo", { rol: "direccion", ve_todas_las_tareas: true })
const lucho = perfil("l", "Lucho", { ve_todas_las_tareas: true })
const vilela = perfil("v", "Vilela", { rol: "mantenimiento", supervisor_id: "l" })
const pato = perfil("p", "Pato", { rol: "ayudante", supervisor_id: "l" })
const demian = perfil("d", "Demian", { rol: "atencion", supervisor_id: "f" })
const baja = perfil("b", "Ex", { ve_todas_las_tareas: true, activo: false })
const equipo = [facundo, lucho, vilela, pato, demian, baja]

const todos = (autor_id: string, cuerpo = "Hola") => ({ autor_id, cuerpo, tarea_id: null, para_id: null })
const privado = (autor_id: string, para_id: string, cuerpo = "Hola") => ({ autor_id, cuerpo, tarea_id: null, para_id })
const comentario = (autor_id: string, cuerpo = "Hola") => ({ autor_id, cuerpo, tarea_id: 9, para_id: null })
const tarea = (responsable_id: string, afecta_a: string[] = []) => ({ titulo: "Recorrer las salas", responsable_id, afecta_a })
const ordenados = (ids: string[]) => [...ids].sort()

describe("destinatariosDeMensaje", () => {
  it("«Todos»: todo el equipo activo menos quien escribe", () => {
    expect(ordenados(destinatariosDeMensaje(todos("l"), equipo, null))).toEqual(["d", "f", "p", "v"])
  })

  it("privado: solo a quien va", () => {
    expect(destinatariosDeMensaje(privado("l", "v"), equipo, null)).toEqual(["v"])
  })

  it("privado a alguien dado de baja o a uno mismo: a nadie", () => {
    expect(destinatariosDeMensaje(privado("l", "b"), equipo, null)).toEqual([])
    expect(destinatariosDeMensaje(privado("l", "l"), equipo, null)).toEqual([])
  })

  it("comentario: quien la hace, su supervisor, los afectados y quienes ven todas las tareas", () => {
    // Tarea de Vilela que afecta a Demian; Facundo y Lucho ven todas, Pato no tiene nada que ver.
    expect(ordenados(destinatariosDeMensaje(comentario("p"), equipo, tarea("v", ["d"])))).toEqual(["d", "f", "l", "v"])
    // Quien la hace comenta: no se avisa a sí mismo.
    expect(ordenados(destinatariosDeMensaje(comentario("v"), equipo, tarea("v")))).toEqual(["f", "l"])
  })

  it("comentario: el supervisor se entera aunque no vea todas las tareas", () => {
    const sinVerTodo = equipo.map((p) => (p.id === "l" ? { ...p, ve_todas_las_tareas: false } : p))
    expect(ordenados(destinatariosDeMensaje(comentario("d"), sinVerTodo, tarea("v")))).toEqual(["f", "l", "v"])
  })

  it("comentario de una tarea que ya no está: a nadie", () => {
    expect(destinatariosDeMensaje(comentario("l"), equipo, null)).toEqual([])
  })
})

describe("recortar", () => {
  it("deja el texto en una línea", () => {
    expect(recortar("  Hola\n\nche,   ¿venís?  ")).toBe("Hola che, ¿venís?")
  })

  it("corta en 120 letras con «…», sin partir un emoji ni dejar un espacio antes", () => {
    expect(recortar("a".repeat(120))).toBe("a".repeat(120))
    expect(recortar("a".repeat(130))).toBe(`${"a".repeat(119)}…`)
    expect(Array.from(recortar("🌱".repeat(130)))).toEqual([...Array(119).fill("🌱"), "…"])
    expect(recortar(`${"a".repeat(118)} bbbb`)).toBe(`${"a".repeat(118)}…`)
  })
})

describe("avisoDeMensaje", () => {
  it("«Todos»", () => {
    expect(avisoDeMensaje(todos("l", "Mañana llega el sustrato"), equipo, null).payload).toEqual({
      title: "Lucho en Todos",
      body: "Mañana llega el sustrato",
      url: "/chat?c=todos",
      tag: "chat-todos",
    })
  })

  it("privado: abre la conversación con quien escribió", () => {
    const aviso = avisoDeMensaje(privado("l", "v", "¿Pasás por la sala 2?"), equipo, null)
    expect(aviso).toEqual({
      destinatarios: ["v"],
      payload: { title: "Lucho te escribió", body: "¿Pasás por la sala 2?", url: "/chat?c=p:l", tag: "chat-p:l" },
    })
  })

  it("comentario de tarea: el título dice la tarea y el cuerpo, quién", () => {
    expect(avisoDeMensaje(comentario("l", "A la tarde paso"), equipo, tarea("v")).payload).toEqual({
      title: "Comentario en Recorrer las salas",
      body: "Lucho: A la tarde paso",
      url: "/chat?c=t:9",
      tag: "chat-t:9",
    })
  })

  it("autor desconocido y texto largo", () => {
    const { payload } = avisoDeMensaje(todos("x", "b".repeat(300)), equipo, null)
    expect(payload.title).toBe("Alguien en Todos")
    expect(payload.body).toHaveLength(120)
  })

  it("la dirección abre esa conversación en el Chat", () => {
    const abre = (url: string | undefined) => leerConversacion(new URL(url ?? "", "https://monarca.test").searchParams.get("c"))
    expect(abre(avisoDeMensaje(todos("l"), equipo, null).payload.url)).toEqual({ tipo: "todos" })
    expect(abre(avisoDeMensaje(privado("l", "v"), equipo, null).payload.url)).toEqual({ tipo: "privado", con: "l" })
    expect(abre(avisoDeMensaje(comentario("l"), equipo, tarea("v")).payload.url)).toEqual({ tipo: "tarea", id: 9 })
  })
})
