"use client"

import type React from "react"

import { useEffect, useState } from "react"
import { useRouter, usePathname } from "next/navigation"

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [isChecking, setIsChecking] = useState(true)

  useEffect(() => {
    const checkAuth = () => {
      const authUser = sessionStorage.getItem("auth-user")
      
      // Rutas públicas que no requieren autenticación
      const rutasPublicas = ["/login", "/reservar"]
      const esRutaPublica = rutasPublicas.includes(pathname)

      // Si no está autenticado y no está en ruta pública, redirigir
      if (!authUser && !esRutaPublica) {
        router.push("/login")
        return
      }

      // Si está autenticado y está en login, redirigir a home
      if (authUser && pathname === "/login") {
        router.push("/")
        return
      }

      setIsChecking(false)
    }

    checkAuth()
  }, [pathname, router])

  if (isChecking) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-lg">Cargando...</div>
      </div>
    )
  }

  return <>{children}</>
}
