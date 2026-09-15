"use client"

import { cn } from "@/lib/utils"

interface Sala {
  id: number
  nombre: string
}

interface RoomTabsProps {
  salas: Sala[]
  salaActivaId: number | null
  avisosPorSala: Record<number, number>
  onSelect: (id: number) => void
}

// Selector de salas con scroll horizontal propio (sin desbordar la página) y
// un indicador discreto de avisos por sala, derivado de computeAlertasOperativas.
export function RoomTabs({ salas, salaActivaId, avisosPorSala, onSelect }: RoomTabsProps) {
  return (
    <div className="-mx-4 px-4 sm:mx-0 sm:px-0">
      <div
        role="tablist"
        aria-label="Salas"
        className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {salas.map((sala) => {
          const activa = sala.id === salaActivaId
          const avisos = avisosPorSala[sala.id] ?? 0
          return (
            <button
              key={sala.id}
              type="button"
              role="tab"
              aria-selected={activa}
              onClick={() => onSelect(sala.id)}
              className={cn(
                "flex min-h-11 shrink-0 items-center gap-1.5 rounded-md px-4 text-sm font-medium whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none",
                activa ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-secondary/80",
              )}
            >
              {sala.nombre}
              {avisos > 0 && (
                <span
                  className={cn(
                    "inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold",
                    activa ? "bg-white/25 text-white" : "bg-amber-100 text-amber-800",
                  )}
                >
                  {avisos}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
