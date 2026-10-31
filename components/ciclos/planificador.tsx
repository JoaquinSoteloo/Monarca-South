"use client"

import type React from "react"
import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { AlertTriangle } from "lucide-react"
import { DEFAULTS, fechaCorta, fechasCiclo, plantasPara, solapamientos, type CicloSala } from "@/lib/ciclo"

export type BorradorCiclo = Pick<
  CicloSala,
  "fecha_inicio" | "dias_vege" | "dias_flora" | "dias_lavado" | "dias_secado" | "dias_limpieza" | "geneticas" | "plantas" | "m2" | "notas" | "nombre"
>

interface Props {
  salaId: number
  salaNombre: string
  inicial: BorradorCiclo
  /** Otros ciclos abiertos, para avisar si se pisan en la misma sala. */
  otros: CicloSala[]
  guardando: boolean
  onGuardar: (b: BorradorCiclo) => void
  onCancelar: () => void
  esNuevo: boolean
}

export function borradorNuevo(fechaInicio: string, m2: number | null, salaNombre: string): BorradorCiclo {
  return {
    ...DEFAULTS,
    fecha_inicio: fechaInicio,
    geneticas: "",
    plantas: plantasPara(m2),
    m2,
    notas: "",
    nombre: `${salaNombre} · tanda ${fechaInicio.slice(5, 7)}/${fechaInicio.slice(2, 4)}`,
  }
}

/** Planificador de cosecha: se mueve una fecha o una duración y se recalcula todo. */
export function Planificador({ salaId, salaNombre, inicial, otros, guardando, onGuardar, onCancelar, esNuevo }: Props) {
  const [b, setB] = useState<BorradorCiclo>(inicial)
  const f = useMemo(() => fechasCiclo(b), [b])
  const pisa = useMemo(() => {
    const yo = { ...b, id: -1, sala_id: salaId, estado: "abierto" as const }
    return solapamientos([...otros.filter((o) => o.sala_id === salaId), yo]).filter(([x, y]) => x.id === -1 || y.id === -1)
  }, [b, otros, salaId])

  const num = (k: keyof BorradorCiclo) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setB({ ...b, [k]: e.target.value === "" ? null : Number(e.target.value) })

  // Mover la cosecha ajusta los días de flora (lo que hace Lucho al decidir el corte).
  const moverCosecha = (fecha: string) => {
    if (!fecha) return
    const dias = Math.round((Date.parse(fecha) - Date.parse(f.flip)) / 86400000)
    if (dias >= 35 && dias <= 120) setB({ ...b, dias_flora: dias })
  }

  return (
    <div className="space-y-4 rounded-md border p-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label>Entrada a {salaNombre} (18/6)</Label>
          <Input type="date" value={b.fecha_inicio} onChange={(e) => e.target.value && setB({ ...b, fecha_inicio: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label>Días de vege en sala</Label>
          <Input type="number" min={0} max={120} value={b.dias_vege} onChange={num("dias_vege")} />
        </div>
        <div className="space-y-1">
          <Label>Días de flora (12/12)</Label>
          <Input type="number" min={35} max={120} value={b.dias_flora} onChange={num("dias_flora")} />
        </div>
        <div className="space-y-1">
          <Label>O elegí el día de corte</Label>
          <Input type="date" value={f.cosecha} onChange={(e) => moverCosecha(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Días de lavado (solo agua)</Label>
          <Input type="number" min={0} max={21} value={b.dias_lavado} onChange={num("dias_lavado")} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label>Secado</Label>
            <Input type="number" min={1} max={21} value={b.dias_secado} onChange={num("dias_secado")} />
          </div>
          <div className="space-y-1">
            <Label>Limpieza</Label>
            <Input type="number" min={0} max={14} value={b.dias_limpieza} onChange={num("dias_limpieza")} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 rounded-md bg-muted p-3 text-sm sm:grid-cols-5">
        <div><div className="text-xs text-muted-foreground">12/12</div>{fechaCorta(f.flip)}</div>
        <div><div className="text-xs text-muted-foreground">Lavado</div>{fechaCorta(f.lavado)}</div>
        <div><div className="text-xs text-muted-foreground">Corte</div><span className="font-semibold">{fechaCorta(f.cosecha)}</span></div>
        <div><div className="text-xs text-muted-foreground">Fin de secado</div>{fechaCorta(f.finSecado)}</div>
        <div><div className="text-xs text-muted-foreground">Sala libre</div>{fechaCorta(f.libre)}</div>
      </div>

      {pisa.length > 0 && (
        <div className="flex items-center gap-2 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4" /> Se pisa con otro ciclo de {salaNombre}: la sala no está libre en esa fecha.
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1 sm:col-span-2">
          <Label>Genéticas</Label>
          <Input
            placeholder="Ej.: 8 Lemon Cherry Gelato, 7 Gary Payton"
            value={b.geneticas ?? ""}
            onChange={(e) => setB({ ...b, geneticas: e.target.value })}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label>Plantas</Label>
            <Input type="number" min={0} value={b.plantas ?? ""} onChange={num("plantas")} />
          </div>
          <div className="space-y-1">
            <Label>m²</Label>
            <Input type="number" min={1} step="0.5" value={b.m2 ?? ""} onChange={num("m2")} />
          </div>
        </div>
      </div>
      <div className="space-y-1">
        <Label>Notas</Label>
        <Textarea rows={2} value={b.notas ?? ""} onChange={(e) => setB({ ...b, notas: e.target.value })} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={guardando} onClick={() => onGuardar(b)}>
          {guardando ? "Guardando…" : esNuevo ? "Iniciar ciclo" : "Guardar y recalcular tareas"}
        </Button>
        <Button variant="ghost" onClick={onCancelar}>
          Cancelar
        </Button>
        <span className="text-xs text-muted-foreground">
          Las tareas pendientes desde hoy se rearman con las fechas nuevas; las hechas no se tocan.
        </span>
      </div>
    </div>
  )
}
