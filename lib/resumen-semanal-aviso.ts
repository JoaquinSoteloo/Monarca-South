// El motor manda el resumen semanal de Nubi los lunes desde las 09:00 (una vez
// por semana: resumenes_nubi.semana_desde es único). No importar desde código
// que llegue al navegador (usa web-push).
import type { SupabaseClient } from "@supabase/supabase-js"
import { sendPushNotification } from "@/lib/push/send"
import { armarResumen, semanaParaResumir } from "@/lib/resumen-semanal"

export async function enviarResumenSemanal(supabase: SupabaseClient, ahora: Date = new Date()): Promise<number> {
  const semana = semanaParaResumir(ahora)
  if (!semana) return 0
  const { data: ya } = await supabase.from("resumenes_nubi").select("id, enviado_en, sugerencia").eq("semana_desde", semana.semana).maybeSingle()
  if (ya?.enviado_en) return 0

  let id = ya?.id as number | undefined
  let sugerencia = ya?.sugerencia as string | undefined
  if (!id) {
    const r = await armarResumen(supabase, semana.desde, semana.hasta)
    const { data: fila, error } = await supabase
      .from("resumenes_nubi")
      .insert({ semana_desde: semana.semana, texto: r.texto, sugerencia: r.sugerencia, datos: r.datos })
      .select("id")
      .single()
    if (error || !fila) {
      console.error("[resumen-semanal] No se pudo guardar:", error)
      return 0
    }
    id = fila.id as number
    sugerencia = r.sugerencia
  }
  try {
    const r = await sendPushNotification({
      title: "🛰 Resumen semanal de Nubi",
      body: sugerencia ?? "El resumen de la semana está en Control manual.",
      url: "/control-manual",
      tag: `resumen-${semana.semana}`,
    })
    if (r.sent === 0 && r.failed > 0) return 0 // se reintenta en la próxima corrida
  } catch (err) {
    console.error("[resumen-semanal] No se pudo avisar:", err)
    return 0
  }
  await supabase.from("resumenes_nubi").update({ enviado_en: ahora.toISOString() }).eq("id", id)
  return 1
}
