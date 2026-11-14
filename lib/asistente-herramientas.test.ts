import { describe, expect, it } from "vitest"
import { createFakeSupabase } from "@/lib/automations/__tests__/fake-supabase"
import { HERRAMIENTAS, ejecutarHerramienta } from "./asistente-herramientas"

const AHORA = new Date("2026-11-13T18:30:00.000Z") // 15:30 en Argentina
const hace = (m: number) => new Date(AHORA.getTime() - m * 60000).toISOString()

function db() {
  const d = createFakeSupabase()
  d.seed("salas_cultivo", [{ id: 9, nombre: "Sala 5", activo: true }, { id: 7, nombre: "Sala 3", activo: true }])
  d.seed("ciclos_sala", [{
    id: 4, sala_id: 9, nombre: null, estado: "abierto", geneticas: null, plantas: null, m2: 10,
    fecha_inicio: "2026-09-22", dias_vege: 50, dias_flora: 60, dias_lavado: 7, dias_secado: 6, dias_limpieza: 2, notas: null,
  }])
  d.seed("lecturas_ambientales", [
    { sala_id: 9, temperatura_c: 22.8, humedad_rh: 70, vpd: 0.8, leido_en: hace(300) },
    { sala_id: 9, temperatura_c: 23.34, humedad_rh: 73.4, vpd: 0.75, leido_en: hace(3) },
  ])
  return d
}

describe("herramientas del asistente", () => {
  it("todas tienen nombre, descripción y esquema", () => {
    for (const h of HERRAMIENTAS) {
      expect(h.name).toMatch(/^[a-z_]+$/)
      expect(h.description.length).toBeGreaterThan(20)
      expect(h.input_schema.type).toBe("object")
    }
  })

  it("clima_salas: ahora, extremos del día, rango de la etapa y si está fuera", async () => {
    const r = (await ejecutarHerramienta(db() as never, "clima_salas", { sala: "sala 5" }, AHORA)) as any[]
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({
      sala: "Sala 5",
      etapa: "flora",
      ahora: { temperatura_c: 23.3, humedad_pct: 73, medido_a_las: "15:27" },
      hoy: { humedad_pct: { min: 70, max: 73.4 } },
      rango: { temperatura_c: [22, 26], humedad_pct: [45, 55] },
      fuera_de_rango: { temperatura: null, humedad: "alto" },
    })
  })

  it("clima_salas: Sala 3 es la de madres; sin lecturas lo dice", async () => {
    const r = (await ejecutarHerramienta(db() as never, "clima_salas", {}, AHORA)) as any[]
    const s3 = r.find((x) => x.sala === "Sala 3")
    expect(s3.etapa).toBe("madres y esquejes")
    expect(s3.ahora).toBe("sin lecturas del Pulse en las últimas 2 horas")
  })

  it("alertas_abiertas sin alertas lo dice en palabras", async () => {
    expect(await ejecutarHerramienta(db() as never, "alertas_abiertas", {}, AHORA)).toMatch(/No hay alertas/)
  })

  it("equipos: estado real del deshumidificador y aviso de equipos de prueba", async () => {
    const d = db()
    d.seed("dispositivos_controlables", [
      { id: 5, nombre: "Deshumidificador", tipo: "deshumidificador", proveedor: "shelly_local", activo: true, modo: "manual", soporta_feedback: true,
        ultimo_estado_confirmado_payload: { accion: "encender", potencia_w: 561 }, ultimo_estado_confirmado_en: hace(1),
        ultimo_comando_estado: "ejecutado", ultimo_comando_payload: { accion: "encender" }, ultimo_comando_en: hace(120) },
      { id: 1, nombre: "Aire acondicionado sala 1", tipo: "aire_acondicionado", proveedor: "manual_noop", activo: true, modo: "automatico", soporta_feedback: false,
        ultimo_comando_estado: "ejecutado", ultimo_comando_payload: { accion: "apagar" }, ultimo_comando_en: hace(3000) },
    ])
    const r = (await ejecutarHerramienta(d as never, "equipos", {}, AHORA)) as any[]
    expect(r[0]).toMatchObject({ equipo: "Deshumidificador", estado: "prendido (561 W)", como_se_sabe: "estado real informado por el equipo", de_prueba: "no" })
    expect(r[1]).toMatchObject({ estado: "apagado", de_prueba: "sí: no está conectado a nada real" })
  })

  it("tareas de hoy con responsable", async () => {
    const d = db()
    d.seed("perfiles", [{ user_id: "u-lucho", nombre: "Lucho" }])
    d.seed("tareas", [
      { fecha: "2026-11-13", titulo: "Sala 5 · King Crab", estado: "pendiente", responsable_id: "u-lucho", nota: null },
      { fecha: "2026-11-20", titulo: "Más adelante", estado: "pendiente", responsable_id: "u-lucho", nota: null },
    ])
    expect(await ejecutarHerramienta(d as never, "tareas", {}, AHORA)).toEqual([
      { fecha: "hoy", tarea: "Sala 5 · King Crab", responsable: "Lucho", estado: "pendiente" },
    ])
  })

  it("herramienta desconocida no rompe", async () => {
    expect(await ejecutarHerramienta(db() as never, "borrar_todo", {}, AHORA)).toEqual({ error: "Herramienta desconocida" })
  })
})
