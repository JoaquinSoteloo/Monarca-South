import { describe, expect, it } from "vitest"
import { semanaParaResumir, sugerenciaPorReglas, textoPorReglas, type DatosSemana, type ResumenSala } from "./resumen-semanal"

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

describe("semanaParaResumir", () => {
  it("solo los lunes desde las 9 (hora argentina), por la semana anterior", () => {
    expect(semanaParaResumir(new Date("2026-11-16T08:30:00-03:00"))).toBeNull()
    expect(semanaParaResumir(new Date("2026-11-15T10:00:00-03:00"))).toBeNull() // domingo
    const s = semanaParaResumir(new Date("2026-11-16T09:05:00-03:00"))!
    expect(s.semana).toBe("2026-11-09")
    expect(s.hasta.toISOString()).toBe("2026-11-16T03:00:00.000Z")
  })
})

describe("sugerencia de respaldo", () => {
  it("elige lo que más tiempo estuvo fuera de rango", () => {
    const d = datos([sala({}), sala({ sala: "Sala 2", humedad: { prom: 66, min: 46, max: 74, pct_en_rango: 31, rango: [45, 55], mas_tiempo_fuera: "alto" } })])
    expect(sugerenciaPorReglas(d)).toBe("Sala 2: la humedad estuvo en rango solo el 31 % del tiempo. Prioridad de la semana: bajar la humedad (deshumidificador, extracción).")
  })
  it("si todo estuvo bien pero no se cargaron riegos, pide cargarlos", () => {
    expect(sugerenciaPorReglas(datos([sala({ riegos_cargados: 0 })]))).toMatch(/Cargar los riegos/)
  })
  it("el texto tiene una línea por sala y lo de Nubi", () => {
    const t = textoPorReglas(datos([sala({})]))
    expect(t).toContain("**Sala 5** (flora): 24 °C (22.5–25.8), 98 % en rango")
    expect(t).toContain("1 mandados, 0 descartados, 2 sin respuesta")
  })
})
