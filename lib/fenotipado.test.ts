import { describe, expect, it } from "vitest"
import {
  datosParaResumen,
  diasDesde,
  normalizarCodigo,
  rankingPorGenetica,
  resumirPlanta,
  type ObservacionFeno,
  type PlantaFeno,
} from "./fenotipado"

const planta = (id: number, codigo: string, extra: Partial<PlantaFeno> = {}): PlantaFeno => ({
  id,
  codigo,
  genetica: "Gelato",
  banco: null,
  fecha_germinacion: "2026-11-01",
  ubicacion: null,
  estado: "en_curso",
  sexo: "sin_definir",
  notas: null,
  ...extra,
})

let n = 0
const obs = (planta_id: number, fecha: string, extra: Partial<ObservacionFeno> = {}): ObservacionFeno => ({
  id: ++n,
  planta_id,
  fecha,
  etapa: "vege",
  semana: null,
  altura_cm: null,
  nudos: null,
  forma: null,
  salud: null,
  olor: null,
  vigor: null,
  estructura: null,
  aroma: null,
  resina: null,
  resistencia: null,
  rendimiento: null,
  peso_humedo_g: null,
  peso_seco_g: null,
  nota: null,
  ...extra,
})

describe("fenotipado", () => {
  it("normaliza códigos", () => {
    expect(normalizarCodigo("gel 3")).toBe("GEL-03")
    expect(normalizarCodigo("Gel-03")).toBe("GEL-03")
    expect(normalizarCodigo("TR12")).toBe("TR-12")
    expect(normalizarCodigo("  ")).toBeNull()
  })

  it("cuenta días entre fechas", () => {
    expect(diasDesde("2026-11-01", "2026-11-18")).toBe(17)
    expect(diasDesde(null, "2026-11-18")).toBeNull()
  })

  it("resume altura, crecimiento por semana, estiramiento y puntajes", () => {
    const p = planta(1, "GEL-01")
    const o = [
      obs(1, "2026-11-08", { altura_cm: 5 }),
      obs(1, "2026-11-15", { altura_cm: 12, vigor: 3 }),
      obs(1, "2026-11-22", { altura_cm: 20, etapa: "vege", vigor: 4, estructura: 5, olor: "lima" }),
      obs(1, "2026-12-06", { altura_cm: 45, etapa: "flora", semana: 2, nota: "estira mucho" }),
    ]
    const r = resumirPlanta(p, o, "2026-12-06")
    expect(r.observaciones).toBe(4)
    expect(r.altura_actual).toBe(45)
    expect(r.crecimiento_cm_semana).toBe(10) // (45 - 5) cm en 28 días
    expect(r.estiramiento_cm).toBe(25)
    expect(r.puntajes.vigor).toBe(4)
    expect(r.puntaje_promedio).toBe(4.5)
    expect(r.etapa_actual).toBe("flora")
    expect(r.ultima_nota).toBe("estira mucho")
    expect(r.ultimo_olor).toBe("lima")
    expect(r.alertas).toEqual([])
  })

  it("avisa machos en curso y plantas sin revisar hace más de una semana", () => {
    const r = resumirPlanta(planta(2, "GEL-02", { sexo: "macho" }), [obs(2, "2026-11-05")], "2026-11-18")
    expect(r.alertas.join(" ")).toContain("macho")
    expect(r.alertas.join(" ")).toContain("13 días")
  })

  it("ordena por genética: madre primero, después puntaje, descartadas al final", () => {
    const ps = [
      planta(1, "GEL-01", { estado: "descartada" }),
      planta(2, "GEL-02"),
      planta(3, "GEL-03", { estado: "madre" }),
      planta(4, "GEL-04"),
      planta(5, "TR-01", { genetica: "Tropical Runtz" }),
    ]
    const o = [obs(1, "2026-11-10", { vigor: 5 }), obs(2, "2026-11-10", { vigor: 2 }), obs(4, "2026-11-10", { vigor: 4 })]
    const ranking = rankingPorGenetica(ps.map((p) => resumirPlanta(p, o, "2026-11-12")))
    expect(ranking.map((g) => g.genetica)).toEqual(["Gelato", "Tropical Runtz"])
    expect(ranking[0].plantas.map((r) => r.planta.codigo)).toEqual(["GEL-03", "GEL-04", "GEL-02", "GEL-01"])
    const texto = datosParaResumen(ranking.flatMap((g) => g.plantas), o)
    expect(texto).toContain("GEL-03 — Elegida como madre")
    expect(texto).toContain("Tropical Runtz:")
  })
})
