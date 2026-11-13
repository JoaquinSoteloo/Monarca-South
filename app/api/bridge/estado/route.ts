import { NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"
import { autorizado } from "@/lib/bridge/cola"
import { registrarEstados, type LecturaShelly } from "@/lib/bridge/estado"

// El puente de la sede informa el estado real de sus Shelly por WiFi (cada
// minuto) y recibe la lista de Shelly que tiene que leer. Sin sesión de
// usuario: se autoriza con BRIDGE_TOKEN, igual que /api/bridge/commands.
export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  if (!autorizado(request)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }
  const body = await request.json().catch(() => null)
  const lecturas: LecturaShelly[] = Array.isArray(body?.lecturas) ? body.lecturas.slice(0, 50) : []
  try {
    const shelly = await registrarEstados(createServiceClient(), lecturas)
    return NextResponse.json({ shelly })
  } catch (err) {
    console.error("[bridge/estado] Error guardando el estado:", err)
    return NextResponse.json({ error: "No se pudo guardar el estado" }, { status: 500 })
  }
}
