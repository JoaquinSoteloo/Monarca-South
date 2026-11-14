// Pedido simple a un modelo de lenguaje (sin herramientas), con la clave de
// Vercel: OpenAI si está OPENAI_API_KEY, si no Anthropic. Lo usan los textos
// que arma Nubi (resumen semanal). Devuelve null si no hay clave o falla: quien
// lo llama tiene que tener un texto de respaldo.
// Solo servidor: las claves nunca van al navegador.

const MODELO_OPENAI = process.env.OPENAI_MODEL || "gpt-5.4-mini"
const MODELO_ANTHROPIC = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5"

export async function completar(sistema: string, mensaje: string, maxTokens = 900): Promise<string | null> {
  const claveOpenAI = process.env.OPENAI_API_KEY
  const claveAnthropic = process.env.ANTHROPIC_API_KEY
  try {
    if (claveOpenAI) {
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${claveOpenAI}` },
        body: JSON.stringify({
          model: MODELO_OPENAI,
          messages: [
            { role: "system", content: sistema },
            { role: "user", content: mensaje },
          ],
          max_completion_tokens: maxTokens,
        }),
      })
      if (!r.ok) {
        console.error("[ia] OpenAI respondió", r.status, (await r.text().catch(() => "")).slice(0, 200))
        return null
      }
      const data = (await r.json()) as { choices?: { message?: { content?: string | null } }[] }
      return data.choices?.[0]?.message?.content?.trim() || null
    }
    if (claveAnthropic) {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": claveAnthropic, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: MODELO_ANTHROPIC, max_tokens: maxTokens, system: sistema, messages: [{ role: "user", content: mensaje }] }),
      })
      if (!r.ok) {
        console.error("[ia] Anthropic respondió", r.status, (await r.text().catch(() => "")).slice(0, 200))
        return null
      }
      const data = (await r.json()) as { content?: { type: string; text?: string }[] }
      return (data.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim() || null
    }
  } catch (err) {
    console.error("[ia] No se pudo consultar al modelo:", err)
  }
  return null
}
