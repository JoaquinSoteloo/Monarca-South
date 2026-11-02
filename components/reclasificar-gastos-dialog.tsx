"use client"

/**
 * Reclasificar gastos uno por uno: muestra un gasto por vez con las
 * categorías como botones. Tocar una guarda y pasa al siguiente. Para
 * "Devolución de aportes" pide además a qué aporte corresponde (scripts/070).
 *
 * La lista se arma al abrir y no cambia mientras está abierta, así se puede
 * volver atrás y corregir un gasto que ya se reclasificó.
 */
import { useState } from "react"
import { createClient } from "@/lib/supabase/client"
import type { AporteCapital, CategoriaGasto, Gasto } from "@/lib/types"
import { formatMoneda } from "@/lib/format"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ArrowLeft, ArrowRight, Check, FolderKanban, PartyPopper } from "lucide-react"
import { format } from "date-fns"
import { es } from "date-fns/locale"

interface Props {
  gastos: Gasto[]
  categorias: CategoriaGasto[]
  aportes: AporteCapital[]
  onClose: (huboCambios: boolean) => void
}

export function ReclasificarGastosDialog({ gastos, categorias, aportes, onClose }: Props) {
  const supabase = createClient()
  const [indice, setIndice] = useState(0)
  // Categoría elegida en esta ventana para cada gasto (id -> categoría).
  const [hechos, setHechos] = useState<Record<string, string>>({})
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [eligiendoAporte, setEligiendoAporte] = useState<string | null>(null)

  const total = gastos.length
  const cantidadHechos = Object.keys(hechos).length
  const terminado = indice >= total
  const gasto = gastos[indice]
  const aportesConSaldo = aportes.filter((a) => Number(a.saldo) > 0)

  function irA(i: number) {
    setError(null)
    setEligiendoAporte(null)
    setIndice(Math.max(0, Math.min(total, i)))
  }

  // Siguiente gasto sin reclasificar; si no queda ninguno, la pantalla final.
  function siguientePendiente(desde: number, hechosActuales: Record<string, string>) {
    for (let i = desde + 1; i < total; i++) if (!hechosActuales[gastos[i].id]) return i
    for (let i = 0; i < desde; i++) if (!hechosActuales[gastos[i].id]) return i
    return total
  }

  async function guardar(categoria: CategoriaGasto, aporteId: string | null = null) {
    if (!gasto) return
    if (categoria.en_resultado === "aparte" && !aporteId) {
      setEligiendoAporte(categoria.nombre)
      return
    }
    setError(null)
    setGuardando(true)
    const { error: dbError } = await supabase
      .from("gastos")
      .update({ categoria: categoria.nombre, aporte_id: aporteId })
      .eq("id", gasto.id)
    setGuardando(false)
    if (dbError) {
      setError(/^GA00\d$/.test(dbError.code || "") ? dbError.message : "No se pudo guardar. Probá de nuevo.")
      return
    }
    const nuevos = { ...hechos, [gasto.id]: categoria.nombre }
    setHechos(nuevos)
    setEligiendoAporte(null)
    setIndice(siguientePendiente(indice, nuevos))
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !guardando && onClose(cantidadHechos > 0)}>
      <DialogContent className="monarca-theme bg-white sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Reclasificar gastos</DialogTitle>
          <DialogDescription>
            {terminado
              ? `${cantidadHechos} de ${total} reclasificados`
              : `Gasto ${indice + 1} de ${total} · ${cantidadHechos} reclasificados`}
          </DialogDescription>
        </DialogHeader>

        <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-primary/10">
          <div
            className="h-full rounded-full bg-primary transition-[width]"
            style={{ width: `${total > 0 ? (cantidadHechos / total) * 100 : 0}%` }}
          />
        </div>

        {terminado ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <PartyPopper className="h-10 w-10 text-primary" />
            <p className="font-medium text-foreground">
              {cantidadHechos === total
                ? "¡Listo! No quedan gastos sin clasificar."
                : `Quedan ${total - cantidadHechos} sin clasificar que salteaste.`}
            </p>
            <div className="flex gap-2">
              {cantidadHechos < total && (
                <Button variant="outline" onClick={() => irA(siguientePendiente(-1, hechos))}>
                  Volver a los salteados
                </Button>
              )}
              <Button onClick={() => onClose(cantidadHechos > 0)}>Cerrar</Button>
            </div>
          </div>
        ) : (
          gasto && (
            <div className="space-y-4">
              <div className="rounded-lg border bg-primary/5 p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 break-words text-lg font-semibold text-foreground">{gasto.descripcion}</p>
                  <p className="shrink-0 text-lg font-semibold tabular-nums">
                    {formatMoneda(Number(gasto.monto), gasto.moneda)}
                  </p>
                </div>
                <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
                  {format(new Date(gasto.fecha + "T00:00:00"), "d 'de' MMMM yyyy", { locale: es })} ·{" "}
                  {gasto.metodo_pago === "efectivo" ? "Efectivo" : "Transferencia"}
                  {gasto.proyecto && (
                    <span className="inline-flex items-center gap-1">
                      · <FolderKanban className="h-3.5 w-3.5" /> {gasto.proyecto}
                    </span>
                  )}
                </p>
                {hechos[gasto.id] && (
                  <p className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-primary">
                    <Check className="h-4 w-4" /> Pasó a {hechos[gasto.id]}. Tocá otra categoría para cambiarlo.
                  </p>
                )}
              </div>

              {eligiendoAporte ? (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">¿A qué aporte corresponde la devolución?</p>
                  {aportesConSaldo.length === 0 ? (
                    <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
                      No hay aportes con saldo. La comisión los carga en Aportes de capital.
                    </p>
                  ) : (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {aportesConSaldo.map((a) => (
                        <Button
                          key={a.id}
                          variant="outline"
                          disabled={guardando}
                          className="h-auto justify-between whitespace-normal bg-white py-2 text-left"
                          onClick={() => {
                            const cat = categorias.find((c) => c.nombre === eligiendoAporte)
                            if (cat) guardar(cat, a.id)
                          }}
                        >
                          <span className="font-medium">{a.aportante}</span>
                          <span className="text-xs text-muted-foreground">
                            saldo {formatMoneda(Number(a.saldo), a.moneda)}
                          </span>
                        </Button>
                      ))}
                    </div>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => setEligiendoAporte(null)}>
                    ← Elegir otra categoría
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {categorias.map((cat) => (
                    <Button
                      key={cat.id}
                      variant="outline"
                      disabled={guardando}
                      title={cat.descripcion ?? undefined}
                      onClick={() => guardar(cat)}
                      className={cn(
                        "h-auto min-h-11 whitespace-normal bg-white px-3 py-2 text-sm leading-tight",
                        hechos[gasto.id] === cat.nombre && "border-primary bg-primary text-primary-foreground hover:bg-primary/90",
                      )}
                    >
                      {cat.nombre}
                    </Button>
                  ))}
                </div>
              )}

              {error && <p className="text-sm text-destructive">{error}</p>}

              <div className="flex items-center justify-between gap-2 border-t pt-3">
                <Button variant="ghost" onClick={() => irA(indice - 1)} disabled={indice === 0 || guardando}>
                  <ArrowLeft className="mr-1.5 h-4 w-4" /> Anterior
                </Button>
                <Button variant="ghost" onClick={() => irA(indice + 1)} disabled={guardando}>
                  {hechos[gasto.id] ? "Siguiente" : "Saltear"} <ArrowRight className="ml-1.5 h-4 w-4" />
                </Button>
              </div>
            </div>
          )
        )}
      </DialogContent>
    </Dialog>
  )
}
