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
  esSalaVege,
  filasMedicion,
  marcar,
  objetivosSala,
  proximosHitos,
  rangoDeTexto,
  resumenCiclo,
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

describe("ficha de la sala", () => {
  const hoy = "2026-11-03"
  const lectura = { sala_id: 5, temperatura_c: 24.64, humedad_rh: 59.6, vpd: 1.263, luz_lux: 96, leido_en: "2026-11-03T19:43:00Z" }
  const dia = { t: { min: 22.2, max: 25.4, prom: 23.4 }, h: { min: 51, max: 73, prom: 60 }, vpd: { min: 0.74, max: 1.41, prom: 1.17 } }

  it("rangos escritos como en los manuales", () => {
    expect(rangoDeTexto("24–28 °C")).toEqual([24, 28])
    expect(rangoDeTexto("0,8–1,1 kPa")).toEqual([0.8, 1.1])
    expect(rangoDeTexto("5,8", 0.1)?.map((x) => +x.toFixed(2))).toEqual([5.7, 5.9])
    expect(rangoDeTexto("~10 %", 2)).toEqual([5, 15])
    expect(rangoDeTexto("Solo agua de ósmosis")).toEqual([0, 0.2])
    expect(rangoDeTexto("sin números")).toBeNull()
  })

  it("compara con lo que se muestra y respeta el pH máximo de 6,0", () => {
    expect(marcar("humedad", "60–70 %", 59.6)).toBe("ok")
    expect(marcar("humedad", "60–70 %", 59.4)).toBe("bajo")
    expect(marcar("vpd", "0,8–1,1 kPa", 1.263)).toBe("alto")
    expect(marcar("phEntrada", "6,0", 6.1)).toBe("alto")
    expect(marcar("phEntrada", "5,8", 5.9)).toBe("ok")
    expect(marcar("temperatura", null, 25)).toBeNull()
    expect(marcar("temperatura", "24–28 °C", null)).toBeNull()
  })

  it("Sala 5 (vege): objetivo y medición del día", () => {
    const o = objetivosSala(ciclo("2026-09-22", 44, 60), hoy, false)
    const filas = filasMedicion(o, lectura, dia, null)
    expect(filas.map((f) => f.que)).toEqual(["Temperatura", "Humedad", "VPD", "Luz", "EC de entrada", "pH de entrada", "Drenaje", "PPFD"])
    expect(filas[0]).toMatchObject({ objetivo: "24–28 °C", valor: "Ahora 24,6 °C", marca: "ok", detalle: "Hoy de 22,2 °C a 25,4 °C · prom. 23,4 °C" })
    expect(filas[1]).toMatchObject({ valor: "Ahora 60 %", marca: "ok" })
    expect(filas[2]).toMatchObject({ valor: "Ahora 1,26 kPa", marca: "alto" })
    expect(filas[3]).toMatchObject({ objetivo: "18/6", valor: "Ahora prendida" })
    expect(filas[4]).toMatchObject({ valor: null, nota: "Sin riegos cargados" })
    expect(filas[7].nota).toContain("No se mide")
  })

  it("con un riego cargado usa sus valores y su fecha", () => {
    const o = objetivosSala(ciclo("2026-09-22", 44, 60), hoy, false)
    const riego = { fecha: "2026-11-01", ec_entrada: 1.5, ph_entrada: 5.9, drenaje_pct: null }
    const filas = filasMedicion(o, null, null, riego)
    const ec = filas.find((f) => f.que === "EC de entrada")
    expect(ec).toMatchObject({ valor: "Último riego 1,5", marca: "ok", detalle: "del 1/11" })
    expect(filas.find((f) => f.que === "Drenaje")?.nota).toBe("No se anotó en el riego del 1/11")
    expect(filas.find((f) => f.que === "Temperatura")?.nota).toBe("Sin lectura reciente de Pulse")
  })

  it("la sala de vege sin ciclo usa sus objetivos; otra sala sin ciclo, solo lo medido", () => {
    expect(esSalaVege("Sala 3")).toBe(true)
    expect(esSalaVege("Sala 1")).toBe(false)
    expect(objetivosSala(null, hoy, true)?.humedad).toBe("60–75 %")
    const sinObjetivo = filasMedicion(objetivosSala(null, hoy, false), lectura, null, null)
    expect(sinObjetivo.map((f) => f.que)).toEqual(["Temperatura", "Humedad", "VPD", "Luz"])
    expect(sinObjetivo.every((f) => f.marca === null)).toBe(true)
  })

  it("lo que viene, según el protocolo de Ciclos", () => {
    const hitos = proximosHitos(ciclo("2026-09-22", 44, 60), "Sala 5", hoy)
    expect(hitos[0]).toMatchObject({ titulo: "Mapa de PPFD y altura de luces antes de flora", enDias: 1 })
    expect(hitos[1]).toMatchObject({ fecha: "2026-11-05", titulo: "Pasar a 12/12", enDias: 2 })
    expect(hitos).toHaveLength(4)
    expect(resumenCiclo(ciclo("2026-09-22", 44, 60), hoy)).toMatchObject({ flip: "2026-11-05", cosecha: "2027-01-04" })
  })
})
