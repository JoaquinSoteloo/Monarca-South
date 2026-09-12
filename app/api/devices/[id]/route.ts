import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await request.json()

  // Solo se permiten actualizar estos campos desde acá. ultimo_comando_* y
  // ultimo_estado_confirmado_* los gestiona exclusivamente el motor/adapter
  // (lib/automations/engine.ts), nunca este endpoint.
  const camposPermitidos = [
    "nombre",
    "sala_id",
    "tipo",
    "proveedor",
    "modo_ejecucion",
    "proveedor_config",
    "soporta_feedback",
    "modo",
    "activo",
    "requisito_ausente",
  ]
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const campo of camposPermitidos) {
    if (campo in body) updates[campo] = body[campo]
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("dispositivos_controlables")
    .update(updates)
    .eq("id", Number(id))
    .select()
    .single()

  if (error) {
    console.error(`[devices/${id}] Error actualizando dispositivo:`, error)
    return NextResponse.json({ error: "No se pudo actualizar el dispositivo" }, { status: 500 })
  }

  return NextResponse.json({ dispositivo: data })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { error } = await supabase.from("dispositivos_controlables").delete().eq("id", Number(id))

  if (error) {
    console.error(`[devices/${id}] Error eliminando dispositivo:`, error)
    return NextResponse.json({ error: "No se pudo eliminar el dispositivo" }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
