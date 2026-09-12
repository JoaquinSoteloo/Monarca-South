// Cálculo puro del checklist de Modo Ausente. Sin queries ni side effects:
// solo lee el estado ya cargado de cada dispositivo crítico (más si su
// sensor asociado está stale, ya resuelto por el caller) y lo traduce a un
// nivel de cumplimiento. Reutilizado tanto por GET /api/modo-ausente/checklist
// como por POST /api/modo-ausente/activate (que revalida server-side antes
// de activar) y por el chequeo periódico del evaluador.
import type { DispositivoControlable, RequisitoAusente } from "@/lib/types"

// Tres niveles, no un booleano — un dispositivo sin feedback físico nunca
// debe mostrarse ni contarse silenciosamente como "confirmado":
//   - "confirmado": soporta_feedback=true y el estado físico confirmado
//     cumple el requisito. Único nivel con verificación física real.
//   - "no_confirmado": soporta_feedback=false pero el último comando se
//     ejecutó bien y coincide con el requisito. Permite activar Modo Ausente
//     hoy (sin hardware) pero se marca explícitamente como no verificado.
//   - "incumplimiento": comando fallido/timeout, estado conocido contrario
//     al requerido, feedback físico ausente cuando se lo espera, o sensor
//     stale. Bloquea la activación / dispara violación si ya está activo.
export type NivelCumplimientoAusente = "confirmado" | "no_confirmado" | "incumplimiento"

export interface ChecklistItemAusente {
  dispositivoId: number
  nombre: string
  tipo: DispositivoControlable["tipo"]
  requisito: RequisitoAusente
  nivel: NivelCumplimientoAusente
  motivo: string
}

export interface ChecklistAusente {
  items: ChecklistItemAusente[]
  todoOk: boolean
  sinConfirmacionFisica: number
  resumen: string
}

// Convención de payload de TODO comando en este proyecto (ver
// lib/automations/format.ts, lib/automations/adapters/manual-noop.ts,
// handleComandoManual en automatizaciones-manager.tsx): payload.accion es
// siempre "encender" | "apagar", con campos extra opcionales según el tipo
// de dispositivo (ej. modo/setpoint/fan de aire acondicionado). Comparar
// contra ese único campo es más robusto que una igualdad profunda del
// payload completo, y funciona igual para cualquier tipo sin hardcodear
// ninguno en particular.
const ACCION_POR_REQUISITO: Record<RequisitoAusente, string> = {
  encendido: "encender",
  apagado: "apagar",
}

function accionDePayload(payload: Record<string, unknown> | null): string | null {
  return payload && typeof payload.accion === "string" ? payload.accion : null
}

export function computeNivelDispositivo(
  d: Pick<
    DispositivoControlable,
    "requisito_ausente" | "soporta_feedback" | "ultimo_comando_estado" | "ultimo_comando_payload" | "ultimo_estado_confirmado_payload"
  >,
  sensorStale: boolean,
): { nivel: NivelCumplimientoAusente; motivo: string } {
  const requisito = d.requisito_ausente
  if (!requisito) return { nivel: "confirmado", motivo: "" }

  const accionEsperada = ACCION_POR_REQUISITO[requisito]

  // El sensor que alimenta la automatización de este dispositivo no reporta
  // datos recientes: no se puede confiar en que vaya a seguir reaccionando
  // correctamente aunque el estado actual matchee. Prioridad más alta que
  // cualquier otro chequeo (más vale una falsa alarma que una omitida).
  if (sensorStale) {
    return { nivel: "incumplimiento", motivo: "El sensor que controla este dispositivo no reporta datos recientes." }
  }

  if (d.ultimo_comando_estado === "fallido" || d.ultimo_comando_estado === "timeout" || d.ultimo_comando_estado === "cancelado") {
    return { nivel: "incumplimiento", motivo: `El último comando no se pudo ejecutar (${d.ultimo_comando_estado}).` }
  }

  if (d.soporta_feedback) {
    const accionConfirmada = accionDePayload(d.ultimo_estado_confirmado_payload)
    if (accionConfirmada === accionEsperada) {
      return { nivel: "confirmado", motivo: "" }
    }
    if (accionConfirmada === null) {
      // Se espera feedback físico (soporta_feedback=true) y todavía no
      // llegó — nunca se "rebaja" esto a no_confirmado, que es un nivel
      // reservado a dispositivos que NO soportan feedback en absoluto.
      return { nivel: "incumplimiento", motivo: "Se espera confirmación física del equipo y todavía no llegó." }
    }
    return { nivel: "incumplimiento", motivo: `El estado físico confirmado no coincide: se requiere ${requisito}.` }
  }

  const accionComandada = accionDePayload(d.ultimo_comando_payload)
  if (accionComandada === accionEsperada) {
    return { nivel: "no_confirmado", motivo: "Comando enviado y ejecutado, sin confirmación física del equipo." }
  }

  return {
    nivel: "incumplimiento",
    motivo: accionComandada ? `Requiere quedar ${requisito} y el último comando conocido dice lo contrario.` : "Todavía no se le envió ningún comando.",
  }
}

export function computeChecklist(
  dispositivosCriticos: DispositivoControlable[],
  sensorStalePorDispositivo: Record<number, boolean>,
): ChecklistAusente {
  const items: ChecklistItemAusente[] = dispositivosCriticos.map((d) => {
    const { nivel, motivo } = computeNivelDispositivo(d, sensorStalePorDispositivo[d.id] ?? false)
    return {
      dispositivoId: d.id,
      nombre: d.nombre,
      tipo: d.tipo,
      requisito: d.requisito_ausente as RequisitoAusente,
      nivel,
      motivo,
    }
  })

  const incumplimientos = items.filter((i) => i.nivel === "incumplimiento")
  const sinConfirmacionFisica = items.filter((i) => i.nivel === "no_confirmado").length
  const todoOk = incumplimientos.length === 0

  let resumen: string
  if (!todoOk) {
    resumen = `${incumplimientos.length} dispositivo${incumplimientos.length === 1 ? "" : "s"} requiere${incumplimientos.length === 1 ? "" : "n"} atención antes de activar Modo Ausente.`
  } else if (sinConfirmacionFisica > 0) {
    resumen = `Configuración OK para activar Modo Ausente · ${sinConfirmacionFisica} dispositivo${sinConfirmacionFisica === 1 ? "" : "s"} sin confirmación física.`
  } else {
    resumen = "Todo OK para retirarse."
  }

  return { items, todoOk, sinConfirmacionFisica, resumen }
}
