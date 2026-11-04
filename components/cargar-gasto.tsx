"use client"

/**
 * Anotar un gasto sin ver la lista ni los totales (scripts/092). Sólo inserta:
 * la base no le deja leer gastos a este rol, así que lo que se ve abajo son
 * los gastos anotados en esta pantalla mientras está abierta. Cada gasto le
 * llega como aviso a quien controla (Demian).
 */

import type React from "react"
import { useEffect, useState } from "react"
import { format } from "date-fns"
import { CheckCircle2 } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import type { CategoriaGasto } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DatePicker, fechaATexto, textoAFecha } from "@/components/ui/date-picker"
import { formatCurrency } from "@/lib/format"

const SIN_CLASIFICAR = "Sin clasificar"

interface Anotado {
  descripcion: string
  monto: number
  categoria: string
  fecha: string
}

const VACIO = {
  descripcion: "",
  monto: "",
  categoria: "",
  metodo_pago: "efectivo" as "efectivo" | "transferencia",
  fecha: new Date(),
}

export function CargarGasto() {
  const supabase = createClient()
  const [categorias, setCategorias] = useState<CategoriaGasto[]>([])
  const [form, setForm] = useState(VACIO)
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [anotados, setAnotados] = useState<Anotado[]>([])

  useEffect(() => {
    supabase
      .from("categorias_gasto")
      .select("*")
      .order("orden")
      .order("nombre")
      .then(({ data }) => {
        // Las devoluciones de aportes las carga la comisión: no se ofrecen acá.
        if (data) setCategorias(data.filter((c) => c.nombre !== SIN_CLASIFICAR && c.en_resultado !== "aparte"))
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function anotar(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const monto = Number.parseFloat(form.monto.replace(",", "."))
    if (!form.descripcion.trim() || !(monto > 0)) {
      setError("Completá qué compraste y el monto.")
      return
    }
    if (!form.categoria) {
      setError("Elegí una categoría.")
      return
    }
    setGuardando(true)
    const fecha = format(form.fecha, "yyyy-MM-dd")
    // Sin .select(): este rol no puede leer gastos, sólo anotarlos.
    const { error: dbError } = await supabase.from("gastos").insert([
      {
        descripcion: form.descripcion.trim(),
        monto,
        categoria: form.categoria,
        metodo_pago: form.metodo_pago,
        fecha,
      },
    ])
    setGuardando(false)
    if (dbError) {
      setError(
        dbError.code === "42501"
          ? "Tu usuario no tiene permiso para anotar gastos. Pedíselo a la comisión directiva."
          : "No se pudo anotar el gasto. Probá de nuevo.",
      )
      return
    }
    setAnotados((a) => [{ descripcion: form.descripcion.trim(), monto, categoria: form.categoria, fecha }, ...a])
    setForm({ ...VACIO, fecha: new Date() })
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Anotar un gasto</h1>
        <p className="text-sm text-muted-foreground">
          Anotá cada compra o pago que hagas para Monarca. Le llega un aviso a Demian para que lo controle.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Gasto nuevo</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={anotar} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="descripcion">¿Qué compraste o pagaste?</Label>
              <Textarea
                id="descripcion"
                className="min-h-20 bg-white"
                placeholder="Ej: 2 bolsas de coco, cinta, lavandina..."
                value={form.descripcion}
                onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="monto">Monto ($)</Label>
                <Input
                  id="monto"
                  inputMode="decimal"
                  className="bg-white"
                  placeholder="0"
                  value={form.monto}
                  onChange={(e) => setForm({ ...form, monto: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fecha">Fecha</Label>
                <DatePicker
                  id="fecha"
                  value={fechaATexto(form.fecha)}
                  max={fechaATexto(new Date())}
                  onChange={(texto) => {
                    const fecha = textoAFecha(texto)
                    if (fecha) setForm({ ...form, fecha })
                  }}
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="categoria">Categoría</Label>
                <Select value={form.categoria} onValueChange={(v) => setForm({ ...form, categoria: v })}>
                  <SelectTrigger id="categoria" className="w-full bg-white">
                    <SelectValue placeholder="Elegir" />
                  </SelectTrigger>
                  <SelectContent className="monarca-theme">
                    {categorias.map((c) => (
                      <SelectItem key={c.id} value={c.nombre}>
                        {c.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="metodo">¿Cómo se pagó?</Label>
                <Select
                  value={form.metodo_pago}
                  onValueChange={(v) => setForm({ ...form, metodo_pago: v as "efectivo" | "transferencia" })}
                >
                  <SelectTrigger id="metodo" className="w-full bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="monarca-theme">
                    <SelectItem value="efectivo">Efectivo</SelectItem>
                    <SelectItem value="transferencia">Transferencia</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" className="w-full" disabled={guardando}>
              {guardando ? "Anotando..." : "Anotar gasto"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {anotados.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Anotados recién</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {anotados.map((g, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                <div className="min-w-0 flex-1">
                  <p className="truncate">{g.descripcion}</p>
                  <p className="text-xs text-muted-foreground">
                    {g.categoria} · {g.fecha.split("-").reverse().join("/")}
                  </p>
                </div>
                <span className="font-medium">{formatCurrency(g.monto)}</span>
              </div>
            ))}
            <p className="pt-1 text-xs text-muted-foreground">
              Si te equivocaste en alguno, avisale a Demian: él lo corrige.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
