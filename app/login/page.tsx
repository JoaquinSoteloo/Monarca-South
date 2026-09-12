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
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Error al iniciar sesión")
      }

      if (data.success) {
        window.location.href = "/"
      }
    } catch (error: unknown) {
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
                Ingresá tu email y contraseña para acceder
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleLogin}>
                <div className="flex flex-col gap-6">
                  <div className="grid gap-2">
                    <Label htmlFor="email" className="text-amber-200/90">
                      Email
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="admin@monarca.com"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="bg-emerald-950/50 border-emerald-800/50 text-amber-200"
                      autoComplete="email"
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
