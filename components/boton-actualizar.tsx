"use client"

import { useState } from "react"
import { RefreshCw } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Botón para volver a traer los datos de la pantalla (citas, gastos, tareas…).
 * Pedido de Facundo: a veces se carga algo y no aparece hasta recargar.
 *
 * Recarga la página entera: muchas pantallas traen sus datos desde el
 * navegador al abrirse (Citas, Gastos, Caja, Deudas…) y un refresco parcial
 * del servidor no las haría volver a buscar. No recarga solo, ni con una
 * ventana abierta, para no borrar algo que se esté cargando.
 */
export function BotonActualizar({ className }: { className?: string }) {
  const [girando, setGirando] = useState(false)

  function actualizar() {
    if (document.querySelector('[role="dialog"], [role="alertdialog"]')) {
      alert("Cerrá la ventana que tenés abierta antes de actualizar, así no se pierde lo que estás cargando.")
      return
    }
    setGirando(true)
    window.location.reload()
  }

  return (
    <button
      type="button"
      onClick={actualizar}
      disabled={girando}
      aria-label="Actualizar datos"
      title="Actualizar datos"
      className={cn(
        "inline-flex h-11 w-11 items-center justify-center rounded-full border bg-card text-foreground shadow-md",
        "transition hover:bg-accent disabled:opacity-70",
        className,
      )}
    >
      <RefreshCw className={cn("h-5 w-5", girando && "animate-spin")} />
    </button>
  )
}
