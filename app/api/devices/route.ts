import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// CRUD de dispositivos_controlables (el "dispositivo/actuador abstracto").
// Sin secretos de por medio, pero pasa por route handler (en vez de Supabase
// directo desde el cliente, como el resto del CRUD simple de la app) porque
// comparte convenciones con /api/devices/[id]/command, que sí necesita
// lógica de servidor (invocar el adapter correspondiente).
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const salaId = searchParams.get("sala_id")

  const supabase = await createClient()
  let query = supabase
    .from("dispositivos_controlables")
    .select("*, sala:salas_cultivo(id, nombre)")
    .order("nombre")

  if (salaId) {
    query = query.eq("sala_id", Number(salaId))
  }

  const { data, error } = await query

  if (error) {
    console.error("[devices] Error leyendo dispositivos_controlables:", error)
    return NextResponse.json({ error: "No se pudo leer el catálogo de dispositivos" }, { status: 500 })
  }

  return NextResponse.json({ dispositivos: data })
}

export async function POST(request: Request) {
  const body = await request.json()
  const { nombre, sala_id, tipo, proveedor, modo_ejecucion, proveedor_config, soporta_feedback, requisito_ausente } = body

  if (!nombre || !tipo || !proveedor || !modo_ejecucion) {
    return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 })
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("dispositivos_controlables")
    .insert({
      nombre,
      sala_id: sala_id ?? null,
      tipo,
      proveedor,
      modo_ejecucion,
      proveedor_config: proveedor_config ?? {},
      soporta_feedback: soporta_feedback ?? false,
      requisito_ausente: requisito_ausente ?? null,
    })
    .select()
    .single()

  if (error) {
    console.error("[devices] Error creando dispositivo_controlable:", error)
    return NextResponse.json({ error: "No se pudo crear el dispositivo" }, { status: 500 })
  }

  return NextResponse.json({ dispositivo: data })
}
