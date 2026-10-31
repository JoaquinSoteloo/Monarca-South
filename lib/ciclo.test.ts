import { describe, expect, it } from "vitest"
import {
  cicloActual,
  etapaRiegoDe,
  fechasCiclo,
  filasTareasCiclo,
  momentoCiclo,
  objetivos,
  plantasPara,
  protocoloMonarca,
  solapamientos,
  sumarDias,
  type CicloSala,
} from "./ciclo"
import type { Perfil } from "./equipo"

const ciclo = (extra: Partial<CicloSala> = {}): CicloSala => ({
  id: 1, sala_id: 2, nombre: null, estado: "abierto", geneticas: null, plantas: null, m2: 6,
  fecha_inicio: "2026-10-02", dias_vege: 21, dias_flora: 60, dias_lavado: 7, dias_secado: 6, dias_limpieza: 2,
  notas: null, ...extra,
})

describe("fechas", () => {
  it("suma días cruzando meses y años", () => {
    expect(sumarDias("2026-12-30", 3)).toBe("2027-01-02")
    expect(sumarDias("2026-03-01", -1)).toBe("2026-02-28")
  })
  it("Sala 2 (entrada 02/10): flora 23/10, cosecha 22/12, libre 30/12", () => {
    expect(fechasCiclo(ciclo())).toEqual({
      inicio: "2026-10-02", flip: "2026-10-23", lavado: "2026-12-15", cosecha: "2026-12-22",
      finSecado: "2026-12-28", libre: "2026-12-30",
    })
  })
  it("el planificador recalcula todo al cambiar la flora", () => {
    expect(fechasCiclo(ciclo({ dias_flora: 63 })).cosecha).toBe("2026-12-25")
  })
})

describe("momentoCiclo", () => {
  it("vege: día y semana", () => {
    expect(momentoCiclo(ciclo(), "2026-10-02")).toMatchObject({ fase: "vegetativo", diaCiclo: 1, diaFase: 1, semana: 1 })
    expect(momentoCiclo(ciclo(), "2026-10-22")).toMatchObject({ fase: "vegetativo", diaFase: 21, semana: 3 })
  })
  it("flora y lavado", () => {
    expect(momentoCiclo(ciclo(), "2026-10-23")).toMatchObject({ fase: "floracion", diaFase: 1, semana: 1 })
    expect(momentoCiclo(ciclo(), "2026-10-31")).toMatchObject({ fase: "floracion", diaFase: 9, semana: 2, faltanCosecha: 52 })
    expect(momentoCiclo(ciclo(), "2026-12-15")).toMatchObject({ fase: "lavado", semana: 8 })
  })
  it("secado, limpieza, libre y planificado", () => {
    expect(momentoCiclo(ciclo(), "2026-12-22").fase).toBe("secado")
    expect(momentoCiclo(ciclo(), "2026-12-28").fase).toBe("limpieza")
    expect(momentoCiclo(ciclo(), "2026-12-30")).toMatchObject({ fase: "libre", avance: 100 })
    expect(momentoCiclo(ciclo(), "2026-09-30").fase).toBe("planificado")
  })
})

describe("objetivos y riego", () => {
  it("flora semana 2: 12/12, EC 1,7, pH 6,0", () => {
    const m = momentoCiclo(ciclo(), "2026-10-31")
    expect(etapaRiegoDe(m)).toEqual({ etapa: "floracion", semana: 2 })
    expect(objetivos(m, ciclo())).toMatchObject({ fotoperiodo: "12/12", ecEntrada: "1,7", phEntrada: "6,0", temperatura: "22–26 °C" })
  })
  it("vege semana 1: 18/6, EC 1,0, pH 5,8", () => {
    expect(objetivos(momentoCiclo(ciclo(), "2026-10-03"), ciclo())).toMatchObject({ fotoperiodo: "18/6", ecEntrada: "1,0", phEntrada: "5,8" })
  })
  it("últimas dos semanas bajan temperatura y humedad; lavado es solo agua", () => {
    const m = momentoCiclo(ciclo(), "2026-12-16")
    expect(objetivos(m, ciclo())).toMatchObject({ ecEntrada: "Solo agua de ósmosis", humedad: "40–50 %" })
  })
  it("secado: 20 °C y 55 %", () => {
    expect(objetivos(momentoCiclo(ciclo(), "2026-12-23"), ciclo())).toMatchObject({ temperatura: "20 °C", humedad: "55 %" })
  })
})

describe("protocolo", () => {
  it("genera los hitos con sus fechas", () => {
    const p = protocoloMonarca(ciclo(), "Sala 2")
    const fecha = (clave: string) => p.find((t) => t.clave === clave)?.fecha
    expect(fecha("flip")).toBe("2026-10-23")
    expect(fecha("higiene")).toBe("2026-12-19")
    expect(fecha("corte")).toBe("2026-12-22")
    expect(fecha("esquejes_vege")).toBe("2026-11-30")
    expect(p.filter((t) => t.clave.startsWith("secado_"))).toHaveLength(5)
    expect(new Set(p.map((t) => t.clave)).size).toBe(p.length)
  })
  it("calcula esquejes por m²", () => {
    expect(plantasPara(6)).toBe(106)
    expect(plantasPara(10)).toBe(176)
  })
  it("asigna por rol y solo desde la fecha pedida", () => {
    const perfiles: Perfil[] = [
      { id: "f", nombre: "Facundo", rol: "direccion", ve_todas_las_tareas: true, supervisor_id: null, activo: true },
      { id: "l", nombre: "Lucho", rol: "cultivo", ve_todas_las_tareas: true, supervisor_id: null, activo: true },
      { id: "v", nombre: "Vilela", rol: "mantenimiento", ve_todas_las_tareas: false, supervisor_id: "l", activo: true },
    ]
    const filas = filasTareasCiclo(ciclo(), "Sala 2", perfiles, "2026-10-31")
    expect(filas.every((f) => f.fecha >= "2026-10-31")).toBe(true)
    expect(filas.find((f) => f.clave === "higiene")).toMatchObject({ responsable_id: "v", afecta_a: ["l"] })
    // Sin Demian, las tareas de atención van a Lucho.
    expect(filas.find((f) => f.clave === "peso_humedo")?.responsable_id).toBe("l")
    expect(filas.find((f) => f.clave === "flip")).toBeUndefined()
  })
})

describe("ciclos por sala", () => {
  it("elige el ciclo en curso o el próximo", () => {
    const actual = ciclo({ id: 1 })
    const proximo = ciclo({ id: 2, fecha_inicio: "2026-12-30" })
    expect(cicloActual([proximo, actual], 2, "2026-11-01")?.id).toBe(1)
    expect(cicloActual([proximo, actual], 2, "2026-12-30")?.id).toBe(2)
    expect(cicloActual([actual], 3, "2026-11-01")).toBeNull()
  })
  it("detecta un ciclo que entra antes de que la sala quede libre", () => {
    expect(solapamientos([ciclo({ id: 1 }), ciclo({ id: 2, fecha_inicio: "2026-12-29" })])).toHaveLength(1)
    expect(solapamientos([ciclo({ id: 1 }), ciclo({ id: 2, fecha_inicio: "2026-12-30" })])).toHaveLength(0)
  })
})
