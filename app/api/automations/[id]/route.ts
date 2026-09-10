import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

const CAMPOS_PERMITIDOS = [
  "nombre",
  "sala_id",
  "activa",
  "pulse_device_id",
  "variable",
  "operador",
  "valor_objetivo",
  "duracion_minima_segundos",
  "operador_apagado",
  "valor_apagado",
  "duracion_apagado_segundos",
  "cooldown_segundos",
  "dispositivo_id",
  "accion_encendido",
  "accion_apagado",
  "accion_fail_safe",
]

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await request.json()

  // ultimo_disparo_en/tipo los gestiona exclusivamente el motor
  // (lib/automations/engine.ts) para el cooldown, nunca este endpoint.
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const campo of CAMPOS_PERMITIDOS) {
    if (campo in body) updates[campo] = body[campo]
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("automatizaciones")
    .update(updates)
    .eq("id", Number(id))
    .select()
    .single()

  if (error) {
    console.error(`[automations/${id}] Error actualizando automatización:`, error)
    return NextResponse.json({ error: "No se pudo actualizar la automatización" }, { status: 500 })
  }

  return NextResponse.json({ automatizacion: data })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { error } = await supabase.from("automatizaciones").delete().eq("id", Number(id))

  if (error) {
    console.error(`[automations/${id}] Error eliminando automatización:`, error)
    return NextResponse.json({ error: "No se pudo eliminar la automatización" }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
