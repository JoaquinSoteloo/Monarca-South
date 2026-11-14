import { describe, expect, it } from "vitest"
import { comoEstuvo, datosParaIA, prioridad, semanaParaResumir, sugerenciaPorReglas, textoPorReglas, type DatosSemana, type ResumenSala } from "./resumen-semanal"

const sala = (over: Partial<ResumenSala>): ResumenSala => ({
  sala: "Sala 5",
  etapa: "flora",
  horas_medidas: 168,
  temperatura: { prom: 24, min: 22.5, max: 25.8, pct_en_rango: 98, rango: [22, 26], mas_tiempo_fuera: "alto" },
  humedad: { prom: 50, min: 44, max: 56, pct_en_rango: 95, rango: [45, 55], mas_tiempo_fuera: "alto" },
  alertas: { temperatura: 0, humedad: 0, luz: 0 },
  riegos_cargados: 3,
  ...over,
})
const datos = (salas: ResumenSala[]): DatosSemana => ({
  desde: "2026-11-09",
  hasta: "2026-11-15",
  salas,
  nubi: { mandadas: 1, descartadas: 0, vencidas: 2, avisos: 0 },
  ordenes_fallidas: 1,
})
// Lo que pasó la semana del 07/11: Sala 3 (madres) con humedad baja, Sala 5 (flora) con humedad alta.
const sala3 = sala({ sala: "Sala 3", etapa: "madres y esquejes", humedad: { prom: 53.8, min: 36.5, max: 75.8, pct_en_rango: 17, rango: [60, 75], mas_tiempo_fuera: "bajo" } })
const sala5 = sala({ humedad: { prom: 65.3, min: 55.1, max: 80.8, pct_en_rango: 54, rango: [45, 55], mas_tiempo_fuera: "alto" } })

describe("semanaParaResumir", () => {
  it("solo los lunes desde las 9 (hora argentina), por la semana anterior", () => {
    expect(semanaParaResumir(new Date("2026-11-16T08:30:00-03:00"))).toBeNull()
    expect(semanaParaResumir(new Date("2026-11-15T10:00:00-03:00"))).toBeNull() // domingo
    const s = semanaParaResumir(new Date("2026-11-16T09:05:00-03:00"))!
    expect(s.semana).toBe("2026-11-09")
    expect(s.hasta.toISOString()).toBe("2026-11-16T03:00:00.000Z")
  })
})

describe("cómo estuvo, en palabras", () => {
  it("respeta la dirección", () => {
    expect(comoEstuvo(sala3.humedad)).toBe("baja casi toda la semana")
    expect(comoEstuvo(sala5.humedad)).toBe("un poco alta a veces")
    expect(comoEstuvo(sala5.temperatura)).toBeNull()
  })
  it("al modelo le llega en palabras, con qué hacer en la dirección correcta", () => {
    const ia = datosParaIA(datos([sala3])) as unknown as { salas: Record<string, any>[] }
    expect(ia.salas[0].humedad).toMatchObject({ como_estuvo: "baja casi toda la semana", tiene_que_estar: "entre 60 y 75 %", promedio: "53,8 %" })
    expect((ia.salas[0].humedad as { que_hacer: string }).que_hacer).toMatch(/humidificador/)
    expect(JSON.stringify(ia)).not.toMatch(/pct_en_rango/)
  })
})

describe("prioridad", () => {
  it("la humedad alta en flora pesa más que una sala de madres", () => {
    expect(prioridad(datos([sala3, sala5]))).toMatchObject({ sala: "Sala 5", variable: "humedad", por_que: expect.stringMatching(/hongos/) })
  })
  it("sugerencia de respaldo en frases claras", () => {
    expect(sugerenciaPorReglas(datos([sala3]))).toBe(
      "En Sala 3, la humedad estuvo baja casi toda la semana: en promedio 53,8 %, cuando tiene que estar entre 60 y 75 %. Para corregirlo: bajar la extracción, sumar un humidificador o poner bandejas con agua.",
    )
  })
  it("si todo estuvo bien pero no se cargaron riegos, pide cargarlos", () => {
    expect(sugerenciaPorReglas(datos([sala({ riegos_cargados: 0 })]))).toMatch(/Cargar los riegos/)
  })
  it("texto de respaldo: un párrafo por sala, con negrita", () => {
    expect(textoPorReglas(datos([sala3]))).toContain("**Sala 3**, en madres y esquejes: la temperatura estuvo bien y la humedad estuvo **baja casi toda la semana**, en promedio 53,8 %.")
  })
})
