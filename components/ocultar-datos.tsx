"use client"

/**
 * Ojito del Inicio para tapar importes y cantidades cuando hay gente mirando
 * la pantalla. La preferencia vive en una cookie (no en localStorage) para
 * que el servidor ya renderice los datos tapados y no se vean un instante al
 * cargar. Cada dato a tapar va envuelto en <DatoSensible>.
 */
import { createContext, useContext, useState, type ReactNode } from "react"
import { Eye, EyeOff } from "lucide-react"
import { OCULTAR_DATOS_COOKIE } from "@/lib/ocultar-datos"

const OcultarDatosContext = createContext<{ oculto: boolean; alternar: () => void } | null>(null)

export function OcultarDatosProvider({
  inicialOculto,
  className,
  children,
}: {
  inicialOculto: boolean
  className?: string
  children: ReactNode
}) {
  const [oculto, setOculto] = useState(inicialOculto)

  const alternar = () => {
    const nuevo = !oculto
    setOculto(nuevo)
    document.cookie = `${OCULTAR_DATOS_COOKIE}=${nuevo ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`
  }

  return (
    <OcultarDatosContext.Provider value={{ oculto, alternar }}>
      <main className={className}>{children}</main>
    </OcultarDatosContext.Provider>
  )
}

export function DatoSensible({ children }: { children: ReactNode }) {
  const ctx = useContext(OcultarDatosContext)
  if (!ctx?.oculto) return <>{children}</>
  return (
    <span aria-label="Dato oculto" className="select-none tracking-widest">
      ••••••
    </span>
  )
}

export function OcultarDatosToggle() {
  const ctx = useContext(OcultarDatosContext)
  if (!ctx) return null
  const { oculto, alternar } = ctx
  const Icon = oculto ? EyeOff : Eye

  return (
    <button
      type="button"
      onClick={alternar}
      aria-pressed={oculto}
      aria-label={oculto ? "Mostrar datos" : "Ocultar datos"}
      title={oculto ? "Mostrar datos" : "Ocultar datos"}
      className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:bg-primary/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <Icon className="h-5 w-5" />
    </button>
  )
}
