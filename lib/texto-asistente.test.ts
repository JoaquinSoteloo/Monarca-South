import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { createElement } from "react"
import { TextoAsistente } from "@/components/chat/texto-asistente"

const html = (t: string) => renderToStaticMarkup(createElement(TextoAsistente, { texto: t }))

describe("TextoAsistente", () => {
  it("negrita y listas", () => {
    const h = html("La Sala 5 está en **58 %**.\n- **Temperatura:** en rango\n- Humedad alta")
    expect(h).toContain("<strong>58 %</strong>")
    expect(h).toContain("<ul")
    expect(h).toContain("<li><strong>Temperatura:</strong> en rango</li>")
    expect(h).not.toContain("**")
  })
  it("no deja pasar HTML", () => {
    expect(html("<img src=x onerror=alert(1)> **hola**")).toContain("&lt;img")
  })
})
