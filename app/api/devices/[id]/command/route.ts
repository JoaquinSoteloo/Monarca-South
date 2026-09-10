import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { encolarComando } from "@/lib/automations/engine"
import { getServerSession } from "@/lib/auth/session"
import type { DispositivoControlable } from "@/lib/types"

// Comando manual ad-hoc sobre un dispositivo (botones "Encender manual" /
// "Apagar manual" de la UI). Sigue la misma lógica de resolución que el
// motor (servidor_directo se ejecuta ya mismo vía el adapter; bridge_polling
// queda pendiente para el bridge externo). Al emitir un comando manual, el
// dispositivo pasa a modo='manual' automáticamente: evita que el próximo
// tick del motor lo contradiga.
//
// Requiere sesión: este endpoint dispara comandos directos sobre hardware
// (hoy manual_noop; a futuro BroadLink/Shelly), no puede quedar abierto a
// cualquiera que le pegue directo a la URL.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession()
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const { id } = await params
  const body = await request.json()
  const payload = body?.payload

  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "Falta el payload del comando" }, { status: 400 })
  }

  const supabase = await createClient()

  const { data: dispositivo, error: errorDispositivo } = await supabase
    .from("dispositivos_controlables")
    .select("*")
    .eq("id", Number(id))
    .single()

  if (errorDispositivo || !dispositivo) {
    return NextResponse.json({ error: "Dispositivo no encontrado" }, { status: 404 })
  }

  await supabase
    .from("dispositivos_controlables")
    .update({ modo: "manual", updated_at: new Date().toISOString() })
    .eq("id", Number(id))

  const comando = await encolarComando(supabase, dispositivo as DispositivoControlable, null, "manual", payload)

  if (!comando) {
    return NextResponse.json({ error: "No se pudo encolar el comando" }, { status: 500 })
  }

  return NextResponse.json({ comando })
}
