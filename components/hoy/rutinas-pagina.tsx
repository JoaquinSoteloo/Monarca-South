"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { ChevronLeft } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { Rutinas } from "@/components/equipo/rutinas"
import type { Perfil, TareaPlantilla } from "@/lib/equipo"

/** Las rutinas del equipo en su propia página (antes eran una pestaña de Equipo). */
export function RutinasPagina({ yo, perfiles, initialPlantillas }: { yo: Perfil; perfiles: Perfil[]; initialPlantillas: TareaPlantilla[] }) {
  const supabase = useMemo(() => createClient(), [])
  const [plantillas, setPlantillas] = useState(initialPlantillas)

  return (
    <div className="space-y-4">
      <Link
        href="/equipo"
        className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-primary underline-offset-2 hover:underline"
      >
        <ChevronLeft className="size-4" /> Hoy
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">Rutinas</h1>
      <Rutinas yo={yo} perfiles={perfiles} plantillas={plantillas} setPlantillas={setPlantillas} supabase={supabase} />
    </div>
  )
}
