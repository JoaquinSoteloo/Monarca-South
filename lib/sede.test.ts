import { describe, expect, it } from "vitest"
import {
  cajaEnPlano,
  canalDe,
  cuandoEs,
  destinatarioDe,
  estadoSala,
  etapaDesdeSimulador,
  numeroAR,
  numeroOnull,
  personajeDe,
  PLANO_SEDE,
  resumenDia,
  ultimaPorSala,
} from "./sede"
import type { CicloSala } from "./ciclo"
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

const ciclo = (fecha_inicio: string, dias_vege: number, dias_flora: number): CicloSala => ({
  id: 1, sala_id: 1, nombre: null, estado: "abierto", geneticas: null, plantas: null, m2: null,
  fecha_inicio, dias_vege, dias_flora, dias_lavado: 7, dias_secado: 6, dias_limpieza: 2, notas: null,
})

describe("estadoSala (ciclos reales del 03/11/2026)", () => {
  const hoy = "2026-11-03"
  it("Sala 5: último día de vege, pasa a flora el jueves", () => {
    expect(estadoSala(ciclo("2026-09-22", 44, 60), hoy)).toEqual({
      etiqueta: "Vege · día 43 de 44", tono: "vege", proximo: "Pasa a flora este jueves 5/11", pronto: true,
    })
  })
  it("Sala 2: flora, con la fecha de corte", () => {
    expect(estadoSala(ciclo("2026-09-22", 32, 52), hoy)).toMatchObject({ etiqueta: "Flora · día 11 de 52", tono: "flora", proximo: "Corte el 15/12", pronto: false })
  })
  it("Sala 1 y Sala 4: vege", () => {
    expect(estadoSala(ciclo("2026-10-30", 48, 60), hoy).etiqueta).toBe("Vege · día 5 de 48")
    expect(estadoSala(ciclo("2026-10-30", 48, 60), hoy).proximo).toBe("Pasa a flora el 17/12")
    expect(estadoSala(ciclo("2026-10-20", 37, 60), hoy).proximo).toBe("Pasa a flora el 26/11")
  })
  it("sin ciclo", () => {
    expect(estadoSala(null, hoy)).toMatchObject({ etiqueta: "Sin ciclo en curso", tono: "neutro", proximo: null })
  })
  it("hoy y mañana", () => {
    expect(cuandoEs("2026-11-03", hoy)).toBe("hoy")
    expect(cuandoEs("2026-11-04", hoy)).toBe("mañana")
  })
})

describe("plano de la sede", () => {
  it("las cajas quedan dentro del plano", () => {
    for (const a of PLANO_SEDE) {
      const c = cajaEnPlano(a)
      expect(c.left).toBeGreaterThanOrEqual(0)
      expect(c.top).toBeGreaterThanOrEqual(0)
      expect(c.left + c.width).toBeLessThanOrEqual(100.0001)
      expect(c.top + c.height).toBeLessThanOrEqual(100.0001)
    }
  })
  it("están las cuatro salas de la sede (la 4 está en Itaquí)", () => {
    expect(PLANO_SEDE.filter((a) => a.sala).map((a) => a.sala).sort()).toEqual(["Sala 1", "Sala 2", "Sala 3", "Sala 5"])
  })
})

describe("lecturas", () => {
  it("se queda con la más nueva de cada sala", () => {
    const l = (sala_id: number, leido_en: string, temperatura_c: number) => ({ sala_id, leido_en, temperatura_c, humedad_rh: 60, vpd: 1 })
    const m = ultimaPorSala([l(1, "2026-11-03T15:20:00Z", 22), l(1, "2026-11-03T15:24:00Z", 22.3), l(2, "2026-11-03T15:23:00Z", 21.3)])
    expect(m.get(1)?.temperatura_c).toBe(22.3)
    expect(m.get(2)?.temperatura_c).toBe(21.3)
  })
  it("números con coma", () => {
    expect(numeroAR(22.34, 1)).toBe("22,3")
    expect(numeroAR(1.01, 2)).toBe("1,01")
    expect(numeroAR(null, 1)).toBe("—")
  })
})

describe("resumenDia", () => {
  it("mínimo, máximo y promedio, sin los huecos", () => {
    expect(resumenDia([22, null, 26, 24, undefined])).toEqual({ min: 22, max: 26, prom: 24 })
    expect(resumenDia([null, undefined])).toBeNull()
    expect(resumenDia([])).toBeNull()
  })
})
