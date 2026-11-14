import { Fragment, type ReactNode } from "react"

/**
 * Respuestas del asistente con el formato simple que escriben los modelos:
 * **negrita**, listas con "- " o "* " o "1. " y títulos con "#". Arma
 * elementos de React (nunca HTML crudo), así que no hay riesgo de inyección.
 */
function enLinea(texto: string): ReactNode[] {
  return texto.split(/(\*\*[^*]+\*\*)/g).map((parte, i) =>
    parte.startsWith("**") && parte.endsWith("**") && parte.length > 4 ? (
      <strong key={i}>{parte.slice(2, -2)}</strong>
    ) : (
      <Fragment key={i}>{parte}</Fragment>
    ),
  )
}

export function TextoAsistente({ texto }: { texto: string }) {
  const bloques: ReactNode[] = []
  let lista: { ordenada: boolean; items: string[] } | null = null
  const cerrarLista = () => {
    if (!lista) return
    const items = lista.items.map((it, i) => <li key={i}>{enLinea(it)}</li>)
    bloques.push(
      lista.ordenada ? (
        <ol key={bloques.length} className="my-1 list-decimal space-y-0.5 pl-5">{items}</ol>
      ) : (
        <ul key={bloques.length} className="my-1 list-disc space-y-0.5 pl-5">{items}</ul>
      ),
    )
    lista = null
  }

  for (const linea of texto.split(/\r?\n/)) {
    const vineta = linea.match(/^\s*[-*•]\s+(.*)$/)
    const numero = linea.match(/^\s*\d+[.)]\s+(.*)$/)
    if (vineta || numero) {
      const ordenada = Boolean(numero)
      if (!lista || lista.ordenada !== ordenada) {
        cerrarLista()
        lista = { ordenada, items: [] }
      }
      lista.items.push((vineta ?? numero)![1])
      continue
    }
    cerrarLista()
    const titulo = linea.match(/^\s*#{1,6}\s+(.*)$/)
    if (titulo) {
      bloques.push(<p key={bloques.length} className="mt-1 font-semibold">{enLinea(titulo[1].replace(/\*\*/g, ""))}</p>)
    } else if (linea.trim() === "") {
      bloques.push(<div key={bloques.length} className="h-2" />)
    } else {
      bloques.push(<p key={bloques.length}>{enLinea(linea)}</p>)
    }
  }
  cerrarLista()
  return <div className="break-words text-[15px] leading-relaxed">{bloques}</div>
}
