"use client"

import { useSyncExternalStore } from "react"
import { SedeSimulador } from "@/components/sede-simulador"
import type { Perfil } from "@/lib/equipo"
import type { CicloSala } from "@/lib/ciclo"
import type { SalaCultivo } from "@/lib/types"

const COMPU = "(min-width: 1024px)"

function suscribir(aviso: () => void) {
  const mq = window.matchMedia(COMPU)
  mq.addEventListener("change", aviso)
  return () => mq.removeEventListener("change", aviso)
}

interface Props {
  yo: { id: string; nombre: string } | null
  perfiles: Perfil[]
  salas: SalaCultivo[]
  ciclos: CicloSala[]
}

/**
 * En la compu la Sede es el 3D de Facundo, con datos reales (modo sistema).
 * En el celular no se carga: ahí se ve el plano (components/sede/sede-salas.tsx).
 */
export function SedeEscritorio(props: Props) {
  const esCompu = useSyncExternalStore(suscribir, () => window.matchMedia(COMPU).matches, () => false)
  if (!esCompu) return null
  return <SedeSimulador {...props} modo="sistema" />
}
