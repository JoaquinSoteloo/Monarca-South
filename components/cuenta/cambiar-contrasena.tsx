"use client"

import { useState } from "react"
import { Eye, EyeOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { LARGO_MINIMO, validarNuevaContrasena } from "@/lib/auth/contrasena"

/** Formulario para que cada uno cambie su contraseña (lo valida y lo guarda app/api/auth/password). */
export function CambiarContrasena() {
  const [actual, setActual] = useState("")
  const [nueva, setNueva] = useState("")
  const [repetida, setRepetida] = useState("")
  const [ver, setVer] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null)

  async function cambiar(e: React.FormEvent) {
    e.preventDefault()
    const problema = validarNuevaContrasena(actual, nueva, repetida)
    if (problema) {
      setResultado({ ok: false, texto: problema })
      return
    }
    setGuardando(true)
    setResultado(null)
    try {
      const r = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ actual, nueva }),
      })
      const d = (await r.json().catch(() => ({}))) as { error?: string }
      if (!r.ok) {
        setResultado({ ok: false, texto: d.error ?? "No se pudo cambiar la contraseña. Probá de nuevo." })
        return
      }
      setActual("")
      setNueva("")
      setRepetida("")
      setResultado({ ok: true, texto: "Listo: la próxima vez que entres, usá la contraseña nueva." })
    } catch {
      setResultado({ ok: false, texto: "Sin conexión. Probá de nuevo." })
    } finally {
      setGuardando(false)
    }
  }

  const tipo = ver ? "text" : "password"

  return (
    <form onSubmit={cambiar} className="space-y-4 rounded-2xl border bg-card p-5" noValidate>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Cambiar la contraseña</h2>
        <Button type="button" variant="ghost" className="h-11" onClick={() => setVer((v) => !v)} aria-pressed={ver}>
          {ver ? <EyeOff className="size-4" /> : <Eye className="size-4" />} {ver ? "Ocultar" : "Mostrar"}
        </Button>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="pw-actual">Contraseña actual</Label>
        <Input
          id="pw-actual"
          type={tipo}
          autoComplete="current-password"
          className="h-11 text-base"
          value={actual}
          onChange={(e) => setActual(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="pw-nueva">Contraseña nueva</Label>
        <Input
          id="pw-nueva"
          type={tipo}
          autoComplete="new-password"
          aria-describedby="pw-ayuda"
          className="h-11 text-base"
          value={nueva}
          onChange={(e) => setNueva(e.target.value)}
        />
        <p id="pw-ayuda" className="text-sm text-muted-foreground">
          Al menos {LARGO_MINIMO} caracteres. Que sea solo tuya: no la compartas con el resto del equipo.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="pw-repetida">Repetí la contraseña nueva</Label>
        <Input
          id="pw-repetida"
          type={tipo}
          autoComplete="new-password"
          className="h-11 text-base"
          value={repetida}
          onChange={(e) => setRepetida(e.target.value)}
        />
      </div>

      {resultado && (
        <p
          role={resultado.ok ? "status" : "alert"}
          className={cn("rounded-lg px-4 py-3 text-sm", resultado.ok ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive")}
        >
          {resultado.texto}
        </p>
      )}

      <Button type="submit" className="h-12 w-full text-base sm:w-auto" disabled={guardando}>
        {guardando ? "Cambiando…" : "Cambiar la contraseña"}
      </Button>
    </form>
  )
}
