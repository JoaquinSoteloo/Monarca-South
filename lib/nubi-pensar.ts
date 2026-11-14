// Nubi piensa (14/11/2026): arma lo que ve cada sala desde la base, le pregunta
// a la IA (lib/nubi-ia.ts), revisa la respuesta con los guardrails y deja todo
// registrado en nubi_decisiones (script 102). Lo usan el motor
// (lib/nubi-aviso.ts) y Probar Nubi. Solo servidor.
import type { SupabaseClient } from "@supabase/supabase-js"
import { completarJSON } from "@/lib/ia"
import { cicloActual, type CicloSala } from "@/lib/ciclo"
import { rangoClima, ultimoValor, type LecturaClima, type RangoClima } from "@/lib/clima-alertas"
import { deberiaHaberLuz, horaCorta, minutoAR } from "@/lib/guardian-luces"
import { estadoAire, estadoOnOff } from "@/lib/nubi"
import {
  armarContexto,
  ESQUEMA_DECISION,
  SISTEMA_NUBI,
  validarDecision,
  type DecisionIA,
  type DecisionReciente,
  type EntradaContexto,
  type EquipoEnSala,
  type Validacion,
} from "@/lib/nubi-ia"
import type { DispositivoControlable } from "@/lib/types"
import type { AlertaClima } from "@/lib/clima-alertas-aviso"

const fechaAR = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" })
const horaAR = (d: Date) => d.toLocaleTimeString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", hour: "2-digit", minute: "2-digit", hour12: false })
const minutosDesde = (iso: string, ahora: Date) => Math.max(0, Math.round((ahora.getTime() - new Date(iso).getTime()) / 60000))

export interface SalaParaPensar {
  sala: { id: number; nombre: string }
  rango: RangoClima
  equipos: DispositivoControlable[]
  alertas: AlertaClima[]
  lecturas: (LecturaClima & { sala_id: number })[]
  entrada: EntradaContexto
}

const RESPUESTA: Record<string, DecisionReciente["respuesta"]> = {
  aprobada: "mandada",
  rechazada: "descartada",
  vencida: "venció sin respuesta",
  pendiente: "pendiente",
  informada: "aviso",
}

/**
 * Carga todo lo que hace falta para pensar las salas con aire o deshumidificador
 * (o solo las de `salaIds`). Salas sin rango hoy (libres, en limpieza) no entran.
 */
export async function cargarSalas(supabase: SupabaseClient, ahora: Date, salaIds?: number[]): Promise<SalaParaPensar[]> {
  const hoy = fechaAR(ahora)
  const desde = new Date(ahora.getTime() - 70 * 60000).toISOString()
  const hace6h = new Date(ahora.getTime() - 6 * 3600000).toISOString()
  const [alertasR, equiposR, salasR, ciclosR, lecturasR, recientesR] = await Promise.all([
    supabase.from("alertas_clima").select("*").is("resuelta_en", null),
    supabase.from("dispositivos_controlables").select("*").eq("activo", true).in("tipo", ["aire_acondicionado", "deshumidificador"]),
    supabase.from("salas_cultivo").select("id, nombre, luz_prende, luz_apaga"),
    supabase.from("ciclos_sala").select("*").eq("estado", "abierto"),
    supabase.from("lecturas_ambientales").select("sala_id, temperatura_c, humedad_rh, leido_en").gte("leido_en", desde).not("sala_id", "is", null).order("leido_en"),
    supabase.from("propuestas_nubi").select("sala_id, dispositivo_id, estado, resumen, payload, creada_en, resuelta_por_nombre").gte("creada_en", hace6h).order("creada_en", { ascending: false }),
  ])
  for (const r of [alertasR, equiposR, salasR, ciclosR, lecturasR, recientesR]) if (r.error) throw new Error(r.error.message)

  // Los equipos de prueba (manual_noop) no mueven nada real: Nubi no los toca.
  const equipos = ((equiposR.data ?? []) as DispositivoControlable[]).filter((d) => d.sala_id !== null && d.proveedor !== "manual_noop")
  const salas = (salasR.data ?? []) as { id: number; nombre: string; luz_prende: string | null; luz_apaga: string | null }[]
  const ciclos = (ciclosR.data ?? []) as CicloSala[]
  const lecturas = (lecturasR.data ?? []) as (LecturaClima & { sala_id: number })[]
  const alertas = (alertasR.data ?? []) as AlertaClima[]
  const recientes = (recientesR.data ?? []) as {
    sala_id: number
    dispositivo_id: number
    estado: string
    resumen: string
    payload: Record<string, unknown> | null
    creada_en: string
    resuelta_por_nombre: string | null
  }[]

  const salida: SalaParaPensar[] = []
  for (const sala of salas) {
    if (salaIds && !salaIds.includes(sala.id)) continue
    const suyos = equipos.filter((d) => d.sala_id === sala.id)
    if (!suyos.length) continue
    const rango = rangoClima(sala.nombre, cicloActual(ciclos, sala.id, hoy), hoy)
    if (!rango) continue
    const susLecturas = lecturas.filter((l) => l.sala_id === sala.id)
    const ultima = susLecturas[susLecturas.length - 1]
    const horario = sala.luz_prende && sala.luz_apaga ? { prende: sala.luz_prende, apaga: sala.luz_apaga } : null

    const entrada: EntradaContexto = {
      sala: sala.nombre,
      rango,
      horaAR: horaAR(ahora),
      luces: {
        horario: horario ? `de ${horaCorta(horario.prende)} a ${horaCorta(horario.apaga)}` : null,
        prendidas: horario ? deberiaHaberLuz(minutoAR(ahora), horario) : null,
      },
      ahora: {
        temperatura: ultimoValor(susLecturas, "temperatura"),
        humedad: ultimoValor(susLecturas, "humedad"),
        haceMin: ultima ? minutosDesde(ultima.leido_en, ahora) : null,
      },
      ultimaHora: susLecturas
        .filter((l) => ahora.getTime() - new Date(l.leido_en).getTime() <= 60 * 60000)
        .map((l) => ({
          temperatura: l.temperatura_c === null ? null : Number(l.temperatura_c),
          humedad: l.humedad_rh === null ? null : Number(l.humedad_rh),
        })),
      alertas: alertas.filter((a) => a.sala_id === sala.id).map((a) => `${a.mensaje}, desde hace ${minutosDesde(a.desde, ahora)} min`),
      equipos: suyos.map(
        (d): EquipoEnSala => ({
          id: d.id,
          tipo: d.tipo as EquipoEnSala["tipo"],
          estado: d.tipo === "aire_acondicionado" ? estadoAire(d) : estadoOnOff(d, ahora),
          estadoReal: d.tipo === "deshumidificador" && !!d.soporta_feedback,
          ultimaOrdenHaceMin: d.ultimo_comando_en ? minutosDesde(d.ultimo_comando_en, ahora) : null,
        }),
      ),
      recientes: recientes
        .filter((r) => r.sala_id === sala.id)
        .map((r) => ({
          haceMin: minutosDesde(r.creada_en, ahora),
          propuso: r.resumen,
          respuesta: RESPUESTA[r.estado] ?? "pendiente",
          quien: r.resuelta_por_nombre,
          dispositivoId: r.dispositivo_id,
          payload: r.payload,
        })),
    }
    salida.push({ sala, rango, equipos: suyos, alertas: alertas.filter((a) => a.sala_id === sala.id), lecturas: susLecturas, entrada })
  }
  return salida
}

export interface Pensamiento {
  contexto: ReturnType<typeof armarContexto>
  decision: DecisionIA
  validacion: Validacion
  modelo: string
  tokensEntrada: number | null
  tokensSalida: number | null
  latenciaMs: number
}

/** Le pregunta a la IA y revisa la respuesta. null si la IA no respondió (se usan las reglas). */
export async function pensar(entrada: EntradaContexto): Promise<Pensamiento | null> {
  const contexto = armarContexto(entrada)
  const r = await completarJSON<DecisionIA>(
    SISTEMA_NUBI,
    `Así está la sala ahora:\n${JSON.stringify(contexto, null, 2)}`,
    "decision_nubi",
    ESQUEMA_DECISION as unknown as Record<string, unknown>,
  )
  if (!r) return null
  return {
    contexto,
    decision: r.datos,
    validacion: validarDecision(r.datos, entrada.equipos, entrada.recientes),
    modelo: r.modelo,
    tokensEntrada: r.tokensEntrada,
    tokensSalida: r.tokensSalida,
    latenciaMs: r.latenciaMs,
  }
}

/** Deja la decisión en nubi_decisiones (observabilidad). Si falla, no frena nada. */
export async function registrar(
  supabase: SupabaseClient,
  fila: {
    salaId: number | null
    fuente: "ia" | "reglas" | "prueba" | "eval"
    pensamiento?: Pensamiento | null
    entrada?: unknown
    salida?: unknown
    decision?: string
    valida?: boolean
    motivoRechazo?: string | null
    propuestaId?: number | null
  },
): Promise<void> {
  const p = fila.pensamiento
  const { error } = await supabase.from("nubi_decisiones").insert({
    sala_id: fila.salaId,
    fuente: fila.fuente,
    modelo: p?.modelo ?? null,
    entrada: p?.contexto ?? fila.entrada ?? null,
    salida: p?.decision ?? fila.salida ?? null,
    analisis: p?.decision.analisis ?? null,
    decision: p?.decision.decision ?? fila.decision ?? null,
    valida: p ? p.validacion.ok : (fila.valida ?? null),
    motivo_rechazo: p && !p.validacion.ok ? p.validacion.motivo : (fila.motivoRechazo ?? null),
    tokens_entrada: p?.tokensEntrada ?? null,
    tokens_salida: p?.tokensSalida ?? null,
    latencia_ms: p?.latenciaMs ?? null,
    propuesta_id: fila.propuestaId ?? null,
  })
  if (error) console.error("[nubi] No se pudo registrar la decisión:", error.message)
}

/**
 * Cuándo pensar una sala: cada 10 minutos (la primera corrida de cada decena;
 * el motor corre cada 5) o enseguida si se abrió una alerta en esa sala.
 */
export function tocaPensar(ahora: Date, alertas: Pick<AlertaClima, "desde" | "notificada_en">[]): boolean {
  if (ahora.getUTCMinutes() % 10 < 5) return true
  return alertas.some((a) => {
    const abierta = a.notificada_en ?? a.desde
    return ahora.getTime() - new Date(abierta).getTime() <= 6 * 60000
  })
}
