import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

const PAGE_SIZE = 50

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { searchParams } = new URL(request.url)
  const page = Number(searchParams.get("page") ?? "0")

  const supabase = await createClient()
  const { data, error, count } = await supabase
    .from("ejecuciones_automatizacion")
    .select("*, comando:comandos_dispositivo(id, estado, error)", { count: "exact" })
    .eq("automatizacion_id", Number(id))
    .order("creado_en", { ascending: false })
    .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)

  if (error) {
    console.error(`[automations/${id}/executions] Error leyendo historial:`, error)
    return NextResponse.json({ error: "No se pudo leer el historial de ejecuciones" }, { status: 500 })
  }

  return NextResponse.json({ ejecuciones: data, total: count ?? 0, page })
}
