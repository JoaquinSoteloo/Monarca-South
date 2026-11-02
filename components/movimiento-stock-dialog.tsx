"use client"

/**
 * Sumar lo pesado nuevo a una genética, o pasar gramos entre el stock de
 * sueltos y el de enrolados. Muestra cómo queda el stock antes de confirmar y
 * guarda con movimiento_stock (scripts/068), que deja registro de quién y cuándo.
 *
 * Quien lo usa lo monta sólo mientras está abierto, así cada movimiento
 * arranca con el formulario vacío.
 */
import type React from "react"
import { useState } from "react"
import { ArrowRightLeft, PackageMinus, Plus } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import type { Genetica } from "@/lib/types"
import { formatGramos } from "@/lib/format"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

type Tipo = "ingreso" | "traspaso" | "salida"
type Motivo = "exposicion" | "muestra"
type Destino = "sueltos" | "enrolados"

interface Props {
  genetica: Genetica
  onOpenChange: (open: boolean) => void
  onGuardado: (stock: { gramos_disponibles: number; gramos_enrolados: number }) => void
}

function Opcion({
  activa,
  onClick,
  children,
}: {
  activa: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={activa}
      onClick={onClick}
      className={cn(
        "flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        activa ? "bg-primary text-primary-foreground" : "bg-card text-foreground hover:bg-muted",
      )}
    >
      {children}
    </button>
  )
}

function redondear(n: number) {
  return Math.round(n * 100) / 100
}

function Linea({ label, antes, cambio, final }: { label: string; antes: number; cambio: number; final: number }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums text-right">
        {cambio === 0 ? (
          <strong className="text-foreground">{formatGramos(antes)}</strong>
        ) : (
          <>
            {formatGramos(antes)} {cambio > 0 ? "+" : "−"} {formatGramos(Math.abs(cambio))} ={" "}
            <strong className={final < 0 ? "text-destructive" : "text-foreground"}>{formatGramos(final)}</strong>
          </>
        )}
      </span>
    </div>
  )
}

export function MovimientoStockDialog({ genetica, onOpenChange, onGuardado }: Props) {
  const [tipo, setTipo] = useState<Tipo>("ingreso")
  const [destino, setDestino] = useState<Destino>("sueltos")
  const [motivo, setMotivo] = useState<Motivo>("exposicion")
  const [gramosTexto, setGramosTexto] = useState("")
  const [nota, setNota] = useState("")
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const gramos = Number.parseFloat(gramosTexto) || 0
  const sueltos = Number(genetica.gramos_disponibles)
  const enrolados = Number(genetica.gramos_enrolados)

  // Cuánto cambia cada stock con el movimiento elegido.
  // En una salida, `destino` es el stock del que sale.
  const cambioSueltos =
    tipo === "ingreso"
      ? destino === "sueltos" ? gramos : 0
      : tipo === "salida"
        ? destino === "sueltos" ? -gramos : 0
        : destino === "sueltos" ? gramos : -gramos
  const cambioEnrolados =
    tipo === "ingreso"
      ? destino === "enrolados" ? gramos : 0
      : tipo === "salida"
        ? destino === "enrolados" ? -gramos : 0
        : -cambioSueltos
  const sueltosFinal = redondear(sueltos + cambioSueltos)
  const enroladosFinal = redondear(enrolados + cambioEnrolados)
  const origenInsuficiente = tipo !== "ingreso" && (sueltosFinal < 0 || enroladosFinal < 0)

  const guardar = async () => {
    setError(null)
    if (gramos <= 0) {
      setError("Ingresá los gramos")
      return
    }
    if (origenInsuficiente) {
      const origen = tipo === "salida" ? destino : destino === "enrolados" ? "sueltos" : "enrolados"
      setError(`No alcanza el stock de ${origen}`)
      return
    }
    setGuardando(true)
    const supabase = createClient()
    const { data, error: rpcError } = await supabase.rpc("movimiento_stock", {
      p_genetica_id: genetica.id,
      p_tipo: tipo,
      p_destino: destino,
      p_gramos: gramos,
      p_nota: nota,
      p_motivo: tipo === "salida" ? motivo : null,
    })
    setGuardando(false)
    if (rpcError) {
      setError(/^VS00\d$/.test(rpcError.code || "") ? rpcError.message : "No se pudo guardar el movimiento")
      return
    }
    const mov = Array.isArray(data) ? data[0] : data
    onGuardado({
      gramos_disponibles: Number(mov?.sueltos_despues ?? sueltosFinal),
      gramos_enrolados: Number(mov?.enrolados_despues ?? enroladosFinal),
    })
  }

  return (
    <Dialog open onOpenChange={(o) => !guardando && onOpenChange(o)}>
      <DialogContent className="monarca-theme sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-foreground">Stock de {genetica.nombre}</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Sumá lo que pesaste, pasá gramos entre sueltos y enrolados, o registrá una salida.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex gap-1 rounded-lg border border-border bg-muted/40 p-1">
            <Opcion activa={tipo === "ingreso"} onClick={() => setTipo("ingreso")}>
              <span className="inline-flex items-center gap-1.5">
                <Plus className="h-4 w-4" /> Sumar ingreso
              </span>
            </Opcion>
            <Opcion activa={tipo === "traspaso"} onClick={() => setTipo("traspaso")}>
              <span className="inline-flex items-center gap-1.5">
                <ArrowRightLeft className="h-4 w-4" /> Mover
              </span>
            </Opcion>
            <Opcion activa={tipo === "salida"} onClick={() => setTipo("salida")}>
              <span className="inline-flex items-center gap-1.5">
                <PackageMinus className="h-4 w-4" /> Salida
              </span>
            </Opcion>
          </div>

          {tipo === "salida" && (
            <div className="space-y-1.5">
              <Label>Motivo</Label>
              <div className="flex gap-1 rounded-lg border border-border bg-muted/40 p-1">
                <Opcion activa={motivo === "exposicion"} onClick={() => setMotivo("exposicion")}>
                  Exposición
                </Opcion>
                <Opcion activa={motivo === "muestra"} onClick={() => setMotivo("muestra")}>
                  Muestra
                </Opcion>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>
              {tipo === "ingreso" ? "¿A qué stock va?" : tipo === "salida" ? "¿De qué stock sale?" : "¿Hacia dónde se mueven?"}
            </Label>
            <div className="flex gap-1 rounded-lg border border-border bg-muted/40 p-1">
              <Opcion activa={destino === "sueltos"} onClick={() => setDestino("sueltos")}>
                {tipo === "traspaso" ? "Enrolados → Sueltos" : "Sueltos"}
              </Opcion>
              <Opcion activa={destino === "enrolados"} onClick={() => setDestino("enrolados")}>
                {tipo === "traspaso" ? "Sueltos → Enrolados" : "Enrolados"}
              </Opcion>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="mov-gramos">Gramos</Label>
            <Input
              id="mov-gramos"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={gramosTexto}
              onChange={(e) => setGramosTexto(e.target.value)}
              placeholder="0"
              autoFocus
              className="bg-card"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="mov-nota">Nota (opcional)</Label>
            <Input
              id="mov-nota"
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder={
                tipo === "ingreso"
                  ? "Ej: cosecha del sábado"
                  : tipo === "salida"
                    ? "Ej: expo del sábado, muestra para el laboratorio"
                    : "Ej: cocos chicos para enrolar"
              }
              className="bg-card"
            />
          </div>

          <div className="space-y-1.5 rounded-lg border border-border bg-card p-3 text-sm" aria-live="polite">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Stock final</p>
            <Linea label="Sueltos" antes={sueltos} cambio={cambioSueltos} final={sueltosFinal} />
            <Linea label="Enrolados" antes={enrolados} cambio={cambioEnrolados} final={enroladosFinal} />
            <div className="flex items-baseline justify-between gap-3 border-t border-border pt-1.5">
              <span className="text-muted-foreground">Total</span>
              <strong className="tabular-nums text-foreground">{formatGramos(redondear(sueltosFinal + enroladosFinal))}</strong>
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={guardando} className="bg-card">
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={guardando || gramos <= 0 || origenInsuficiente}>
            {guardando ? "Guardando..." : "Confirmar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
