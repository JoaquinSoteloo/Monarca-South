import { describe, expect, it } from "vitest"
import { canalDe, destinatarioDe, etapaDesdeSimulador, numeroOnull, personajeDe, resumenDia, ultimaPorSala } from "./sede"
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

describe("lecturas", () => {
  it("se queda con la más nueva de cada sala", () => {
    const l = (sala_id: number, leido_en: string, temperatura_c: number) => ({ sala_id, leido_en, temperatura_c, humedad_rh: 60, vpd: 1 })
    const m = ultimaPorSala([l(1, "2026-11-03T15:20:00Z", 22), l(1, "2026-11-03T15:24:00Z", 22.3), l(2, "2026-11-03T15:23:00Z", 21.3)])
    expect(m.get(1)?.temperatura_c).toBe(22.3)
    expect(m.get(2)?.temperatura_c).toBe(21.3)
  })
})

describe("resumenDia", () => {
  it("mínimo, máximo y promedio, sin los huecos", () => {
    expect(resumenDia([22, null, 26, 24, undefined])).toEqual({ min: 22, max: 26, prom: 24 })
    expect(resumenDia([null, undefined])).toBeNull()
    expect(resumenDia([])).toBeNull()
  })
})
