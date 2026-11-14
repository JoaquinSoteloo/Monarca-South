import { createClient } from "@/lib/supabase/server"
import { ControlManual } from "@/components/control-manual"
import { NubiPropuestas, type PropuestaNubi } from "@/components/nubi-propuestas"
import { NubiPensamientos, type PensamientoNubi } from "@/components/nubi-pensamientos"
import { ConsumoIA, type ConsumoDia } from "@/components/consumo-ia"
import { ResumenSemanal, type ResumenGuardado } from "@/components/resumen-semanal"
import { getServerSession } from "@/lib/auth/session"
import { ROL_COMISION } from "@/lib/permisos"
import type { DispositivoControlable } from "@/lib/types"

export default async function ControlManualPage() {
  const supabase = await createClient()

  const [{ data }, { data: propuestas }, { data: resumenes }, { data: decisiones }] = await Promise.all([
    supabase
      .from("dispositivos_controlables")
      .select("*, sala:salas_cultivo(id, nombre)")
      .eq("activo", true)
      .order("nombre"),
    // Nubi (script 096): las pendientes y las últimas de las 24 h.
    supabase
      .from("propuestas_nubi")
      .select("id, estado, motivo, resumen, creada_en, vence_en, resuelta_por_nombre")
      .gte("creada_en", new Date(Date.now() - 24 * 3600_000).toISOString())
      .order("creada_en", { ascending: false })
      .limit(20),
    // Último resumen semanal de Nubi (script 100).
    supabase.from("resumenes_nubi").select("semana_desde, texto, sugerencia").order("semana_desde", { ascending: false }).limit(1),
    // Qué pensó Nubi (script 102): las últimas decisiones del motor.
    supabase
      .from("nubi_decisiones")
      .select("id, creada_en, fuente, decision, analisis, valida, motivo_rechazo, salida, sala:salas_cultivo(nombre)")
      .neq("fuente", "eval")
      .order("creada_en", { ascending: false })
      .limit(10),
  ])
  const pensamientos: PensamientoNubi[] = ((decisiones ?? []) as any[]).map((d) => ({
    id: d.id,
    creada_en: d.creada_en,
    sala: (Array.isArray(d.sala) ? d.sala[0]?.nombre : d.sala?.nombre) ?? null,
    fuente: d.fuente,
    decision: d.decision,
    analisis: d.analisis,
    valida: d.valida,
    motivo_rechazo: d.motivo_rechazo,
    titulo: d.salida?.titulo ?? d.salida?.resumen ?? null,
  }))
  const ahora = new Date().toISOString()
  const todas = (propuestas ?? []) as PropuestaNubi[]
  const pendientes = todas.filter((p) => p.estado === "pendiente" && (!p.vence_en || p.vence_en > ahora))
  const recientes = todas.filter((p) => !pendientes.includes(p)).slice(0, 5)
  const session = await getServerSession()
  // Consumo de IA de los últimos 7 días (script 103), solo para la comisión.
  const consumo: ConsumoDia[] =
    session?.rol === ROL_COMISION
      ? (((
          await supabase
            .from("ia_uso_por_dia")
            .select("*")
            .gte("dia", new Date(Date.now() - 6 * 86400_000).toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }))
        ).data ?? []) as ConsumoDia[])
      : []

  // PostgREST puede devolver el embed to-one como array; lo normalizamos
  // igual que en app/automatizaciones/page.tsx.
  const dispositivos: DispositivoControlable[] = (data || []).map((d: any) => ({
    ...d,
    sala: (Array.isArray(d.sala) ? d.sala[0] : d.sala) ?? null,
  }))

  return (
          <main className="container mx-auto px-4 py-8">
        <ResumenSemanal ultimo={((resumenes ?? [])[0] as ResumenGuardado | undefined) ?? null} puedeGenerar={session?.rol === ROL_COMISION} />
        <NubiPropuestas pendientes={pendientes} recientes={recientes} />
        <NubiPensamientos pensamientos={pensamientos} puedeEvaluar={session?.rol === ROL_COMISION} />
        {session?.rol === ROL_COMISION && <ConsumoIA filas={consumo} />}
        <ControlManual initialDispositivos={dispositivos} />
      </main>
  )
}
