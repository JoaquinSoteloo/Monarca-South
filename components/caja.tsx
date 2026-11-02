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
import { formatCurrency, formatMoneda } from "@/lib/format"

interface ResumenCaja {
  ventasEfectivo: number
  ventasTransferencia: number
  totalVentas: number
  // Egresos de caja sin la devolución de aportes (incluye equipamiento).
  gastosEfectivo: number
  gastosTransferencia: number
  totalGastos: number
  // Desglose según cómo cuenta cada categoría (scripts/069).
  gastosResultado: number
  inversion: number
  devolucionEfectivo: number
  devolucionTransferencia: number
  devolucion: number
  devolucionDolares: number
  // Retribuciones pagadas en producto: cuentan en el resultado, no en la caja.
  pagadoEnProducto: number
  // Aportes menos los gastos que cuentan en el resultado.
  gananciaNeta: number
  // Movimiento real de caja: todo lo que entró menos todo lo que salió.
  efectivoNeto: number
  transferenciaNeto: number
  cajaNeta: number
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

    const [ventasResult, gastosResult, categoriasResult] = await Promise.all([
      supabase
        .from("ventas")
        .select("total, metodo_pago, created_at")
        .gte("created_at", desde)
        .lte("created_at", `${hasta}T23:59:59`),
      supabase.from("gastos").select("monto, metodo_pago, fecha, categoria, moneda").gte("fecha", desde).lte("fecha", hasta),
      supabase.from("categorias_gasto").select("nombre, en_resultado"),
    ])

    // Una consulta fallida no es un período sin movimientos: no debe
    // mostrarse como un resumen válido en cero.
    if (ventasResult.error || gastosResult.error || categoriasResult.error) {
      console.error(
        "Error al calcular el resumen de caja:",
        ventasResult.error || gastosResult.error || categoriasResult.error,
      )
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

    const tipoPorCategoria = new Map(categoriasResult.data?.map((c) => [c.nombre, c.en_resultado]) ?? [])
    const tipoDe = (g: { categoria: string }) => tipoPorCategoria.get(g.categoria) ?? "resultado"
    const suma = (lista: { monto: number }[] | undefined) => lista?.reduce((sum, g) => sum + Number(g.monto), 0) || 0

    // Todo en pesos: las devoluciones de aportes en dólares se muestran aparte.
    const gastosPesos = gastos?.filter((g) => g.moneda !== "USD")
    const egresos = gastosPesos?.filter((g) => tipoDe(g) !== "aparte")
    const devoluciones = gastosPesos?.filter((g) => tipoDe(g) === "aparte")
    const devolucionDolares = suma(gastos?.filter((g) => g.moneda === "USD"))
    const pagadoEnProducto = suma(gastosPesos?.filter((g) => g.metodo_pago === "producto"))

    const gastosEfectivo = suma(egresos?.filter((g) => g.metodo_pago === "efectivo"))
    const gastosTransferencia = suma(egresos?.filter((g) => g.metodo_pago === "transferencia"))
    const totalGastos = gastosEfectivo + gastosTransferencia
    const gastosResultado = suma(gastosPesos?.filter((g) => tipoDe(g) === "resultado"))
    const inversion = suma(gastosPesos?.filter((g) => tipoDe(g) === "inversion"))
    const devolucionEfectivo = suma(devoluciones?.filter((g) => g.metodo_pago === "efectivo"))
    const devolucionTransferencia = suma(devoluciones?.filter((g) => g.metodo_pago === "transferencia"))
    const devolucion = devolucionEfectivo + devolucionTransferencia

    const gananciaNeta = totalVentas - gastosResultado
    const efectivoNeto = ventasEfectivo - gastosEfectivo - devolucionEfectivo
    const transferenciaNeto = ventasTransferencia - gastosTransferencia - devolucionTransferencia
    const cajaNeta = efectivoNeto + transferenciaNeto

    setResumen({
      ventasEfectivo,
      ventasTransferencia,
      totalVentas,
      gastosEfectivo,
      gastosTransferencia,
      totalGastos,
      gastosResultado,
      inversion,
      devolucionEfectivo,
      devolucionTransferencia,
      devolucion,
      devolucionDolares,
      pagadoEnProducto,
      gananciaNeta,
      efectivoNeto,
      transferenciaNeto,
      cajaNeta,
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
                    Aportes menos gastos del resultado (sin equipamiento ni devolución de aportes)
                  </p>
                </CardContent>
              </Card>

              <Card className="min-w-0 gap-4 border-border bg-card shadow-sm lg:min-h-[180px]">
                <CardHeader className="px-5">
                  <CardTitle className="text-sm font-medium leading-5 text-muted-foreground">Total aportes</CardTitle>
                </CardHeader>
                <CardContent className="px-5">
                  <div className="break-words text-2xl font-bold leading-9 text-foreground tabular-nums">
                    {formatCurrency(resumen.totalVentas)}
                  </div>
                </CardContent>
              </Card>

              <Card className="min-w-0 gap-4 border-border bg-card shadow-sm lg:min-h-[180px]">
                <CardHeader className="px-5">
                  <CardTitle className="text-sm font-medium leading-5 text-muted-foreground">
                    Gastos del resultado
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-5">
                  <div className="break-words text-2xl font-bold leading-9 text-foreground tabular-nums">
                    {formatCurrency(resumen.gastosResultado)}
                  </div>
                  <dl className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                    <div className="flex justify-between gap-2">
                      <dt>Inversión (equipamiento)</dt>
                      <dd className="tabular-nums">{formatCurrency(resumen.inversion)}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt>Devolución de aportes</dt>
                      <dd className="tabular-nums">{formatCurrency(resumen.devolucion)}</dd>
                    </div>
                    {resumen.pagadoEnProducto > 0 && (
                      <div className="flex justify-between gap-2">
                        <dt>Pagado en producto (incluido)</dt>
                        <dd className="tabular-nums">{formatCurrency(resumen.pagadoEnProducto)}</dd>
                      </div>
                    )}
                    {resumen.devolucionDolares > 0 && (
                      <div className="flex justify-between gap-2">
                        <dt>Devolución en dólares</dt>
                        <dd className="tabular-nums">{formatMoneda(resumen.devolucionDolares, "USD")}</dd>
                      </div>
                    )}
                  </dl>
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
                      <TableCell className="font-medium text-foreground">Ingresos (aportes)</TableCell>
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
                      <TableCell className="font-medium text-foreground">Egresos (gastos e inversión)</TableCell>
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
                    <TableRow className="hover:bg-muted/40">
                      <TableCell className="font-medium text-foreground">Devolución de aportes</TableCell>
                      <TableCell className="text-right text-foreground tabular-nums">
                        {formatCurrency(resumen.devolucionEfectivo)}
                      </TableCell>
                      <TableCell className="text-right text-foreground tabular-nums">
                        {formatCurrency(resumen.devolucionTransferencia)}
                      </TableCell>
                      <TableCell className="text-right font-medium text-foreground tabular-nums">
                        {formatCurrency(resumen.devolucion)}
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
                      <TableCell
                        className={cn("text-right font-bold tabular-nums", getResultadoEstilo(resumen.cajaNeta).claseTexto)}
                      >
                        {formatCurrency(resumen.cajaNeta)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
              {resumen.devolucionDolares > 0 && (
                <p className="mt-3 text-sm text-muted-foreground">
                  Además se devolvieron {formatMoneda(resumen.devolucionDolares, "USD")} de aportes en dólares, que no
                  entran en el balance en pesos.
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
