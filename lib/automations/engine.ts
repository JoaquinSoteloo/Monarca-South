// Motor de evaluación de automatizaciones ambientales.
//
// Diseñado para ser invocado a CUALQUIER intervalo (ver plan de diseño,
// sección "Flujo de ejecución"): cada corrida evalúa condiciones contra
// ventanas de tiempo calculadas desde lecturas_ambientales.leido_en
// (timestamps reales), no contra un conteo de invocaciones. El único estado
// mutable real es automatizaciones.ultimo_disparo_en/tipo (para el
// cooldown) — todo lo demás se recalcula desde cero en cada corrida, así el
// motor es stateless y autocorrectivo si una corrida se pierde.
import type { SupabaseClient } from "@supabase/supabase-js"
import { getPulseSnapshots } from "@/lib/pulse-grow/service"
import { STALE_AFTER_MINUTES } from "@/lib/pulse-grow/format"
import { getServerAdapter } from "./adapters"
import type { Automatizacion, DispositivoControlable, OperadorComparacion, VariableAmbiental } from "@/lib/types"

export interface EvaluateSummary {
  lecturasInsertadas: number
  reglasEvaluadas: number
  comandosEncolados: number
  errores: { automatizacionId: number; mensaje: string }[]
}

export function compara(valor: number, operador: OperadorComparacion, objetivo: number): boolean {
  switch (operador) {
    case ">":
      return valor > objetivo
    case "<":
      return valor < objetivo
    case ">=":
      return valor >= objetivo
    case "<=":
      return valor <= objetivo
  }
}

export function negacionEstricta(operador: OperadorComparacion): OperadorComparacion {
  switch (operador) {
    case ">":
      return "<="
    case "<":
      return ">="
    case ">=":
      return "<"
    case "<=":
      return ">"
  }
}

function valoresIguales(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
}

async function getUltimaLectura(supabase: SupabaseClient, pulseDeviceId: number): Promise<Record<string, any> | null> {
  const { data } = await supabase
    .from("lecturas_ambientales")
    .select("*")
    .eq("pulse_device_id", pulseDeviceId)
    .order("leido_en", { ascending: false })
    .limit(1)
    .maybeSingle()
  return data ?? null
}

/**
 * ¿Se cumplió la condición de forma sostenida durante `duracionSegundos`?
 * Si duracionSegundos <= 0, solo mira la lectura más reciente (condición
 * instantánea, sin exigir historial).
 */
async function condicionSostenida(
  supabase: SupabaseClient,
  pulseDeviceId: number,
  variable: VariableAmbiental,
  operador: OperadorComparacion,
  valorObjetivo: number,
  duracionSegundos: number,
  ahora: Date,
): Promise<boolean> {
  if (duracionSegundos <= 0) {
    const ultima = await getUltimaLectura(supabase, pulseDeviceId)
    if (!ultima || ultima[variable] === null || ultima[variable] === undefined) return false
    return compara(Number(ultima[variable]), operador, valorObjetivo)
  }

  const desde = new Date(ahora.getTime() - duracionSegundos * 1000)
  const { data: lecturas } = await supabase
    .from("lecturas_ambientales")
    .select("*")
    .eq("pulse_device_id", pulseDeviceId)
    .gte("leido_en", desde.toISOString())
    .lte("leido_en", ahora.toISOString())
    .order("leido_en", { ascending: true })

  if (!lecturas || lecturas.length === 0) return false

  // Tolerancia proporcional a la duración pedida, no a una cadencia fija:
  // así la corrección no depende de cada cuánto se invoque el motor.
  // Sin una lectura razonablemente cerca del arranque de la ventana, todavía
  // no hay suficiente historial para decir "sostenido durante X minutos".
  const toleranciaMs = Math.max(60_000, duracionSegundos * 1000 * 0.2)
  const primera = new Date(lecturas[0].leido_en)
  if (primera.getTime() - desde.getTime() > toleranciaMs) return false

  return lecturas.every((l: any) => {
    const v = l[variable]
    return v !== null && v !== undefined && compara(Number(v), operador, valorObjetivo)
  })
}

/**
 * Encola un comando abstracto para el dispositivo. Si modo_ejecucion es
 * 'servidor_directo', lo resuelve en el mismo request invocando el adapter
 * correspondiente. Si es 'bridge_polling', lo deja 'pendiente' para que un
 * bridge externo lo tome (no implementado todavía).
 */
export async function encolarComando(
  supabase: SupabaseClient,
  dispositivo: DispositivoControlable,
  automatizacionId: number | null,
  origen: "automatizacion" | "sistema" | "manual",
  payload: Record<string, unknown>,
): Promise<{ id: number; estado: string } | null> {
  const { data: comando, error } = await supabase
    .from("comandos_dispositivo")
    .insert({
      dispositivo_id: dispositivo.id,
      origen,
      automatizacion_id: automatizacionId,
      payload,
      estado: "pendiente",
    })
    .select()
    .single()

  if (error || !comando) {
    console.error("[automations/engine] Error encolando comando:", error)
    return null
  }

  let estadoFinal: string = comando.estado
  let ejecutadoPor: "servidor" | "bridge" | null = null
  let errorMsg: string | null = null

  if (dispositivo.modo_ejecucion === "servidor_directo") {
    const adapter = getServerAdapter(dispositivo.proveedor)
    if (!adapter) {
      estadoFinal = "fallido"
      errorMsg = `No hay adapter servidor-directo registrado para el proveedor "${dispositivo.proveedor}"`
    } else {
      try {
        const resultado = await adapter.ejecutarComando(payload, dispositivo.proveedor_config || {})
        estadoFinal = resultado.estado
        errorMsg = resultado.error ?? null
      } catch (err) {
        estadoFinal = "fallido"
        errorMsg = err instanceof Error ? err.message : String(err)
      }
    }
    ejecutadoPor = "servidor"

    await supabase
      .from("comandos_dispositivo")
      .update({
        estado: estadoFinal,
        ejecutado_por: ejecutadoPor,
        enviado_en: new Date().toISOString(),
        resuelto_en: new Date().toISOString(),
        error: errorMsg,
      })
      .eq("id", comando.id)
  }
  // modo_ejecucion === 'bridge_polling': el comando queda 'pendiente'; lo
  // resuelve un bridge externo vía /api/bridge/commands (diseñado, no
  // implementado todavía).

  await supabase
    .from("dispositivos_controlables")
    .update({
      ultimo_comando_payload: payload,
      ultimo_comando_en: new Date().toISOString(),
      ultimo_comando_origen: origen,
      ultimo_comando_estado: estadoFinal,
      updated_at: new Date().toISOString(),
    })
    .eq("id", dispositivo.id)

  return { id: comando.id, estado: estadoFinal }
}

async function logEjecucion(
  supabase: SupabaseClient,
  automatizacionId: number,
  tipo: "encendido" | "apagado" | "fail_safe" | "error",
  variableValor: number | null,
  comandoId: number | null,
  mensaje: string | null,
) {
  await supabase.from("ejecuciones_automatizacion").insert({
    automatizacion_id: automatizacionId,
    tipo,
    variable_valor: variableValor,
    comando_id: comandoId,
    mensaje,
  })
}

/** Evita re-loguear fail-safe en cada corrida: solo interesa la transición. */
async function ultimoLogEsTipo(supabase: SupabaseClient, automatizacionId: number, tipo: string): Promise<boolean> {
  const { data } = await supabase
    .from("ejecuciones_automatizacion")
    .select("tipo")
    .eq("automatizacion_id", automatizacionId)
    .order("creado_en", { ascending: false })
    .limit(1)
    .maybeSingle()
  return data?.tipo === tipo
}

async function intentarDisparo(
  supabase: SupabaseClient,
  automatizacion: Automatizacion,
  dispositivo: DispositivoControlable,
  tipo: "encendido" | "apagado",
  accionPayload: Record<string, unknown>,
  valorActual: number | null,
  ahora: Date,
  opciones: { ignorarCooldown?: boolean } = {},
): Promise<{ disparado: boolean; comandoId: number | null }> {
  // Si el último comando conocido del dispositivo ya es exactamente este
  // (y no falló/expiró), no tiene sentido volver a encolarlo — evita
  // spam de comandos idénticos mientras la condición se mantiene.
  const mismoUltimoComando =
    valoresIguales(dispositivo.ultimo_comando_payload, accionPayload) &&
    dispositivo.ultimo_comando_estado !== null &&
    !["fallido", "timeout", "cancelado"].includes(dispositivo.ultimo_comando_estado)

  if (mismoUltimoComando) {
    return { disparado: false, comandoId: null }
  }

  if (opciones.ignorarCooldown) {
    // Camino de fail-safe con accion_fail_safe='apagar': es una acción de
    // seguridad, no se la bloquea por cooldown.
    await supabase
      .from("automatizaciones")
      .update({ ultimo_disparo_en: ahora.toISOString(), ultimo_disparo_tipo: tipo })
      .eq("id", automatizacion.id)
  } else {
    // Update atómico condicionado al cooldown: si dos corridas se solapan,
    // solo una de ellas "gana" la fila y dispara.
    const cutoff = new Date(ahora.getTime() - automatizacion.cooldown_segundos * 1000).toISOString()
    const { data: reclamada } = await supabase
      .from("automatizaciones")
      .update({ ultimo_disparo_en: ahora.toISOString(), ultimo_disparo_tipo: tipo })
      .eq("id", automatizacion.id)
      .or(`ultimo_disparo_en.is.null,ultimo_disparo_en.lt.${cutoff}`)
      .select()
      .maybeSingle()

    if (!reclamada) {
      return { disparado: false, comandoId: null }
    }
  }

  const comando = await encolarComando(supabase, dispositivo, automatizacion.id, "automatizacion", accionPayload)
  await logEjecucion(supabase, automatizacion.id, tipo, valorActual, comando?.id ?? null, null)

  return { disparado: true, comandoId: comando?.id ?? null }
}

export async function evaluateAutomations(supabase: SupabaseClient): Promise<EvaluateSummary> {
  const ahora = new Date()
  const resumen: EvaluateSummary = {
    lecturasInsertadas: 0,
    reglasEvaluadas: 0,
    comandosEncolados: 0,
    errores: [],
  }

  // 1) Snapshot en vivo de Pulse + persistencia mínima que necesita el motor
  // (para "sostenido durante X min" y para detectar huecos). Las lecturas
  // fallidas simplemente no insertan fila: el hueco es la señal.
  const snapshots = await getPulseSnapshots(supabase)
  const filasLecturas = snapshots
    .filter((s) => s.reading !== null)
    .map((s) => ({
      pulse_device_id: s.id,
      sala_id: s.sala?.id ?? null,
      temperatura_c: s.reading!.temperatureC,
      humedad_rh: s.reading!.humidityRh,
      vpd: s.reading!.vpd,
      luz_lux: s.reading!.lightLux,
      presion_hpa: s.reading!.airPressureHpa,
      dew_point_c: s.reading!.dewPointC,
      leido_en: s.reading!.createdAt.endsWith("Z") ? s.reading!.createdAt : `${s.reading!.createdAt}Z`,
    }))

  if (filasLecturas.length > 0) {
    const { error } = await supabase.from("lecturas_ambientales").insert(filasLecturas)
    if (error) {
      console.error("[automations/engine] Error insertando lecturas_ambientales:", error)
    } else {
      resumen.lecturasInsertadas = filasLecturas.length
    }
  }

  // 2) Reglas activas + su dispositivo.
  const { data: automatizaciones, error: errorAutomatizaciones } = await supabase
    .from("automatizaciones")
    .select("*, dispositivo:dispositivos_controlables(*)")
    .eq("activa", true)

  if (errorAutomatizaciones) {
    console.error("[automations/engine] Error leyendo automatizaciones:", errorAutomatizaciones)
    return resumen
  }

  for (const raw of automatizaciones || []) {
    const automatizacion = raw as unknown as Automatizacion
    const dispositivoRaw = (raw as any).dispositivo
    const dispositivo = (Array.isArray(dispositivoRaw) ? dispositivoRaw[0] : dispositivoRaw) as DispositivoControlable | null

    resumen.reglasEvaluadas += 1

    if (!dispositivo) {
      resumen.errores.push({ automatizacionId: automatizacion.id, mensaje: "Dispositivo asociado no encontrado" })
      continue
    }

    try {
      if (dispositivo.modo === "manual") {
        // No se toca ni se loguea nada mientras el dispositivo está en modo
        // manual: es una pausa explícita del usuario, no una acción de regla.
        continue
      }

      const ultima = await getUltimaLectura(supabase, automatizacion.pulse_device_id)
      const staleMs = STALE_AFTER_MINUTES * 60 * 1000
      const esStale = !ultima || ahora.getTime() - new Date(ultima.leido_en).getTime() > staleMs

      if (esStale) {
        const yaEnFailSafe = await ultimoLogEsTipo(supabase, automatizacion.id, "fail_safe")
        if (!yaEnFailSafe) {
          await logEjecucion(
            supabase,
            automatizacion.id,
            "fail_safe",
            null,
            null,
            `Sensor sin datos frescos (umbral ${STALE_AFTER_MINUTES} min). Acción configurada: ${automatizacion.accion_fail_safe}.`,
          )
        }
        if (automatizacion.accion_fail_safe === "apagar") {
          const resultado = await intentarDisparo(
            supabase,
            automatizacion,
            dispositivo,
            "apagado",
            automatizacion.accion_apagado,
            null,
            ahora,
            { ignorarCooldown: true },
          )
          if (resultado.disparado) resumen.comandosEncolados += 1
        }
        continue
      }

      const valorActual = Number(ultima[automatizacion.variable])

      const cumpleEncendido = await condicionSostenida(
        supabase,
        automatizacion.pulse_device_id,
        automatizacion.variable,
        automatizacion.operador,
        automatizacion.valor_objetivo,
        automatizacion.duracion_minima_segundos,
        ahora,
      )

      if (cumpleEncendido) {
        const resultado = await intentarDisparo(
          supabase,
          automatizacion,
          dispositivo,
          "encendido",
          automatizacion.accion_encendido,
          valorActual,
          ahora,
        )
        if (resultado.disparado) resumen.comandosEncolados += 1
        continue
      }

      const operadorApagado = automatizacion.operador_apagado ?? negacionEstricta(automatizacion.operador)
      const valorApagado = automatizacion.valor_apagado ?? automatizacion.valor_objetivo
      const duracionApagado = automatizacion.duracion_apagado_segundos ?? automatizacion.duracion_minima_segundos

      const cumpleApagado = await condicionSostenida(
        supabase,
        automatizacion.pulse_device_id,
        automatizacion.variable,
        operadorApagado,
        valorApagado,
        duracionApagado,
        ahora,
      )

      if (cumpleApagado) {
        const resultado = await intentarDisparo(
          supabase,
          automatizacion,
          dispositivo,
          "apagado",
          automatizacion.accion_apagado,
          valorActual,
          ahora,
        )
        if (resultado.disparado) resumen.comandosEncolados += 1
      }
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : String(err)
      console.error(`[automations/engine] Error evaluando automatización ${automatizacion.id}:`, err)
      resumen.errores.push({ automatizacionId: automatizacion.id, mensaje })
      await logEjecucion(supabase, automatizacion.id, "error", null, null, mensaje)
    }
  }

  return resumen
}
