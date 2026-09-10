import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getAlertasContext } from "@/lib/automations/alerts-data"

function parseIds(csv: string | null): number[] {
  if (!csv) return []
  return csv
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n))
}

// Refresco desde el cliente de los insumos de lib/automations/alerts.ts,
// para que las alertas de la UI reflejen el estado justo después de
// "Evaluar ahora" u otras acciones, sin necesitar un full page reload.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const pulseDeviceIds = parseIds(searchParams.get("pulse_device_ids"))
  const automatizacionIds = parseIds(searchParams.get("automatizacion_ids"))

  const supabase = await createClient()
  try {
    const contexto = await getAlertasContext(supabase, pulseDeviceIds, automatizacionIds)
    return NextResponse.json(contexto)
  } catch (error) {
    console.error("[automations/alerts-context] Error leyendo contexto de alertas:", error)
    return NextResponse.json({ error: "No se pudo leer el contexto de alertas" }, { status: 500 })
  }
}
