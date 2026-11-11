"use client"

import { useCallback, useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { RefreshCw } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Botón para volver a traer los datos de la pantalla (citas, gastos, tareas…)
 * sin recargar toda la página. Además actualiza solo cuando la persona vuelve
 * a la pestaña o a la app después de un rato, por si otro cargó algo nuevo.
 */
const MIN_ENTRE_AUTO_MS = 30_000

export function BotonActualizar({ className }: { className?: string }) {
  const router = useRouter()
  const [pendiente, startTransition] = useTransition()
  const [girando, setGirando] = useState(false)
  const ultimo = useRef(Date.now())

  const actualizar = useCallback(() => {
    ultimo.current = Date.now()
    setGirando(true)
    startTransition(() => router.refresh())
    // El ícono gira al menos medio segundo para que se note que hizo algo.
    window.setTimeout(() => setGirando(false), 600)
  }, [router])

  useEffect(() => {
    const alVolver = () => {
      if (document.visibilityState !== "visible") return
      if (Date.now() - ultimo.current < MIN_ENTRE_AUTO_MS) return
      actualizar()
    }
    document.addEventListener("visibilitychange", alVolver)
    window.addEventListener("focus", alVolver)
    return () => {
      document.removeEventListener("visibilitychange", alVolver)
      window.removeEventListener("focus", alVolver)
    }
  }, [actualizar])

  const activo = pendiente || girando

  return (
    <button
      type="button"
      onClick={actualizar}
      disabled={pendiente}
      aria-label="Actualizar datos"
      title="Actualizar datos"
      className={cn(
        "inline-flex h-11 w-11 items-center justify-center rounded-full border bg-card text-foreground shadow-md",
        "transition hover:bg-accent disabled:opacity-70",
        className,
      )}
    >
      <RefreshCw className={cn("h-5 w-5", activo && "animate-spin")} />
    </button>
  )
}
