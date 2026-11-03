import { describe, expect, it } from "vitest"
import { canalDe, destinatarioDe, etapaDesdeSimulador, numeroOnull, personajeDe } from "./sede"
import { historialParaApi, promptSistema, textoDeRespuesta } from "./asistente"

describe("sede", () => {
  it("asocia usuarios del sistema con los personajes del simulador", () => {
    expect(personajeDe("Luciano Campilongo")).toBe("Lucho")
    expect(personajeDe("Agustín Vilela")).toBe("Vilela")
    expect(personajeDe("Demian Feinel")).toBe("Demian")
    expect(personajeDe("Patricio Simone")).toBe("Pato")
    expect(personajeDe("Facundo Velazquez")).toBe("Facundo")
    expect(personajeDe("Joaquín Sotelo")).toBe("Joaquín Sotelo")
  })

  it("arma y lee los canales del chat", () => {
    expect(canalDe("Vilela", null)).toBe("todos")
    expect(canalDe("Vilela", "Lucho")).toBe(canalDe("Lucho", "Vilela"))
    expect(destinatarioDe(canalDe("Vilela", "Lucho"), "Vilela")).toBe("Lucho")
    expect(destinatarioDe("todos", "Vilela")).toBeNull()
  })

  it("convierte etapas y números del formulario", () => {
    expect(etapaDesdeSimulador("Vege en sala de flora")).toBe("vegetativo")
    expect(etapaDesdeSimulador("Sala de vege")).toBe("esqueje")
    expect(etapaDesdeSimulador("Flora")).toBe("floracion")
    expect(numeroOnull("1,6")).toBe(1.6)
    expect(numeroOnull("")).toBeNull()
    expect(numeroOnull("abc")).toBeNull()
  })
})

describe("asistente", () => {
  it("el historial empieza por una pregunta y junta turnos seguidos", () => {
    const h = historialParaApi([
      { rol: "assistant", cuerpo: "respuesta vieja" },
      { rol: "user", cuerpo: "hola" },
      { rol: "user", cuerpo: "¿qué EC uso?" },
      { rol: "assistant", cuerpo: "1,6" },
    ])
    expect(h).toEqual([
      { role: "user", content: "hola\n\n¿qué EC uso?" },
      { role: "assistant", content: "1,6" },
    ])
  })

  it("el prompt lleva las reglas de Monarca", () => {
    const p = promptSistema("Vilela", "2026-11-02")
    expect(p).toContain("pH MÁXIMO 6,0")
    expect(p).toContain("Quien pregunta: Vilela")
    expect(p).toContain("Lucho")
  })

  it("junta el texto de la respuesta", () => {
    expect(textoDeRespuesta([{ type: "text", text: "a" }, { type: "tool_use" }, { type: "text", text: "b" }])).toBe("a\nb")
  })
})
