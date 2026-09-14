"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { CalendarIcon, Receipt, AlertTriangle, Info } from "lucide-react"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { cn } from "@/lib/utils"
import { formatCurrency } from "@/lib/format"

interface ResumenCaja {
  ventasEfectivo: number
  ventasTransferencia: number
  totalVentas: number
  gastosEfectivo: number
  gastosTransferencia: number
  totalGastos: number
  gananciaNeta: number
  efectivoNeto: number
  transferenciaNeto: number
}

// Estilo según signo, usado tanto en el bloque de Resultado como en la fila
// de Balance de la tabla: verde bosque si es positivo, cálido/ámbar si es
// negativo (con indicación explícita, no sólo color), neutro si es cero.
function getResultadoEstilo(valor: number) {
  if (valor > 0) {
    return {
      texto: "positivo",
      claseTexto: "text-primary",
      claseBloque: "border-primary bg-primary text-primary-foreground",
      claseSubtexto: "text-primary-foreground/70",
    }
  }
  if (valor < 0) {
    return {
      texto: "negativo",
      claseTexto: "text-amber-800",
      claseBloque: "border-amber-200 bg-amber-50 text-amber-900",
      claseSubtexto: "text-amber-800/70",
    }
  }
  return {
    texto: "neutral",
    claseTexto: "text-foreground",
    claseBloque: "border-border bg-card text-foreground",
    claseSubtexto: "text-muted-foreground",
  }
}

export function Caja() {
  const [fechaDesde, setFechaDesde] = useState<Date>(new Date())
  const [fechaHasta, setFechaHasta] = useState<Date>(new Date())
  const [resumen, setResumen] = useState<ResumenCaja | null>(null)
  // Período efectivamente calculado, independiente de lo que haya en los
  // selectores: si el usuario cambia las fechas sin apretar "Calcular
  // resumen", los resultados y esta etiqueta siguen mostrando el rango
  // anterior — nunca se etiquetan los resultados viejos con fechas nuevas.
  const [resumenPeriodo, setResumenPeriodo] = useState<{ desde: Date; hasta: Date } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const supabase = createClient()

  async function calcularResumen() {
    setLoading(true)
    setError(null)

    const desdeCalculo = fechaDesde
    const hastaCalculo = fechaHasta
    const desde = format(desdeCalculo, "yyyy-MM-dd")
    const hasta = format(hastaCalculo, "yyyy-MM-dd")

    const [ventasResult, gastosResult] = await Promise.all([
      supabase
        .from("ventas")
        .select("total, metodo_pago, created_at")
        .gte("created_at", desde)
        .lte("created_at", `${hasta}T23:59:59`),
      supabase.from("gastos").select("monto, metodo_pago, fecha").gte("fecha", desde).lte("fecha", hasta),
    ])

    // Una consulta fallida no es un período sin movimientos: no debe
    // mostrarse como un resumen válido en cero.
    if (ventasResult.error || gastosResult.error) {
      console.error("Error al calcular el resumen de caja:", ventasResult.error || gastosResult.error)
      setError("No se pudo calcular el resumen. Probá de nuevo.")
      setLoading(false)
      return
    }

    const ventas = ventasResult.data
    const gastos = gastosResult.data

    const ventasEfectivo =
      ventas?.filter((v) => v.metodo_pago === "efectivo").reduce((sum, v) => sum + Number(v.total), 0) || 0
    const ventasTransferencia =
      ventas?.filter((v) => v.metodo_pago === "transferencia").reduce((sum, v) => sum + Number(v.total), 0) || 0
    const totalVentas = ventasEfectivo + ventasTransferencia

    const gastosEfectivo =
      gastos?.filter((g) => g.metodo_pago === "efectivo").reduce((sum, g) => sum + Number(g.monto), 0) || 0
    const gastosTransferencia =
      gastos?.filter((g) => g.metodo_pago === "transferencia").reduce((sum, g) => sum + Number(g.monto), 0) || 0
    const totalGastos = gastosEfectivo + gastosTransferencia

    const gananciaNeta = totalVentas - totalGastos
    const efectivoNeto = ventasEfectivo - gastosEfectivo
    const transferenciaNeto = ventasTransferencia - gastosTransferencia

    setResumen({
      ventasEfectivo,
      ventasTransferencia,
      totalVentas,
      gastosEfectivo,
      gastosTransferencia,
      totalGastos,
      gananciaNeta,
      efectivoNeto,
      transferenciaNeto,
    })
    setResumenPeriodo({ desde: desdeCalculo, hasta: hastaCalculo })

    setLoading(false)
  }

  useEffect(() => {
    calcularResumen()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fechasSinRecalcular =
    resumenPeriodo !== null &&
    (fechaDesde.toDateString() !== resumenPeriodo.desde.toDateString() ||
      fechaHasta.toDateString() !== resumenPeriodo.hasta.toDateString())

  const resultadoEstilo = resumen ? getResultadoEstilo(resumen.gananciaNeta) : null

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[26px] font-semibold leading-tight text-foreground">Caja</h1>
        <p className="text-sm text-muted-foreground">Resumen del período</p>
      </div>

      {/* Filtros compactos */}
      <Card className="bg-card border-border py-4">
        <CardContent>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="caja-fecha-desde" className="text-sm font-medium text-foreground">Desde</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button id="caja-fecha-desde" variant="outline" className="w-full justify-start bg-card text-left font-normal sm:w-[180px]">
                    <CalendarIcon className="mr-2 h-4 w-4 text-primary" />
                    {format(fechaDesde, "dd/MM/yyyy")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="monarca-theme w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={fechaDesde}
                    onSelect={(date) => date && setFechaDesde(date)}
                    locale={es}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="caja-fecha-hasta" className="text-sm font-medium text-foreground">Hasta</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button id="caja-fecha-hasta" variant="outline" className="w-full justify-start bg-card text-left font-normal sm:w-[180px]">
                    <CalendarIcon className="mr-2 h-4 w-4 text-primary" />
                    {format(fechaHasta, "dd/MM/yyyy")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="monarca-theme w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={fechaHasta}
                    onSelect={(date) => date && setFechaHasta(date)}
                    locale={es}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <Button onClick={calcularResumen} disabled={loading} className="w-full sm:w-auto">
              {loading ? "Calculando..." : "Calcular resumen"}
            </Button>
          </div>

          {fechasSinRecalcular && (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-amber-700">
              <Info className="h-3.5 w-3.5 shrink-0" />
              Cambiaste las fechas — presioná &quot;Calcular resumen&quot; para ver el resultado de este nuevo rango.
            </p>
          )}
        </CardContent>
      </Card>

      {error && (
        <p className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </p>
      )}

      {loading && !resumen && !error && <p className="text-sm text-muted-foreground">Calculando resumen...</p>}

      {resumen && resumenPeriodo && resultadoEstilo && (
        <>
          <section className="min-w-0 space-y-3" aria-label="Resumen del período calculado">
            <p className="text-sm text-muted-foreground">
              Período: {format(resumenPeriodo.desde, "dd/MM/yyyy")} – {format(resumenPeriodo.hasta, "dd/MM/yyyy")}
            </p>

            <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
              <Card className={cn("min-w-0 gap-4 shadow-sm lg:min-h-[180px]", resultadoEstilo.claseBloque)}>
                <CardHeader className="px-5">
                  <CardTitle className={cn("text-sm font-medium leading-5", resultadoEstilo.claseSubtexto)}>
                    Resultado del período
                    {resumen.gananciaNeta < 0 && " (negativo)"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-5">
                  <div className="break-words text-2xl font-bold leading-9 tabular-nums xl:text-3xl">
                    {formatCurrency(resumen.gananciaNeta)}
                  </div>
                  <p className={cn("mt-1 text-xs", resultadoEstilo.claseSubtexto)}>
                    Ventas menos gastos registrados
                  </p>
                </CardContent>
              </Card>

              <Card className="min-w-0 gap-4 border-border bg-card shadow-sm lg:min-h-[180px]">
                <CardHeader className="px-5">
                  <CardTitle className="text-sm font-medium leading-5 text-muted-foreground">Total ventas</CardTitle>
                </CardHeader>
                <CardContent className="px-5">
                  <div className="break-words text-2xl font-bold leading-9 text-foreground tabular-nums">
                    {formatCurrency(resumen.totalVentas)}
                  </div>
                </CardContent>
              </Card>

              <Card className="min-w-0 gap-4 border-border bg-card shadow-sm lg:min-h-[180px]">
                <CardHeader className="px-5">
                  <CardTitle className="text-sm font-medium leading-5 text-muted-foreground">Total gastos</CardTitle>
                </CardHeader>
                <CardContent className="px-5">
                  <div className="break-words text-2xl font-bold leading-9 text-foreground tabular-nums">
                    {formatCurrency(resumen.totalGastos)}
                  </div>
                </CardContent>
              </Card>
            </div>
            <p className="text-xs text-muted-foreground">
              El resultado no representa cobros ni deudas pendientes.
            </p>
          </section>

          {/* Desglose por medio de pago */}
          <Card className="bg-card border-border gap-3">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-foreground">
                <Receipt className="h-5 w-5 text-primary" />
                Desglose por medio de pago
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border border-border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-primary/10 hover:bg-primary/10">
                      <TableHead className="text-foreground">Concepto</TableHead>
                      <TableHead className="text-right text-foreground">Efectivo</TableHead>
                      <TableHead className="text-right text-foreground">Transferencia</TableHead>
                      <TableHead className="text-right text-foreground">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow className="hover:bg-muted/40">
                      <TableCell className="font-medium text-foreground">Ingresos (ventas)</TableCell>
                      <TableCell className="text-right text-foreground tabular-nums">
                        {formatCurrency(resumen.ventasEfectivo)}
                      </TableCell>
                      <TableCell className="text-right text-foreground tabular-nums">
                        {formatCurrency(resumen.ventasTransferencia)}
                      </TableCell>
                      <TableCell className="text-right font-medium text-foreground tabular-nums">
                        {formatCurrency(resumen.totalVentas)}
                      </TableCell>
                    </TableRow>
                    <TableRow className="hover:bg-muted/40">
                      <TableCell className="font-medium text-foreground">Egresos (gastos)</TableCell>
                      <TableCell className="text-right text-foreground tabular-nums">
                        {formatCurrency(resumen.gastosEfectivo)}
                      </TableCell>
                      <TableCell className="text-right text-foreground tabular-nums">
                        {formatCurrency(resumen.gastosTransferencia)}
                      </TableCell>
                      <TableCell className="text-right font-medium text-foreground tabular-nums">
                        {formatCurrency(resumen.totalGastos)}
                      </TableCell>
                    </TableRow>
                    <TableRow className="bg-primary/5 hover:bg-primary/5">
                      <TableCell className="font-bold text-foreground">Balance</TableCell>
                      <TableCell
                        className={cn(
                          "text-right font-bold tabular-nums",
                          getResultadoEstilo(resumen.efectivoNeto).claseTexto,
                        )}
                      >
                        {formatCurrency(resumen.efectivoNeto)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right font-bold tabular-nums",
                          getResultadoEstilo(resumen.transferenciaNeto).claseTexto,
                        )}
                      >
                        {formatCurrency(resumen.transferenciaNeto)}
                      </TableCell>
                      <TableCell className={cn("text-right font-bold tabular-nums", resultadoEstilo.claseTexto)}>
                        {formatCurrency(resumen.gananciaNeta)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
