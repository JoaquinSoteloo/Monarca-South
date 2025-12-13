"use client"

import type React from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { useState } from "react"

export default function LoginPage() {
  const [usuario, setUsuario] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    console.log("[v0] Attempting login with user:", usuario)

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuario, password }),
      })

      console.log("[v0] Response status:", response.status)
      const data = await response.json()
      console.log("[v0] Response data:", data)

      if (!response.ok) {
        throw new Error(data.error || "Error al iniciar sesión")
      }

      if (data.success) {
        sessionStorage.setItem("auth-user", JSON.stringify(data.user))
        console.log("[v0] Session saved, redirecting to home")
        window.location.href = "/"
      }
    } catch (error: unknown) {
      console.log("[v0] Login error:", error)
      setError(error instanceof Error ? error.message : "Error al iniciar sesión")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen w-full items-center justify-center p-6 bg-gradient-to-br from-emerald-950 via-emerald-900 to-emerald-950">
      <div className="w-full max-w-sm">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col items-center gap-4">
            <Image src="/logo-monarca.png" alt="Monarca South" width={80} height={80} className="rounded-full" />
            <div className="text-center">
              <h1 className="text-2xl font-bold text-amber-200">Monarca South</h1>
              <p className="text-sm text-amber-200/60">Sistema de Gestión</p>
            </div>
          </div>
          <Card className="bg-emerald-900/50 border-emerald-800/50">
            <CardHeader>
              <CardTitle className="text-2xl text-amber-200">Iniciar Sesión</CardTitle>
              <CardDescription className="text-amber-200/60">
                Ingresá tu usuario y contraseña para acceder
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleLogin}>
                <div className="flex flex-col gap-6">
                  <div className="grid gap-2">
                    <Label htmlFor="usuario" className="text-amber-200/90">
                      Usuario
                    </Label>
                    <Input
                      id="usuario"
                      type="text"
                      placeholder="admin"
                      required
                      value={usuario}
                      onChange={(e) => setUsuario(e.target.value)}
                      className="bg-emerald-950/50 border-emerald-800/50 text-amber-200"
                      autoComplete="username"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="password" className="text-amber-200/90">
                      Contraseña
                    </Label>
                    <Input
                      id="password"
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="bg-emerald-950/50 border-emerald-800/50 text-amber-200"
                      autoComplete="current-password"
                    />
                  </div>
                  {error && <p className="text-sm text-red-400">{error}</p>}
                  <Button
                    type="submit"
                    className="w-full bg-amber-600 hover:bg-amber-700 text-emerald-950"
                    disabled={isLoading}
                  >
                    {isLoading ? "Ingresando..." : "Ingresar"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
