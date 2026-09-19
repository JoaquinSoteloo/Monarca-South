"use client"

import { useEffect, useRef, useState } from "react"
import { Loader2 } from "lucide-react"
import { Document, Page, pdfjs } from "react-pdf"

// El visor nativo de PDF de los navegadores móviles (embebido vía <iframe>)
// no ajusta el zoom al ancho de pantalla: el catálogo aparecía enorme y
// obligaba a hacer pinch-zoom. react-pdf renderiza cada página en un canvas
// al ancho exacto del contenedor, así que el ajuste es igual en cualquier
// dispositivo. El worker se sirve desde node_modules (mismo build que la
// versión de pdfjs-dist que usa react-pdf) para no depender de un CDN.
pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString()

const RUTA_CATALOGO = "/catalogo/catalogo-socios-monarca-south.pdf"

// Páginas del catálogo renderizadas en canvas, ancho fijo al contenedor
// (se remide con ResizeObserver: cubre resize y rotación del celular).
// Se importa en page.tsx vía next/dynamic con ssr:false: pdfjs-dist toca
// `window`/`document` al evaluarse y rompe el render en el servidor.
export default function PaginasCatalogo() {
  const contenedorRef = useRef<HTMLDivElement>(null)
  const [ancho, setAncho] = useState(0)
  const [numPaginas, setNumPaginas] = useState(0)

  useEffect(() => {
    const el = contenedorRef.current
    if (!el) return
    const actualizarAncho = () => setAncho(el.clientWidth)
    actualizarAncho()
    const observer = new ResizeObserver(actualizarAncho)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div className="flex-1 overflow-y-auto bg-[#EDEAE0] px-2 py-3 sm:px-4">
      <div ref={contenedorRef} className="mx-auto flex w-full max-w-2xl flex-col items-center gap-3">
        <Document
          file={RUTA_CATALOGO}
          onLoadSuccess={({ numPages }) => setNumPaginas(numPages)}
          loading={
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-[#1F3D2B]" aria-hidden />
            </div>
          }
          error={
            <p className="py-10 text-center text-sm text-[#8A3B2C]">
              No pudimos cargar el catálogo. Revisá tu conexión e intentá de nuevo.
            </p>
          }
          className="flex w-full flex-col items-center gap-3"
        >
          {ancho > 0 &&
            Array.from({ length: numPaginas }, (_, i) => (
              <Page
                key={i}
                pageNumber={i + 1}
                width={ancho}
                renderAnnotationLayer={false}
                renderTextLayer={false}
                className="overflow-hidden rounded-md shadow-sm"
              />
            ))}
        </Document>
      </div>
    </div>
  )
}
