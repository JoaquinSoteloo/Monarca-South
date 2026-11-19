import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getServerSession } from "@/lib/auth/session"
import { tienePermiso } from "@/lib/permisos"
import { completar } from "@/lib/ia"
import { getArgentinaDateString } from "@/lib/timezone"
import { datosParaResumen, resumirPlanta, type ObservacionFeno, type PlantaFeno } from "@/lib/fenotipado"

// Resumen del fenotipado escrito por la IA (pantalla Fenotipado → Resumen).
// Lee con la sesión de quien lo pide y usa la clave de IA de Vercel (lib/ia.ts).
const SISTEMA = `Sos el asesor de cultivo de Monarca South (cannabis medicinal, interior, coco y LED). Te paso el registro de un fenotipado: plantas de semilla de varias genéticas, con sus revisiones y puntajes de 1 a 5. Escribí un resumen para Lucho (cultivador) y Facundo (presidente), en español rioplatense, claro y corto, para leer en el celular:
- Por cada genética: cómo viene cada planta en 1 línea (crecimiento, estructura, olor, salud) y cuál o cuáles conviene conservar como madre y por qué. Si todavía es temprano para decidir, decilo.
- Al final, "Para hacer": lo que falta medir o anotar (plantas sin revisar hace días, sin altura, sin puntajes al cerrar la etapa, sin esqueje antes de flora, machos o hermafroditas sin descartar).
Usá solo los datos que te paso; no inventes. Sin tablas; podés usar **negrita** y listas con "- ".`

export async function POST() {
  const session = await getServerSession()
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  if (!tienePermiso(session.permisos, "fenotipado.ver")) {
    return NextResponse.json({ error: "Tu rol no tiene acceso a Fenotipado" }, { status: 403 })
  }
  const supabase = await createClient()
  const [{ data: plantas, error }, { data: obs }] = await Promise.all([
    supabase.from("fenotipado_plantas").select("*").order("codigo"),
    supabase.from("fenotipado_observaciones").select("*").order("fecha").order("id"),
  ])
  if (error) return NextResponse.json({ error: "Falta correr el script 104." }, { status: 503 })
  if (!plantas?.length) return NextResponse.json({ error: "Todavía no hay plantas cargadas." }, { status: 400 })

  const hoy = getArgentinaDateString()
  const lista = plantas as PlantaFeno[]
  const observaciones = (obs ?? []) as ObservacionFeno[]
  const datos = datosParaResumen(lista.map((p) => resumirPlanta(p, observaciones, hoy)), observaciones)
  const texto = await completar(SISTEMA, `Hoy es ${hoy}.\n\n${datos}`.slice(0, 30000), 1400, "fenotipado")
  if (!texto) return NextResponse.json({ error: "La IA no pudo armar el resumen ahora. Probá en un rato." }, { status: 502 })
  return NextResponse.json({ resumen: texto })
}
