// Lo que el asistente de cultivo puede consultar (pedido de Joaquín,
// 13/11/2026: "darle los datos"). Cada herramienta lee con la sesión de quien
// pregunta y devuelve datos chicos y ya interpretados (rango de la etapa, si
// está fuera, estado de los equipos), para que el modelo no tenga que adivinar.
import type { SupabaseClient } from "@supabase/supabase-js"
import { cicloActual, etapaRiegoDe, momentoCiclo, sumarDias, type CicloSala } from "@/lib/ciclo"
import { rangoClima, type RangoClima } from "@/lib/clima-alertas"
import { estadoAire, estadoOnOff, textoEstadoAire, textoEstadoOnOff } from "@/lib/nubi"
import type { DispositivoControlable } from "@/lib/types"
import {
  ETAPAS_FENO,
  ESTADOS_FENO,
  FORMAS,
  NUDOS,
  PUNTAJES,
  SALUDES,
  SEXOS_FENO,
  normalizarCodigo,
  resumirPlanta,
  type ObservacionFeno,
  type PlantaFeno,
} from "@/lib/fenotipado"

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
  {
    name: "fenotipado_ver",
    description:
      "Fenotipado de semillas: las plantas (código como GEL-03, genética, estado, sexo, días desde la germinación), su última revisión, altura, crecimiento por semana, puntajes y alertas. Con «codigo», además las últimas observaciones de esa planta. Usala antes de anotar, para confirmar que el código existe.",
    input_schema: {
      type: "object" as const,
      properties: {
        codigo: { type: "string", description: "Código de una planta, por ejemplo «GEL-03». Vacío = todas." },
        genetica: { type: "string", description: "Filtrar por genética. Vacío = todas." },
      },
    },
  },
  {
    name: "fenotipado_alta_planta",
    description:
      "Da de alta una o varias plantas nuevas del fenotipado (una por semilla). Si no te dan códigos, se arman con la abreviatura de la genética y números seguidos (GEL-01, GEL-02…). Confirmá con la persona la genética y la cantidad antes de llamarla.",
    input_schema: {
      type: "object" as const,
      properties: {
        genetica: { type: "string", description: "Nombre de la genética, por ejemplo «Gelato 41»." },
        prefijo: { type: "string", description: "Abreviatura para el código (2 a 5 letras), por ejemplo «GEL»." },
        cantidad: { type: "number", description: "Cuántas plantas dar de alta (1 a 30)." },
        banco: { type: "string", description: "Banco de semillas, si lo dicen." },
        fecha_germinacion: { type: "string", description: "Fecha de germinación YYYY-MM-DD. Vacío = hoy." },
        ubicacion: { type: "string", description: "Dónde está, por ejemplo «Sala 3, estante 2»." },
      },
      required: ["genetica", "prefijo", "cantidad"],
    },
  },
  {
    name: "fenotipado_anotar",
    description:
      "Guarda una observación de una planta del fenotipado (lo que te cuentan de una revisión). Pasá solo lo que la persona dijo; no inventes valores. También sirve para cambiar el sexo o el estado de la planta (por ejemplo macho → descartada, o elegida como madre).",
    input_schema: {
      type: "object" as const,
      properties: {
        codigo: { type: "string", description: "Código de la planta, por ejemplo «GEL-03»." },
        fecha: { type: "string", description: "YYYY-MM-DD. Vacío = hoy." },
        etapa: { type: "string", enum: [...ETAPAS_FENO], description: "Etapa de la planta hoy." },
        semana: { type: "number", description: "Semana de la etapa (por ejemplo semana 3 de flora)." },
        altura_cm: { type: "number" },
        nudos: { type: "string", enum: [...NUDOS], description: "Distancia entre nudos." },
        forma: { type: "string", enum: [...FORMAS] },
        salud: { type: "string", enum: [...SALUDES] },
        olor: { type: "string", description: "Cómo huele (frotando el tallo o el cogollo)." },
        vigor: { type: "number", description: "Puntaje 1 a 5." },
        estructura: { type: "number", description: "Puntaje 1 a 5." },
        aroma: { type: "number", description: "Puntaje 1 a 5." },
        resina: { type: "number", description: "Puntaje 1 a 5." },
        resistencia: { type: "number", description: "Puntaje 1 a 5 (plagas, hongos, estrés)." },
        rendimiento: { type: "number", description: "Puntaje 1 a 5." },
        peso_humedo_g: { type: "number" },
        peso_seco_g: { type: "number" },
        nota: { type: "string", description: "Lo demás que contaron, en una frase." },
        sexo: { type: "string", enum: [...SEXOS_FENO], description: "Solo si se vio el sexo." },
        estado: { type: "string", enum: [...ESTADOS_FENO], description: "Solo si cambia: descartada, madre, cosechada." },
      },
      required: ["codigo", "etapa"],
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

// ---------- Fenotipado (script 104) ----------

const textoOnull = (v: unknown, max = 500): string | null =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null
const numeroEn = (v: unknown, min: number, max: number): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v.replace(",", ".")) : NaN
  return Number.isFinite(n) && n >= min && n <= max ? n : null
}
const deLista = <T extends string>(lista: readonly T[], v: unknown): T | null =>
  typeof v === "string" && (lista as readonly string[]).includes(v) ? (v as T) : null
const fechaValida = (v: unknown, ahora: Date): string =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : fechaAR(ahora)

async function fenotipadoVer(supabase: SupabaseClient, input: Record<string, unknown>, ahora: Date) {
  const { data: plantas, error } = await supabase.from("fenotipado_plantas").select("*").order("codigo")
  if (error) return { error: "El fenotipado todavía no está activado (falta correr el script 104)." }
  const { data: obs } = await supabase.from("fenotipado_observaciones").select("*").order("fecha")
  const hoy = fechaAR(ahora)
  const codigo = textoOnull(input.codigo) ? normalizarCodigo(String(input.codigo)) : null
  const genetica = textoOnull(input.genetica)?.toLowerCase() ?? null
  const lista = ((plantas ?? []) as PlantaFeno[]).filter(
    (p) => (!codigo || p.codigo.toUpperCase() === codigo) && (!genetica || p.genetica.toLowerCase().includes(genetica)),
  )
  if (codigo && !lista.length) return { error: `No hay ninguna planta con código ${codigo}.`, codigos: ((plantas ?? []) as PlantaFeno[]).map((p) => p.codigo) }
  return lista.map((p) => {
    const r = resumirPlanta(p, (obs ?? []) as ObservacionFeno[], hoy)
    return {
      codigo: p.codigo,
      genetica: p.genetica,
      estado: p.estado,
      sexo: p.sexo,
      germino: p.fecha_germinacion,
      ubicacion: p.ubicacion,
      revisiones: r.observaciones,
      ultima_revision: r.ultima_fecha,
      etapa: r.etapa_actual,
      altura_cm: r.altura_actual,
      crece_cm_por_semana: r.crecimiento_cm_semana,
      estiramiento_cm: r.estiramiento_cm,
      puntajes: r.puntajes,
      puntaje_promedio: r.puntaje_promedio,
      olor: r.ultimo_olor,
      ultima_nota: r.ultima_nota,
      alertas: r.alertas,
      ...(codigo
        ? { observaciones: ((obs ?? []) as ObservacionFeno[]).filter((o) => o.planta_id === p.id).slice(-10) }
        : {}),
    }
  })
}

async function fenotipadoAlta(supabase: SupabaseClient, input: Record<string, unknown>, ahora: Date) {
  const genetica = textoOnull(input.genetica, 100)
  const prefijo = textoOnull(input.prefijo, 5)?.toUpperCase().replace(/[^A-ZÑ]/g, "")
  const cantidad = numeroEn(input.cantidad, 1, 30)
  if (!genetica || !prefijo || !cantidad) return { error: "Falta la genética, la abreviatura o la cantidad (1 a 30)." }
  const { data: existentes, error } = await supabase.from("fenotipado_plantas").select("codigo")
  if (error) return { error: "El fenotipado todavía no está activado (falta correr el script 104)." }
  const usados = new Set(((existentes ?? []) as { codigo: string }[]).map((e) => e.codigo.toUpperCase()))
  let nro = 1
  const filas = []
  while (filas.length < Math.round(cantidad)) {
    const codigo = `${prefijo}-${String(nro).padStart(2, "0")}`
    if (!usados.has(codigo)) {
      filas.push({
        codigo,
        genetica,
        banco: textoOnull(input.banco, 100),
        fecha_germinacion: fechaValida(input.fecha_germinacion, ahora),
        ubicacion: textoOnull(input.ubicacion, 100),
      })
    }
    nro++
  }
  const { data, error: errAlta } = await supabase.from("fenotipado_plantas").insert(filas).select("codigo")
  if (errAlta) return { error: "No se pudieron dar de alta las plantas. Puede que tu rol no tenga permiso de Fenotipado." }
  return { ok: true, genetica, codigos: ((data ?? []) as { codigo: string }[]).map((d) => d.codigo) }
}

async function fenotipadoAnotar(supabase: SupabaseClient, input: Record<string, unknown>, ahora: Date) {
  const codigo = textoOnull(input.codigo) ? normalizarCodigo(String(input.codigo)) : null
  const etapa = deLista(ETAPAS_FENO, input.etapa)
  if (!codigo || !etapa) return { error: "Falta el código de la planta o la etapa." }
  const { data: plantas, error } = await supabase.from("fenotipado_plantas").select("id, codigo, sexo, estado")
  if (error) return { error: "El fenotipado todavía no está activado (falta correr el script 104)." }
  const planta = ((plantas ?? []) as Pick<PlantaFeno, "id" | "codigo" | "sexo" | "estado">[]).find(
    (p) => p.codigo.toUpperCase() === codigo,
  )
  if (!planta) return { error: `No hay ninguna planta con código ${codigo}. Preguntá cuál es o dala de alta primero.` }

  const fila: Record<string, unknown> = {
    planta_id: planta.id,
    fecha: fechaValida(input.fecha, ahora),
    etapa,
    semana: numeroEn(input.semana, 0, 30),
    altura_cm: numeroEn(input.altura_cm, 0, 500),
    nudos: deLista(NUDOS, input.nudos),
    forma: deLista(FORMAS, input.forma),
    salud: deLista(SALUDES, input.salud),
    olor: textoOnull(input.olor, 200),
    peso_humedo_g: numeroEn(input.peso_humedo_g, 0, 100000),
    peso_seco_g: numeroEn(input.peso_seco_g, 0, 100000),
    nota: textoOnull(input.nota, 1000),
    origen: "asistente",
  }
  for (const p of PUNTAJES) {
    const v = numeroEn(input[p], 1, 5)
    fila[p] = v === null ? null : Math.round(v)
  }
  const { error: errObs } = await supabase.from("fenotipado_observaciones").insert(fila)
  if (errObs) return { error: "No se pudo guardar la observación. Puede que tu rol no tenga permiso de Fenotipado." }

  const cambios: Record<string, string> = {}
  const sexo = deLista(SEXOS_FENO, input.sexo)
  const estado = deLista(ESTADOS_FENO, input.estado)
  if (sexo && sexo !== planta.sexo) cambios.sexo = sexo
  if (estado && estado !== planta.estado) cambios.estado = estado
  if (Object.keys(cambios).length) {
    await supabase.from("fenotipado_plantas").update({ ...cambios, updated_at: ahora.toISOString() }).eq("id", planta.id)
  }
  const guardado = Object.fromEntries(Object.entries(fila).filter(([k, v]) => v !== null && k !== "planta_id" && k !== "origen"))
  return { ok: true, codigo: planta.codigo, guardado, ...(Object.keys(cambios).length ? { planta_actualizada: cambios } : {}) }
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
      case "fenotipado_ver": return await fenotipadoVer(supabase, input, ahora)
      case "fenotipado_alta_planta": return await fenotipadoAlta(supabase, input, ahora)
      case "fenotipado_anotar": return await fenotipadoAnotar(supabase, input, ahora)
      default: return { error: "Herramienta desconocida" }
    }
  } catch (err) {
    console.error(`[asistente] Falló la herramienta ${nombre}:`, err)
    return { error: "No se pudo leer ese dato" }
  }
}
