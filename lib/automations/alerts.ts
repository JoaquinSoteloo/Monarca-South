// Cálculo puro de alertas operativas para la UI de Automatizaciones. No hay
// todavía un sistema de notificaciones (push/email/WhatsApp) — esto solo
// produce una lista de estados relevantes para pintar en la pantalla.
//
// Deliberadamente NO reevalúa condiciones de automatización acá (eso es
// responsabilidad exclusiva de evaluateAutomations en engine.ts): estas
// funciones solo LEEN estado ya calculado (última lectura, último log, último
// comando) y lo traducen a mensajes. Ningún efecto secundario.
import { compara } from "./engine"
import { VARIABLE_CONFIG } from "./format"
import { STALE_AFTER_MINUTES } from "@/lib/pulse-grow/format"
import type { Automatizacion, DispositivoControlable } from "@/lib/types"

export type NivelAlerta = "error" | "warning"

export interface AlertaOperativa {
  id: string
  nivel: NivelAlerta
  mensaje: string
  automatizacionId?: number
  dispositivoId?: number
}

export interface UltimaLecturaResumen {
  leido_en: string
  temperatura_c: number | null
  humedad_rh: number | null
  vpd: number | null
  luz_lux: number | null
  presion_hpa: number | null
  dew_point_c: number | null
}

function minutosDesde(iso: string, ahora: number): number {
  return (ahora - new Date(iso).getTime()) / 60000
}

export function computeAlertasOperativas(
  automatizaciones: Automatizacion[],
  dispositivos: DispositivoControlable[],
  ultimaLecturaPorPulseDevice: Record<number, UltimaLecturaResumen | undefined>,
  ultimoTipoLogPorAutomatizacion: Record<number, string | undefined>,
  ahora: number = Date.now(),
): AlertaOperativa[] {
  const alertas: AlertaOperativa[] = []

  for (const d of dispositivos) {
    if (d.modo === "manual") {
      alertas.push({
        id: `dispositivo-manual-${d.id}`,
        nivel: "warning",
        mensaje: `${d.nombre} está en modo manual: las reglas automáticas no lo controlan.`,
        dispositivoId: d.id,
      })
    }
    if (d.ultimo_comando_estado === "fallido" || d.ultimo_comando_estado === "timeout") {
      alertas.push({
        id: `dispositivo-comando-fallido-${d.id}`,
        nivel: "error",
        mensaje: `${d.nombre}: el último comando no se pudo ejecutar (${d.ultimo_comando_estado}).`,
        dispositivoId: d.id,
      })
    }
  }

  for (const a of automatizaciones) {
    if (!a.activa) continue

    const ultima = ultimaLecturaPorPulseDevice[a.pulse_device_id]
    const esStale = !ultima || minutosDesde(ultima.leido_en, ahora) > STALE_AFTER_MINUTES

    if (esStale) {
      alertas.push({
        id: `regla-stale-${a.id}`,
        nivel: "error",
        mensaje: `${a.nombre}: el sensor Pulse no reporta datos recientes.`,
        automatizacionId: a.id,
      })
    } else {
      const valor = ultima[a.variable]
      if (valor !== null && valor !== undefined && compara(Number(valor), a.operador, a.valor_objetivo)) {
        const cfg = VARIABLE_CONFIG[a.variable]
        alertas.push({
          id: `regla-fuera-de-rango-${a.id}`,
          nivel: "warning",
          mensaje: `${a.nombre}: ${cfg.label.toLowerCase()} en ${Number(valor).toFixed(1)}${cfg.unidad} — fuera del rango configurado (${a.operador} ${a.valor_objetivo}${cfg.unidad}).`,
          automatizacionId: a.id,
        })
      }
    }

    if (ultimoTipoLogPorAutomatizacion[a.id] === "fail_safe") {
      alertas.push({
        id: `regla-failsafe-${a.id}`,
        nivel: "error",
        mensaje: `${a.nombre} está en fail-safe (acción configurada: ${a.accion_fail_safe === "apagar" ? "apagar" : "mantener último estado"}).`,
        automatizacionId: a.id,
      })
    }
  }

  return alertas
}
