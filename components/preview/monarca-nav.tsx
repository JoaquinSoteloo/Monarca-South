"use client"

import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import {
  Home,
  Package,
  Users,
  MapPin,
  ShoppingCart,
  History,
  Receipt,
  DollarSign,
  AlertCircle,
  CalendarClock,
  Sprout,
  Thermometer,
  Zap,
  Sliders,
  DoorClosed,
  Menu,
  X,
  LogOut,
} from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Mismas rutas/íconos que components/header.tsx (no se tocan permisos ni
 * navegación real). Sólo Inicio y Ventas apuntan a las páginas de esta
 * propuesta visual; el resto sigue yendo a las pantallas operativas
 * actuales, sin rediseñar todavía.
 */
const navGroups = [
  {
    label: "Principal",
    items: [
      { href: "/preview/monarca", label: "Inicio", icon: Home },
      { href: "/preview/monarca/ventas", label: "Ventas", icon: ShoppingCart },
      { href: "/historial", label: "Historial", icon: History },
    ],
  },
  {
    label: "Operación",
    items: [
      { href: "/stock", label: "Stock", icon: Package },
      { href: "/cultivo", label: "Cultivo", icon: Sprout },
      { href: "/monitoreo", label: "Monitoreo", icon: Thermometer },
      { href: "/citas", label: "Citas", icon: CalendarClock },
    ],
  },
  {
    label: "Personas",
    items: [
      { href: "/socios", label: "Socios", icon: Users },
      { href: "/sucursales", label: "Sucursales", icon: MapPin },
    ],
  },
  {
    label: "Finanzas",
    items: [
      { href: "/caja", label: "Caja", icon: DollarSign },
      { href: "/gastos", label: "Gastos", icon: Receipt },
      { href: "/deudas", label: "Deudas", icon: AlertCircle },
    ],
  },
  {
    label: "Sistema",
    items: [
      { href: "/automatizaciones", label: "Automatizaciones", icon: Zap },
      { href: "/control-manual", label: "Control manual", icon: Sliders },
      { href: "/modo-ausente", label: "Modo Ausente", icon: DoorClosed },
    ],
  },
]

function isActive(pathname: string, href: string) {
  if (href === "/preview/monarca") return pathname === "/preview/monarca"
  return pathname === href || pathname.startsWith(`${href}/`)
}

function Brand({ variant }: { variant: "sidebar" | "topbar" }) {
  const onDark = variant === "sidebar"
  return (
    <Link href="/preview/monarca" className="flex items-center gap-3 px-1">
      <Image
        src="/logo-monarca.png"
        alt="Monarca South"
        width={36}
        height={36}
        className={cn("rounded-full ring-2", onDark ? "ring-accent/70" : "ring-accent/40")}
      />
      <div className="flex flex-col leading-tight">
        <span className={cn("text-sm font-semibold", onDark ? "text-primary-foreground" : "text-foreground")}>
          Monarca South
        </span>
        <span
          className={cn(
            "text-[11px] uppercase tracking-wide",
            onDark ? "text-primary-foreground/60" : "text-muted-foreground",
          )}
        >
          Vista previa
        </span>
      </div>
    </Link>
  )
}

function NavLinks({
  pathname,
  variant,
  onNavigate,
}: {
  pathname: string
  variant: "sidebar" | "topbar"
  onNavigate?: () => void
}) {
  const onDark = variant === "sidebar"
  return (
    <nav className="flex flex-col gap-5">
      {navGroups.map((group) => (
        <div key={group.label} className="flex flex-col gap-1">
          <span
            className={cn(
              "px-3 text-[11px] font-semibold uppercase tracking-wider",
              onDark ? "text-primary-foreground/50" : "text-muted-foreground/80",
            )}
          >
            {group.label}
          </span>
          {group.items.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href)
            return (
              <Link
                key={href}
                href={href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg border-l-2 px-2.5 py-2 text-sm font-medium transition-colors focus-visible:outline-none",
                  onDark
                    ? cn(
                        "focus-visible:ring-2 focus-visible:ring-accent",
                        active
                          ? "border-accent bg-white/12 text-white"
                          : "border-transparent text-primary-foreground/75 hover:bg-white/8 hover:text-white",
                      )
                    : cn(
                        "focus-visible:ring-2 focus-visible:ring-ring",
                        active
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-transparent text-foreground/80 hover:bg-muted hover:text-foreground",
                      ),
                )}
              >
                <Icon className={cn("h-4 w-4 shrink-0", onDark && active && "text-accent")} />
                {label}
              </Link>
            )
          })}
        </div>
      ))}
    </nav>
  )
}

export function MonarcaSidebar() {
  const pathname = usePathname()
  return (
    <aside className="hidden w-64 shrink-0 bg-primary px-4 py-5 lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:gap-5">
      <div className="shrink-0">
        <Brand variant="sidebar" />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pr-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <NavLinks pathname={pathname} variant="sidebar" />
      </div>
      <Link
        href="/login"
        className="flex shrink-0 items-center gap-2.5 rounded-lg border-l-2 border-transparent px-2.5 py-2 text-sm font-medium text-primary-foreground/70 transition-colors hover:bg-white/8 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <LogOut className="h-4 w-4" />
        Cerrar sesión
      </Link>
    </aside>
  )
}

export function MonarcaMobileNav({ title }: { title: string }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [open])

  useEffect(() => {
    if (open) panelRef.current?.querySelector<HTMLElement>("a, button")?.focus()
  }, [open])

  return (
    <div className="border-b border-border bg-card lg:hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <Brand variant="topbar" />
        <button
          ref={buttonRef}
          type="button"
          aria-expanded={open}
          aria-controls="monarca-mobile-nav-panel"
          aria-label={open ? "Cerrar menú" : "Abrir menú"}
          onClick={() => setOpen((v) => !v)}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>
      <p className="px-4 pb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>

      {open && (
        <div
          id="monarca-mobile-nav-panel"
          ref={panelRef}
          role="dialog"
          aria-label="Menú de navegación"
          className="max-h-[70vh] overflow-y-auto border-t border-border bg-card px-4 py-4"
        >
          <NavLinks pathname={pathname} variant="topbar" onNavigate={() => setOpen(false)} />
          <Link
            href="/login"
            onClick={() => setOpen(false)}
            className="mt-4 flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
            Cerrar sesión
          </Link>
        </div>
      )}
    </div>
  )
}
