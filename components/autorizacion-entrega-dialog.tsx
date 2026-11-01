"use client"

/**
 * Diálogo que aparece cuando una entrega no cumple las reglas (error VB001 de
 * registrar_entrega/editar_entrega, scripts/066). Muestra los motivos y deja
 * pedir una excepción: la autoriza alguien de la comisión directiva, con su
 * propio usuario, y queda registrada con su nombre y el motivo.
 *
 * Quien lo usa lo monta sólo mientras está abierto, así cada pedido arranca
 * con el formulario vacío.
 */
import { useState } from "react"
import { ShieldAlert } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import type { RolUsuario } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export interface UsuarioActual {
  nombre: string
  rol: RolUsuario
}

/** Separa el MESSAGE de VB001 ("motivo · motivo") en una lista. */
export function motivosDeError(mensaje: string): string[] {
  return mensaje
    .split(" · ")
    .map((m) => m.trim())
    .filter(Boolean)
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  socioId: string
  motivos: string[]
  usuarioActual: UsuarioActual
  /** Se llama con el id de la autorización; quien lo usa reintenta la entrega. */
  onAutorizado: (autorizacionId: string) => Promise<void> | void
}

export function AutorizacionEntregaDialog({ open, onOpenChange, socioId, motivos, usuarioActual, onAutorizado }: Props) {
  const esComision = usuarioActual.rol === "comision"
  const [autorizaOtro, setAutorizaOtro] = useState(!esComision)
  const [motivo, setMotivo] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const autorizar = async () => {
    setError(null)
    if (motivo.trim().length < 3) {
      setError("Escribí el motivo de la excepción")
      return
    }
    setEnviando(true)
    try {
      let autorizacionId: string
      if (autorizaOtro) {
        const response = await fetch("/api/autorizaciones", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, socio_id: socioId, motivo }),
        })
        const data = await response.json().catch(() => ({}))
        if (!response.ok) {
          setError(data.error || "No se pudo autorizar")
          return
        }
        autorizacionId = data.id
      } else {
        const supabase = createClient()
        const { data, error: rpcError } = await supabase.rpc("crear_autorizacion_entrega", {
          p_socio_id: socioId,
          p_motivo: motivo,
        })
        if (rpcError) {
          setError(/^VB00\d$/.test(rpcError.code || "") ? rpcError.message : "No se pudo autorizar")
          return
        }
        autorizacionId = data.id
      }
      setPassword("")
      await onAutorizado(autorizacionId)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !enviando && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-amber-100">
              <ShieldAlert className="h-6 w-6 text-amber-600" />
            </div>
            <div>
              <DialogTitle className="text-foreground">No se puede guardar la entrega</DialogTitle>
              <DialogDescription className="text-muted-foreground">
                Sólo con autorización de la comisión directiva.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <ul className="space-y-1.5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {motivos.map((m) => (
            <li key={m}>• {m}</li>
          ))}
        </ul>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="motivo-excepcion">Motivo de la excepción</Label>
            <Textarea
              id="motivo-excepcion"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej: tratamiento indicado por el médico, se regulariza la semana que viene..."
              rows={2}
            />
          </div>

          {autorizaOtro ? (
            <div className="space-y-3 rounded-lg border border-border p-3">
              <p className="text-sm text-muted-foreground">Autoriza alguien de la comisión con su usuario:</p>
              <div className="space-y-1.5">
                <Label htmlFor="email-comision">Email</Label>
                <Input
                  id="email-comision"
                  type="email"
                  autoComplete="off"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password-comision">Contraseña</Label>
                <Input
                  id="password-comision"
                  type="password"
                  autoComplete="off"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              {esComision && (
                <button type="button" className="text-sm text-primary underline" onClick={() => setAutorizaOtro(false)}>
                  Autorizo yo ({usuarioActual.nombre})
                </button>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Autoriza: <strong className="text-foreground">{usuarioActual.nombre}</strong> (comisión).{" "}
              <button type="button" className="text-primary underline" onClick={() => setAutorizaOtro(true)}>
                Autoriza otra persona
              </button>
            </p>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={enviando} className="bg-card">
            Cancelar
          </Button>
          <Button onClick={autorizar} disabled={enviando}>
            {enviando ? "Autorizando..." : "Autorizar y registrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
