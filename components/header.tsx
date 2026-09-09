"use client"

import Link from "next/link"
import Image from "next/image"
import {
  ArrowLeft,
  LogOut,
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
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { useRouter, usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

interface HeaderProps {
  title?: string
  showBack?: boolean
}

const navItems = [
  { href: "/", label: "Inicio", icon: Home },
  { href: "/stock", label: "Stock", icon: Package },
  { href: "/socios", label: "Socios", icon: Users },
  { href: "/ventas", label: "Ventas", icon: ShoppingCart },
  { href: "/historial", label: "Historial", icon: History },
  { href: "/deudas", label: "Deudas", icon: AlertCircle },
  { href: "/caja", label: "Caja", icon: DollarSign },
  { href: "/gastos", label: "Gastos", icon: Receipt },
  { href: "/citas", label: "Citas", icon: CalendarClock },
  { href: "/cultivo", label: "Cultivo", icon: Sprout },
  { href: "/sucursales", label: "Sucursales", icon: MapPin },
]

export function Header({ title, showBack = false }: HeaderProps) {
  const router = useRouter()
  const pathname = usePathname()

  const handleLogout = async () => {
    sessionStorage.removeItem("auth-user")
    window.location.href = "/login"
  }

  return (
    <header className="border-b border-emerald-800/30 bg-gradient-to-r from-emerald-950 to-emerald-900">
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            {showBack && (
              <Link href="/">
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-amber-200/70 hover:text-amber-200 hover:bg-emerald-800/50"
                >
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
            )}
            <Link href="/" className="flex items-center gap-3">
              <Image src="/logo-monarca.png" alt="Monarca South" width={48} height={48} className="rounded-full" />
              <div className="flex flex-col">
                <span className="text-xl font-bold text-amber-200 tracking-wide">Monarca South</span>
                <span className="text-xs text-amber-200/60 tracking-widest uppercase">{title || "Gestión"}</span>
              </div>
            </Link>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="text-amber-200/70 hover:text-amber-200 hover:bg-emerald-800/50"
          >
            <LogOut className="h-4 w-4 mr-2" />
            Cerrar Sesión
          </Button>
        </div>
      </div>

      <nav className="border-t border-emerald-800/30 bg-emerald-950/40">
        <div className="container mx-auto px-4">
          <ul className="flex items-center gap-1 overflow-x-auto py-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            {navItems.map(({ href, label, icon: Icon }) => {
              const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href)
              return (
                <li key={href} className="shrink-0">
                  <Link
                    href={href}
                    className={cn(
                      "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
                      isActive
                        ? "bg-amber-200 text-emerald-950"
                        : "text-amber-200/70 hover:text-amber-200 hover:bg-emerald-800/50",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      </nav>
    </header>
  )
}
