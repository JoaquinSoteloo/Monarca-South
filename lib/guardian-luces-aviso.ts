// Guardián de luces en el motor (cada 5 minutos): abre y cierra alertas de luz
// en alertas_clima (variable 'luz', script 099) y avisa al celular, un aviso
// por problema y otro cuando se resuelve, como las alertas de clima.
// No importar desde código que llegue al navegador (usa web-push).
import type { SupabaseClient } from "@supabase/supabase-js"
import { sendPushNotification } from "@/lib/push/send"
import { luzVolvioANormal, revisarLuz, type LecturaLuz } from "@/lib/guardian-luces"
import type { AlertaClima } from "@/lib/clima-alertas-aviso"

async function avisar(title: string, body: string, tag: string): Promise<boolean> {
  try {
    const r = await sendPushNotification({ title, body, url: "/sede", tag })
    return !(r.sent === 0 && r.failed > 0)
  } catch (err) {
    console.error("[guardian-luces] No se pudo avisar:", err)
    return false
  }
}

export async function avisarLuces(supabase: SupabaseClient, ahora: Date = new Date()): Promise<number> {
  const ahoraIso = ahora.toISOString()
  const [salasR, abiertasR] = await Promise.all([
    supabase.from("salas_cultivo").select("id, nombre, luz_prende, luz_apaga").eq("activo", true),
    supabase.from("alertas_clima").select("*").is("resuelta_en", null).eq("variable", "luz"),
  ])
  if (salasR.error) throw new Error(salasR.error.message)
  if (abiertasR.error) throw new Error(abiertasR.error.message)
  const salas = ((salasR.data ?? []) as { id: number; nombre: string; luz_prende: string | null; luz_apaga: string | null }[]).filter(
    (s) => s.luz_prende && s.luz_apaga,
  )
  const abiertas = (abiertasR.data ?? []) as AlertaClima[]
  let avisos = 0

  for (const sala of salas) {
    const { data } = await supabase
      .from("lecturas_ambientales")
      .select("leido_en, luz_lux")
      .eq("sala_id", sala.id)
      .gte("leido_en", new Date(ahora.getTime() - 130 * 60000).toISOString())
      .order("leido_en", { ascending: false })
      .limit(100)
    const lecturas = (data ?? []) as LecturaLuz[]
    const abierta = abiertas.find((a) => a.sala_id === sala.id)
    const horario = { prende: sala.luz_prende as string, apaga: sala.luz_apaga as string }

    if (abierta) {
      // Se cierra cuando vuelve a lo normal; mientras tanto, si no se pudo avisar, se reintenta.
      if (luzVolvioANormal(lecturas, abierta.lado, ahora)) {
        await supabase.from("alertas_clima").update({ resuelta_en: ahoraIso, actualizada_en: ahoraIso }).eq("id", abierta.id)
        if (abierta.notificada_en) {
          const texto = abierta.lado === "alto" ? "las luces se apagaron" : "las luces prendieron"
          if (await avisar(`✓ ${sala.nombre}: ${texto}`, "Nubi lo confirma con el Pulse.", `luz-${abierta.id}`)) avisos += 1
        }
      } else if (!abierta.notificada_en) {
        if (await avisar(`⚠ ${sala.nombre}: ${abierta.mensaje}`, cuerpo(abierta.lado), `luz-${abierta.id}`)) {
          await supabase.from("alertas_clima").update({ notificada_en: ahoraIso }).eq("id", abierta.id)
          avisos += 1
        }
      }
      continue
    }

    const problema = revisarLuz(lecturas, horario, ahora)
    if (!problema) continue
    const { data: nueva, error } = await supabase
      .from("alertas_clima")
      .insert({
        sala_id: sala.id,
        variable: "luz",
        lado: problema.lado,
        valor: problema.valor,
        limite: 10,
        mensaje: problema.mensaje,
        desde: ahoraIso,
        actualizada_en: ahoraIso,
      })
      .select("id")
      .single()
    if (error || !nueva) {
      console.error("[guardian-luces] No se pudo guardar la alerta:", error)
      continue
    }
    if (await avisar(`⚠ ${sala.nombre}: ${problema.mensaje}`, cuerpo(problema.lado), `luz-${nueva.id}`)) {
      await supabase.from("alertas_clima").update({ notificada_en: ahoraIso }).eq("id", nueva.id)
      avisos += 1
    }
  }
  return avisos
}

function cuerpo(lado: "alto" | "bajo"): string {
  return lado === "alto"
    ? "Interrumpir la noche estresa las plantas y en flora puede dar hermafroditas. Revisá el timer y que nadie haya prendido la luz."
    : "Revisá el timer, la térmica de las luces y si hubo un corte de luz."
}
