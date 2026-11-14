// Lo que el asistente de cultivo puede consultar (pedido de Joaquín,
// 13/11/2026: "darle los datos"). Cada herramienta lee con la sesión de quien
// pregunta y devuelve datos chicos y ya interpretados (rango de la etapa, si
// está fuera, estado de los equipos), para que el modelo no tenga que adivinar.
import type { SupabaseClient } from "@supabase/supabase-js"
import { cicloActual, etapaRiegoDe, momentoCiclo, sumarDias, type CicloSala } from "@/lib/ciclo"
import { rangoClima, type RangoClima } from "@/lib/clima-alertas"
import { estadoAire, estadoOnOff, textoEstadoAire, textoEstadoOnOff } from "@/lib/nubi"
import type { DispositivoControlable } from "@/lib/types"

export const HERRAMIENTAS = [
  {
    name: "estado_salas",
    description: "Ciclo abierto de cada sala: fecha de entrada, días de vege y de flora, etapa de hoy, semana y fecha estimada de corte.",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "clima_salas",
    description:
      "Clima real de cada sala medido por el Pulse: temperatura y humedad ahora y el mínimo y máximo de hoy, el rango que corresponde a su etapa y si está fuera. Usala para cualquier pregunta sobre cómo está una sala.",
    input_schema: {
      type: "object" as const,
      properties: { sala: { type: "string", description: "Nombre de la sala, por ejemplo «Sala 5». Vacío = todas." } },
    },
  },
  {
    name: "alertas_abiertas",
    description: "Alertas de clima abiertas ahora (sala fuera de rango hace 15 minutos o más): qué variable, valor, límite y desde cuándo.",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "equipos",
    description:
      "Equipos que se manejan desde la app (aire, deshumidificador): sala, si está prendido o apagado (estado real si el equipo lo informa, si no la última orden), consumo, última orden y si falló.",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "propuestas_nubi",
    description: "Lo que Nubi propuso en las últimas 24 horas para los equipos (por ejemplo bajar el aire) y qué se decidió: mandada, descartada, vencida o pendiente.",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "tareas",
    description: "Tareas del equipo: las de hoy (o de un día) con responsable y estado, y las de cultivo de los próximos días.",
    input_schema: {
      type: "object" as const,
      properties: {
        dias: { type: "number", description: "Cuántos días hacia adelante (0 = solo hoy, máximo 14). Por defecto 0." },
      },
    },
  },
  {
    name: "riegos_recientes",
    description: "Últimos riegos cargados en el sistema (sala, fecha, etapa, EC y pH de entrada, runoff, drenaje, notas).",
    input_schema: {
      type: "object" as const,
      properties: { sala: { type: "string", description: "Nombre de la sala, por ejemplo «Sala 5». Vacío = todas." } },
    },
  },
]

const ZONA = "America/Argentina/Buenos_Aires"
const fechaAR = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: ZONA })
const horaAR = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-AR", { timeZone: ZONA, hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
const r1 = (n: unknown) => (n === null || n === undefined || !Number.isFinite(Number(n)) ? null : Math.round(Number(n) * 10) / 10)

type Fila = Record<string, any>

function filtrarSala<T extends { nombre: string }>(salas: T[], input: Record<string, unknown>): T[] {
  const pedida = typeof input.sala === "string" ? input.sala.trim().toLowerCase() : ""
  return pedida ? salas.filter((s) => s.nombre.toLowerCase() === pedida || s.nombre.toLowerCase().startsWith(pedida)) : salas
}

function fuera(valor: number | null, [min, max]: [number, number]): "alto" | "bajo" | null {
  if (valor === null) return null
  return valor > max ? "alto" : valor < min ? "bajo" : null
}

async function salasYCiclos(supabase: SupabaseClient) {
  const [{ data: salas }, { data: ciclos }] = await Promise.all([
    supabase.from("salas_cultivo").select("id, nombre").eq("activo", true),
    supabase.from("ciclos_sala").select("*").eq("estado", "abierto"),
  ])
  return { salas: (salas ?? []) as { id: number; nombre: string }[], ciclos: (ciclos ?? []) as CicloSala[] }
}

async function climaSalas(supabase: SupabaseClient, input: Record<string, unknown>, ahora: Date) {
  const hoy = fechaAR(ahora)
  const medianoche = new Date(`${hoy}T00:00:00-03:00`).toISOString()
  const hace2h = new Date(ahora.getTime() - 2 * 3600_000).toISOString()
  const desde = medianoche < hace2h ? medianoche : hace2h
  const { salas, ciclos } = await salasYCiclos(supabase)
  const elegidas = filtrarSala(salas, input)
  // Sala por sala: la base devuelve como mucho 1000 filas por consulta y un día
  // entero de todas las salas pasa ese límite (se perdían las lecturas nuevas).
  const porSala = await Promise.all(
    elegidas.map((s) =>
      supabase
        .from("lecturas_ambientales")
        .select("sala_id, temperatura_c, humedad_rh, vpd, leido_en")
        .eq("sala_id", s.id)
        .gte("leido_en", desde)
        .order("leido_en", { ascending: false })
        .limit(1000),
    ),
  )
  return elegidas.map((s, i) => {
    const suyas = ((porSala[i].data ?? []) as Fila[]).sort((a, b) => String(b.leido_en).localeCompare(String(a.leido_en)))
    const ultima = suyas[0] && suyas[0].leido_en >= hace2h ? suyas[0] : null
    const deHoy = suyas.filter((l) => l.leido_en >= medianoche)
    const rango: RangoClima | null = rangoClima(s.nombre, cicloActual(ciclos, s.id, hoy), hoy)
    const t = r1(ultima?.temperatura_c)
    const h = ultima?.humedad_rh === null || ultima?.humedad_rh === undefined ? null : Math.round(Number(ultima.humedad_rh))
    const extremos = (campo: string) => {
      const v = deHoy.map((l) => Number(l[campo])).filter(Number.isFinite)
      return v.length ? { min: r1(Math.min(...v)), max: r1(Math.max(...v)) } : null
    }
    return {
      sala: s.nombre,
      etapa: rango?.etapa ?? "sin ciclo (no se vigila el clima)",
      ahora: ultima
        ? { temperatura_c: t, humedad_pct: h, vpd_kpa: r1(ultima.vpd), medido_a_las: horaAR(ultima.leido_en) }
        : "sin lecturas del Pulse en las últimas 2 horas",
      hoy: { temperatura_c: extremos("temperatura_c"), humedad_pct: extremos("humedad_rh") },
      rango: rango ? { temperatura_c: rango.temperatura, humedad_pct: rango.humedad } : null,
      fuera_de_rango: rango ? { temperatura: fuera(t, rango.temperatura), humedad: fuera(h, rango.humedad) } : null,
    }
  })
}

async function alertasAbiertas(supabase: SupabaseClient, ahora: Date) {
  const [{ data }, { data: salas }] = await Promise.all([
    supabase.from("alertas_clima").select("sala_id, variable, lado, valor, limite, mensaje, desde, notificada_en").is("resuelta_en", null),
    supabase.from("salas_cultivo").select("id, nombre"),
  ])
  const filas = (data ?? []) as Fila[]
  if (filas.length === 0) return "No hay alertas de clima abiertas: todas las salas vigiladas están en rango."
  return filas.map((a) => ({
    sala: (salas ?? []).find((s: Fila) => s.id === a.sala_id)?.nombre ?? a.sala_id,
    alerta: a.mensaje,
    desde: `${fechaAR(new Date(a.desde)) === fechaAR(ahora) ? "hoy" : fechaAR(new Date(a.desde))} ${horaAR(a.desde)}`,
    se_aviso_por_celular: Boolean(a.notificada_en),
  }))
}

async function equipos(supabase: SupabaseClient, ahora: Date) {
  const { data } = await supabase.from("dispositivos_controlables").select("*, sala:salas_cultivo(nombre)").eq("activo", true)
  return ((data ?? []) as (DispositivoControlable & { sala: Fila | Fila[] | null })[]).map((d) => {
    const sala = Array.isArray(d.sala) ? d.sala[0] : d.sala
    const esAire = d.tipo === "aire_acondicionado"
    const estado = esAire ? textoEstadoAire(estadoAire(d)) : textoEstadoOnOff(estadoOnOff(d, ahora))
    return {
      equipo: d.nombre,
      sala: sala?.nombre ?? null,
      tipo: d.tipo,
      de_prueba: d.proveedor === "manual_noop" ? "sí: no está conectado a nada real" : "no",
      estado,
      como_se_sabe: d.soporta_feedback && !esAire ? "estado real informado por el equipo" : "última orden cumplida (el equipo no informa su estado)",
      ultima_orden: d.ultimo_comando_payload
        ? { orden: d.ultimo_comando_payload, resultado: d.ultimo_comando_estado, cuando: d.ultimo_comando_en ? `${fechaAR(new Date(d.ultimo_comando_en))} ${horaAR(d.ultimo_comando_en)}` : null }
        : null,
      modo: d.modo,
    }
  })
}

async function propuestasNubi(supabase: SupabaseClient, ahora: Date) {
  const { data } = await supabase
    .from("propuestas_nubi")
    .select("resumen, motivo, estado, creada_en, resuelta_por_nombre")
    .gte("creada_en", new Date(ahora.getTime() - 24 * 3600_000).toISOString())
    .order("creada_en", { ascending: false })
    .limit(15)
  const filas = (data ?? []) as Fila[]
  if (filas.length === 0) return "Nubi no propuso nada en las últimas 24 horas."
  return filas.map((p) => ({
    propuso: p.resumen,
    por_que: p.motivo,
    a_las: horaAR(p.creada_en),
    estado: p.estado,
    decidio: p.resuelta_por_nombre ?? null,
  }))
}

async function tareas(supabase: SupabaseClient, input: Record<string, unknown>, ahora: Date) {
  const dias = Math.max(0, Math.min(14, Math.round(Number(input.dias) || 0)))
  const hoy = fechaAR(ahora)
  const hasta = sumarDias(hoy, dias)
  const [{ data }, { data: perfiles }] = await Promise.all([
    supabase.from("tareas").select("fecha, titulo, estado, responsable_id, nota").gte("fecha", hoy).lte("fecha", hasta).order("fecha"),
    supabase.from("perfiles").select("user_id, nombre"),
  ])
  const filas = (data ?? []) as Fila[]
  return filas.slice(0, 80).map((t) => ({
    fecha: t.fecha === hoy ? "hoy" : t.fecha,
    tarea: t.titulo,
    responsable: (perfiles ?? []).find((p: Fila) => p.user_id === t.responsable_id)?.nombre ?? null,
    estado: t.estado,
    ...(t.nota ? { nota: t.nota } : {}),
  }))
}

async function estadoSalas(supabase: SupabaseClient, ahora: Date) {
  const { salas, ciclos } = await salasYCiclos(supabase)
  const hoy = fechaAR(ahora)
  return ciclos.map((c) => {
    const m = momentoCiclo(c, hoy)
    const er = etapaRiegoDe(m)
    return {
      sala: salas.find((s) => s.id === c.sala_id)?.nombre ?? `Sala ${c.sala_id}`,
      entro: c.fecha_inicio,
      dias_vege: c.dias_vege,
      dias_flora: c.dias_flora,
      etapa_hoy: m.fase,
      semana: er?.semana ?? null,
      pasa_a_flora: sumarDias(c.fecha_inicio, c.dias_vege),
      corte_estimado: sumarDias(c.fecha_inicio, c.dias_vege + c.dias_flora),
      notas: c.notas,
    }
  })
}

async function riegosRecientes(supabase: SupabaseClient, input: Record<string, unknown>) {
  const { data: salas } = await supabase.from("salas_cultivo").select("id, nombre")
  let q = supabase.from("registros_riego").select("*").order("fecha", { ascending: false }).limit(15)
  const elegida = filtrarSala((salas ?? []) as { id: number; nombre: string }[], input)
  if (typeof input.sala === "string" && input.sala.trim() && elegida[0]) q = q.eq("sala_id", elegida[0].id)
  const { data } = await q
  return ((data ?? []) as Fila[]).map((r) => ({ ...r, sala: (salas ?? []).find((s: Fila) => s.id === r.sala_id)?.nombre ?? r.sala_id }))
}

/** Ejecuta una herramienta pedida por el modelo. Nunca tira: devuelve { error } si algo falla. */
export async function ejecutarHerramienta(
  supabase: SupabaseClient,
  nombre: string,
  input: Record<string, unknown>,
  ahora: Date = new Date(),
): Promise<unknown> {
  try {
    switch (nombre) {
      case "estado_salas": return await estadoSalas(supabase, ahora)
      case "clima_salas": return await climaSalas(supabase, input, ahora)
      case "alertas_abiertas": return await alertasAbiertas(supabase, ahora)
      case "equipos": return await equipos(supabase, ahora)
      case "propuestas_nubi": return await propuestasNubi(supabase, ahora)
      case "tareas": return await tareas(supabase, input, ahora)
      case "riegos_recientes": return await riegosRecientes(supabase, input)
      default: return { error: "Herramienta desconocida" }
    }
  } catch (err) {
    console.error(`[asistente] Falló la herramienta ${nombre}:`, err)
    return { error: "No se pudo leer ese dato" }
  }
}
