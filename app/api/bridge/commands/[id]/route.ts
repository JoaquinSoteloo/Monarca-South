import { NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"
import { autorizado, resolverComando } from "@/lib/bridge/cola"

// El puente avisa cómo le fue con un comando: { estado: "ejecutado" } o
// { estado: "fallido", error: "..." }.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!autorizado(request)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }
  const { id } = await params
  const body = await request.json().catch(() => null)
  const estado = body?.estado
  if (!Number.isInteger(Number(id)) || (estado !== "ejecutado" && estado !== "fallido")) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 })
  }
  try {
    const ok = await resolverComando(createServiceClient(), Number(id), { estado, error: body?.error })
    return NextResponse.json({ ok }, { status: ok ? 200 : 409 })
  } catch (err) {
    console.error("[bridge/commands/id] Error resolviendo comando:", err)
    return NextResponse.json({ error: "No se pudo guardar el resultado" }, { status: 500 })
  }
}
