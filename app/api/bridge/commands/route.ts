import { NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"
import { autorizado, tomarComandos } from "@/lib/bridge/cola"

// La notebook de la sede (bridge/puente.py) pregunta cada pocos segundos si
// hay comandos para sus BroadLink. Sin sesión de usuario: se autoriza con
// BRIDGE_TOKEN y lee con el cliente service_role.
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  if (!autorizado(request)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }
  const bridgeId = (request.headers.get("x-bridge-id") || "sede").slice(0, 50)
  try {
    const comandos = await tomarComandos(createServiceClient(), bridgeId)
    return NextResponse.json({ comandos })
  } catch (err) {
    console.error("[bridge/commands] Error tomando comandos:", err)
    return NextResponse.json({ error: "No se pudieron leer los comandos" }, { status: 500 })
  }
}
