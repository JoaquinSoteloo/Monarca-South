import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const salaId = searchParams.get("sala_id")

  const supabase = await createClient()
  let query = supabase
    .from("automatizaciones")
    .select("*, pulse_device:pulse_devices(id, name), dispositivo:dispositivos_controlables(*)")
    .order("nombre")

  if (salaId) {
    query = query.eq("sala_id", Number(salaId))
  }

  const { data, error } = await query

  if (error) {
    console.error("[automations] Error leyendo automatizaciones:", error)
    return NextResponse.json({ error: "No se pudieron leer las automatizaciones" }, { status: 500 })
  }

  return NextResponse.json({ automatizaciones: data })
}

export async function POST(request: Request) {
  const body = await request.json()
  const {
    nombre,
    sala_id,
    pulse_device_id,
    variable,
    operador,
    valor_objetivo,
    duracion_minima_segundos,
    operador_apagado,
    valor_apagado,
    duracion_apagado_segundos,
    cooldown_segundos,
    dispositivo_id,
    accion_encendido,
    accion_apagado,
    accion_fail_safe,
    activa,
  } = body

  if (!nombre || !sala_id || !pulse_device_id || !variable || !operador || valor_objetivo === undefined || !dispositivo_id) {
    return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 })
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("automatizaciones")
    .insert({
      nombre,
      sala_id,
      pulse_device_id,
      variable,
      operador,
      valor_objetivo,
      duracion_minima_segundos: duracion_minima_segundos ?? 0,
      operador_apagado: operador_apagado ?? null,
      valor_apagado: valor_apagado ?? null,
      duracion_apagado_segundos: duracion_apagado_segundos ?? null,
      cooldown_segundos: cooldown_segundos ?? 300,
      dispositivo_id,
      accion_encendido: accion_encendido ?? {},
      accion_apagado: accion_apagado ?? {},
      accion_fail_safe: accion_fail_safe ?? "mantener",
      activa: activa ?? true,
    })
    .select()
    .single()

  if (error) {
    console.error("[automations] Error creando automatización:", error)
    return NextResponse.json({ error: "No se pudo crear la automatización" }, { status: 500 })
  }

  return NextResponse.json({ automatizacion: data })
}
