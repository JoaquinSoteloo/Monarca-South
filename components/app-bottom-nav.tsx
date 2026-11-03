"use client"

import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { useEffect, useState } from "react"
import { Building2, Menu, MessageCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { tienePermiso } from "@/lib/permisos"
import { conversacionDeMensaje } from "@/lib/chat"
import { EVENTO_LEIDOS, leerLeidos } from "@/lib/chat-leidos"
import { EVENTO_ABRIR_MENU } from "@/components/app-nav"

const COLUMNAS: Record<number, string> = { 2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-4" }

/**
 * Barra de abajo en el celular (rediseño del 03/11/2026): Sede y Chat a
 * un toque, y «Más» abre el menú de siempre con el resto del sistema.
 */
export function AppBottomNav({ permisos, yoId }: { permisos: string[]; yoId: string }) {
  const pathname = usePathname()
  const params = useSearchParams()
  const equipo = tienePermiso(permisos, "equipo.ver")
  const sede = tienePermiso(permisos, "sede.ver")
  const [mensajes, setMensajes] = useState(0)

  // Mensajes nuevos del canal y de los privados, cada minuto.
  useEffect(() => {
    if (!equipo) return
    const supabase = createClient()
    let vivo = true
    async function contar() {
      const { leidos, desde } = leerLeidos()
      const m = await supabase
        .from("mensajes")
        .select("autor_id, para_id, tarea_id, created_at")
        .is("tarea_id", null)
        .neq("autor_id", yoId)
        .gt("created_at", desde)
        .order("created_at", { ascending: false })
        .limit(200)
      if (!vivo) return
      const nuevos = (m.data ?? []).filter((x) => {
        const clave = conversacionDeMensaje(x, yoId)
        const hasta = leidos[clave] && leidos[clave] > desde ? leidos[clave] : desde
        return x.created_at > hasta
      })
      setMensajes(nuevos.length)
    }
    void contar()
    const id = window.setInterval(contar, 60_000)
    const alLeer = () => void contar()
    window.addEventListener(EVENTO_LEIDOS, alLeer)
    return () => {
      vivo = false
      window.clearInterval(id)
      window.removeEventListener(EVENTO_LEIDOS, alLeer)
    }
  }, [equipo, yoId])

  // Con una conversación abierta, el chat ocupa toda la pantalla.
  if (pathname === "/chat" && params.get("c")) return null

  const activa = (ruta: string) => pathname === ruta || pathname.startsWith(`${ruta}/`)
  // Sin pestaña «Hoy» (pedido de Facundo): las tareas se marcan desde la Sede 3D.
  const items = [
    ...(sede ? [{ href: "/sede", label: "Sede", icon: Building2, badge: 0, que: "" }] : []),
    ...(equipo ? [{ href: "/chat", label: "Chat", icon: MessageCircle, badge: mensajes, que: "sin leer" }] : []),
  ]

  // Verde bosque como el menú lateral y la barra de arriba; lo activo, con el dorado del menú lateral.
  return (
    <nav
      aria-label="Secciones"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-primary pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <ul className={cn("mx-auto grid max-w-md gap-1 px-2 pt-1.5 pb-2", COLUMNAS[items.length + 1])}>
        {items.map(({ href, label, icon: Icon, badge, que }) => {
          const on = activa(href)
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={on ? "page" : undefined}
                aria-label={badge > 0 ? `${label}, ${badge} ${que}` : undefined}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                  on ? "font-semibold text-white" : "font-medium text-primary-foreground/75 hover:text-white",
                )}
              >
                <span className={cn("relative flex h-8 w-14 items-center justify-center rounded-full", on && "bg-white/12")}>
                  <Icon className={cn("size-5", on && "text-accent")} />
                  {badge > 0 && (
                    <span
                      aria-hidden
                      className="absolute -top-1 right-1.5 min-w-[18px] rounded-full bg-accent px-1 text-center text-[11px] font-bold leading-[18px] text-accent-foreground ring-2 ring-primary"
                    >
                      {badge > 99 ? "99+" : badge}
                    </span>
                  )}
                </span>
                {label}
              </Link>
            </li>
          )
        })}
        <li>
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event(EVENTO_ABRIR_MENU))}
            className="flex min-h-14 w-full flex-col items-center justify-center gap-1 rounded-xl text-xs font-medium text-primary-foreground/75 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <span className="flex h-8 w-14 items-center justify-center rounded-full">
              <Menu className="size-5" />
            </span>
            Más
          </button>
        </li>
      </ul>
    </nav>
  )
}
