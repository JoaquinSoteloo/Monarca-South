// Tests unitarios puros de computeNivelDispositivo / computeChecklist — sin
// Supabase ni side effects, solo el cálculo de checklist.ts. Ver
// ../checklist.ts para la semántica de cada nivel de cumplimiento.
import { describe, expect, it } from "vitest"
import { computeChecklist, computeNivelDispositivo } from "../checklist"
import type { DispositivoControlable } from "@/lib/types"

type DispositivoInput = Pick<
  DispositivoControlable,
  "requisito_ausente" | "soporta_feedback" | "ultimo_comando_estado" | "ultimo_comando_payload" | "ultimo_estado_confirmado_payload"
>

function makeDispositivoInput(overrides: Partial<DispositivoInput> = {}): DispositivoInput {
  return {
    requisito_ausente: "apagado",
    soporta_feedback: false,
    ultimo_comando_estado: null,
    ultimo_comando_payload: null,
    ultimo_estado_confirmado_payload: null,
    ...overrides,
  }
}

function makeDispositivo(overrides: Partial<DispositivoControlable> = {}): DispositivoControlable {
  return {
    id: 1,
    nombre: "Extractor Sala 1",
    sala_id: 1,
    tipo: "extractor",
    proveedor: "manual_noop",
    modo_ejecucion: "servidor_directo",
    proveedor_config: {},
    soporta_feedback: false,
    modo: "automatico",
    activo: true,
    ultimo_comando_payload: null,
    ultimo_comando_en: null,
    ultimo_comando_origen: null,
    ultimo_comando_estado: null,
    ultimo_estado_confirmado_payload: null,
    ultimo_estado_confirmado_en: null,
    requisito_ausente: "apagado",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  } as DispositivoControlable
}

describe("computeNivelDispositivo", () => {
  it("no exige nada de un dispositivo sin requisito_ausente (no crítico)", () => {
    const { nivel, motivo } = computeNivelDispositivo(makeDispositivoInput({ requisito_ausente: null }), false)
    expect(nivel).toBe("confirmado")
    expect(motivo).toBe("")
  })

  it("sin comando: incumplimiento porque nunca se le mandó nada", () => {
    const { nivel, motivo } = computeNivelDispositivo(makeDispositivoInput(), false)
    expect(nivel).toBe("incumplimiento")
    expect(motivo).toBe("Todavía no se le envió ningún comando.")
  })

  it.each(["fallido", "timeout", "cancelado"] as const)("comando %s: incumplimiento con el estado en el motivo", (estado) => {
    const { nivel, motivo } = computeNivelDispositivo(
      makeDispositivoInput({ ultimo_comando_estado: estado, ultimo_comando_payload: { accion: "apagar" } }),
      false,
    )
    expect(nivel).toBe("incumplimiento")
    expect(motivo).toContain(estado)
  })

  it("no_confirmado: sin feedback físico pero el último comando ejecutado coincide con el requisito", () => {
    const { nivel, motivo } = computeNivelDispositivo(
      makeDispositivoInput({
        soporta_feedback: false,
        ultimo_comando_estado: "ejecutado",
        ultimo_comando_payload: { accion: "apagar" },
      }),
      false,
    )
    expect(nivel).toBe("no_confirmado")
    expect(motivo).toContain("sin confirmación física")
  })

  it("confirmado: con feedback físico y el estado confirmado coincide con el requisito", () => {
    const { nivel, motivo } = computeNivelDispositivo(
      makeDispositivoInput({
        soporta_feedback: true,
        ultimo_comando_estado: "ejecutado",
        ultimo_estado_confirmado_payload: { accion: "apagar" },
      }),
      false,
    )
    expect(nivel).toBe("confirmado")
    expect(motivo).toBe("")
  })

  it("feedback esperado pero ausente: soporta_feedback=true y todavía no llegó confirmación", () => {
    const { nivel, motivo } = computeNivelDispositivo(
      makeDispositivoInput({
        soporta_feedback: true,
        ultimo_comando_estado: "ejecutado",
        ultimo_comando_payload: { accion: "apagar" },
        ultimo_estado_confirmado_payload: null,
      }),
      false,
    )
    expect(nivel).toBe("incumplimiento")
    expect(motivo).toContain("todavía no llegó")
  })

  it("feedback presente pero contradice el requisito: incumplimiento, nunca no_confirmado", () => {
    const { nivel, motivo } = computeNivelDispositivo(
      makeDispositivoInput({
        soporta_feedback: true,
        ultimo_comando_estado: "ejecutado",
        ultimo_estado_confirmado_payload: { accion: "encender" },
      }),
      false,
    )
    expect(nivel).toBe("incumplimiento")
    expect(motivo).toContain("no coincide")
  })

  it("sensor stale: incumplimiento con prioridad sobre cualquier otro chequeo, aun con feedback correcto", () => {
    const { nivel, motivo } = computeNivelDispositivo(
      makeDispositivoInput({
        soporta_feedback: true,
        ultimo_comando_estado: "ejecutado",
        ultimo_estado_confirmado_payload: { accion: "apagar" },
      }),
      true,
    )
    expect(nivel).toBe("incumplimiento")
    expect(motivo).toContain("sensor")
  })

  it("requisito 'encendido': el último comando 'apagar' no lo cumple", () => {
    const { nivel, motivo } = computeNivelDispositivo(
      makeDispositivoInput({
        requisito_ausente: "encendido",
        ultimo_comando_estado: "ejecutado",
        ultimo_comando_payload: { accion: "apagar" },
      }),
      false,
    )
    expect(nivel).toBe("incumplimiento")
    expect(motivo).toContain("lo contrario")
  })

  it("requisito 'encendido': el último comando 'encender' sí lo cumple (no_confirmado sin feedback)", () => {
    const { nivel } = computeNivelDispositivo(
      makeDispositivoInput({
        requisito_ausente: "encendido",
        ultimo_comando_estado: "ejecutado",
        ultimo_comando_payload: { accion: "encender" },
      }),
      false,
    )
    expect(nivel).toBe("no_confirmado")
  })

  it("requisito 'apagado': el último comando 'apagar' sí lo cumple (no_confirmado sin feedback)", () => {
    const { nivel } = computeNivelDispositivo(
      makeDispositivoInput({
        requisito_ausente: "apagado",
        ultimo_comando_estado: "ejecutado",
        ultimo_comando_payload: { accion: "apagar" },
      }),
      false,
    )
    expect(nivel).toBe("no_confirmado")
  })
})

describe("computeChecklist", () => {
  it("todoOk=true y resumen 'Todo OK para retirarse' cuando todos los dispositivos están confirmados", () => {
    const dispositivos = [
      makeDispositivo({
        id: 1,
        soporta_feedback: true,
        ultimo_comando_estado: "ejecutado",
        ultimo_estado_confirmado_payload: { accion: "apagar" },
      }),
    ]
    const checklist = computeChecklist(dispositivos, {})

    expect(checklist.todoOk).toBe(true)
    expect(checklist.sinConfirmacionFisica).toBe(0)
    expect(checklist.resumen).toBe("Todo OK para retirarse.")
  })

  it("todoOk=false cuando hay al menos un incumplimiento, y el resumen cuenta cuántos", () => {
    const dispositivos = [
      makeDispositivo({ id: 1 }), // sin comando -> incumplimiento
      makeDispositivo({
        id: 2,
        soporta_feedback: true,
        ultimo_comando_estado: "ejecutado",
        ultimo_estado_confirmado_payload: { accion: "apagar" },
      }),
    ]
    const checklist = computeChecklist(dispositivos, {})

    expect(checklist.todoOk).toBe(false)
    expect(checklist.resumen).toBe("1 dispositivo requiere atención antes de activar Modo Ausente.")
  })

  it("sinConfirmacionFisica cuenta exactamente los dispositivos en no_confirmado, ni más ni menos", () => {
    const dispositivos = [
      makeDispositivo({
        id: 1,
        soporta_feedback: false,
        ultimo_comando_estado: "ejecutado",
        ultimo_comando_payload: { accion: "apagar" },
      }),
      makeDispositivo({
        id: 2,
        soporta_feedback: false,
        ultimo_comando_estado: "ejecutado",
        ultimo_comando_payload: { accion: "apagar" },
      }),
      makeDispositivo({
        id: 3,
        soporta_feedback: true,
        ultimo_comando_estado: "ejecutado",
        ultimo_estado_confirmado_payload: { accion: "apagar" },
      }),
    ]
    const checklist = computeChecklist(dispositivos, {})

    expect(checklist.todoOk).toBe(true)
    expect(checklist.sinConfirmacionFisica).toBe(2)
    expect(checklist.resumen).toBe("Configuración OK para activar Modo Ausente · 2 dispositivos sin confirmación física.")
  })

  it("propaga el flag de sensor stale por dispositivo desde sensorStalePorDispositivo", () => {
    const dispositivos = [
      makeDispositivo({
        id: 1,
        soporta_feedback: true,
        ultimo_comando_estado: "ejecutado",
        ultimo_estado_confirmado_payload: { accion: "apagar" },
      }),
    ]
    const checklist = computeChecklist(dispositivos, { 1: true })

    expect(checklist.todoOk).toBe(false)
    expect(checklist.items[0].nivel).toBe("incumplimiento")
    expect(checklist.items[0].motivo).toContain("sensor")
  })
})
