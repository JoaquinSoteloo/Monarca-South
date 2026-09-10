// Traduce una fila cruda de ejecuciones_automatizacion (+ el comando que
// eventualmente generó) a oraciones entendibles para alguien no técnico. Los
// datos técnicos (tipo, variable_valor, mensaje, comando_id/estado/error)
// siguen viviendo tal cual en la base — esto solo los formatea para la UI,
// nunca reemplaza lo que se persiste.
import { VARIABLE_CONFIG, formatDetalleAccion } from "./format"
import { negacionEstricta } from "./engine"
import type { Automatizacion, DispositivoControlable, EjecucionAutomatizacion, EstadoComando } from "@/lib/types"

export interface EjecucionConComando extends EjecucionAutomatizacion {
  comando?: { id: number; estado: EstadoComando; error: string | null } | null
}

export interface EventoHistorialHumano {
  /** Oraciones en orden cronológico-lógico, listas para renderizar una por línea. */
  lineas: string[]
  /** Detalle técnico crudo (hoy solo aplica a tipo 'error'), para no perder el mensaje original. */
  tecnico?: string | null
}

function lineaComando(comando: EjecucionConComando["comando"]): string | null {
  if (!comando) return null
  switch (comando.estado) {
    case "ejecutado":
      return "Comando ejecutado."
    case "fallido":
    case "timeout":
      return comando.error ? `El comando falló: ${comando.error}` : "El comando falló."
    case "cancelado":
      return "El comando fue cancelado."
    case "pendiente":
    case "en_proceso":
      return "Comando pendiente de confirmación."
    default:
      return null
  }
}

export function formatEjecucionHumana(
  ejecucion: EjecucionConComando,
  automatizacion: Automatizacion | null,
  dispositivo: DispositivoControlable | null,
): EventoHistorialHumano {
  const nombreDispositivo = dispositivo?.nombre ?? "el dispositivo"
  const nombreRegla = automatizacion?.nombre ?? "la regla"

  if (ejecucion.tipo === "error") {
    return {
      lineas: [`Ocurrió un error evaluando "${nombreRegla}".`],
      tecnico: ejecucion.mensaje,
    }
  }

  if (ejecucion.tipo === "fail_safe") {
    const accion = automatizacion?.accion_fail_safe === "apagar" ? "apagar el dispositivo" : "mantener el último estado"
    const lineas = [`El sensor Pulse de "${nombreRegla}" dejó de reportar datos.`, `Acción configurada: ${accion}.`]
    const comandoLinea = lineaComando(ejecucion.comando)
    if (comandoLinea) lineas.push(comandoLinea)
    return { lineas }
  }

  if (!automatizacion) {
    // Regla eliminada después de generar el log: sin condición para describir,
    // mostramos igual el hecho concreto (encendido/apagado) sin inventar datos.
    const lineas = [ejecucion.tipo === "encendido" ? `Se solicitó encender ${nombreDispositivo}.` : `Se solicitó apagar ${nombreDispositivo}.`]
    const comandoLinea = lineaComando(ejecucion.comando)
    if (comandoLinea) lineas.push(comandoLinea)
    return { lineas }
  }

  const cfg = VARIABLE_CONFIG[automatizacion.variable]
  const lineas: string[] = []

  if (ejecucion.variable_valor !== null && ejecucion.variable_valor !== undefined) {
    const valorTxt = Number(ejecucion.variable_valor).toFixed(1)
    lineas.push(
      ejecucion.tipo === "encendido"
        ? `${cfg.label} alcanzó ${valorTxt}${cfg.unidad}.`
        : `${cfg.label} pasó a ${valorTxt}${cfg.unidad}.`,
    )
  }

  if (ejecucion.tipo === "encendido") {
    lineas.push(`Se cumplió la condición: ${cfg.label} ${automatizacion.operador} ${automatizacion.valor_objetivo}${cfg.unidad}.`)
    const detalle = dispositivo ? formatDetalleAccion(dispositivo.tipo, automatizacion.accion_encendido) : ""
    lineas.push(`Se solicitó encender ${nombreDispositivo}${detalle ? ` (${detalle})` : ""}.`)
  } else {
    const operadorApagado = automatizacion.operador_apagado ?? negacionEstricta(automatizacion.operador)
    const valorApagado = automatizacion.valor_apagado ?? automatizacion.valor_objetivo
    lineas.push(`Se cumplió la condición de apagado: ${cfg.label} ${operadorApagado} ${valorApagado}${cfg.unidad}.`)
    lineas.push(`Se solicitó apagar ${nombreDispositivo}.`)
  }

  const comandoLinea = lineaComando(ejecucion.comando)
  if (comandoLinea) lineas.push(comandoLinea)

  return { lineas }
}
