"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { CalendarIcon, TrendingUp, TrendingDown, DollarSign, Receipt } from "lucide-react"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { useToast } from "@/hooks/use-toast"

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

export function Caja() {
  const [fechaDesde, setFechaDesde] = useState<Date>(new Date())
  const [fechaHasta, setFechaHasta] = useState<Date>(new Date())
  const [resumen, setResumen] = useState<ResumenCaja | null>(null)
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()
  const supabase = createClient()

  async function calcularResumen() {
    setLoading(true)

    const desde = format(fechaDesde, "yyyy-MM-dd")
    const hasta = format(fechaHasta, "yyyy-MM-dd")

    const [{ data: ventas }, { data: gastos }] = await Promise.all([
      supabase
        .from("ventas")
        .select("total, metodo_pago, created_at")
        .gte("created_at", desde)
        .lte("created_at", `${hasta}T23:59:59`),
      supabase.from("gastos").select("monto, metodo_pago, fecha").gte("fecha", desde).lte("fecha", hasta),
    ])

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

    setLoading(false)
  }

  useEffect(() => {
    calcularResumen()
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Reporte de Caja</h2>
        <p className="text-muted-foreground">Visualizá las ganancias y gastos por período</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Seleccionar Período</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Fecha Desde</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left font-normal bg-transparent">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(fechaDesde, "PPP", { locale: es })}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={fechaDesde}
                    onSelect={(date) => date && setFechaDesde(date)}
                    locale={es}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Fecha Hasta</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left font-normal bg-transparent">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(fechaHasta, "PPP", { locale: es })}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={fechaHasta}
                    onSelect={(date) => date && setFechaHasta(date)}
                    locale={es}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <Button onClick={calcularResumen} className="w-full bg-emerald-700 hover:bg-emerald-800" disabled={loading}>
            {loading ? "Calculando..." : "Calcular Resumen"}
          </Button>
        </CardContent>
      </Card>

      {resumen && (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="bg-gradient-to-br from-emerald-50 to-white border-emerald-200">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-emerald-800 text-base">
                  <TrendingUp className="h-5 w-5" />
                  Total Ventas
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-emerald-700">${resumen.totalVentas.toFixed(2)}</div>
                <div className="mt-2 space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Efectivo:</span>
                    <span className="font-medium">${resumen.ventasEfectivo.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Transferencia:</span>
                    <span className="font-medium">${resumen.ventasTransferencia.toFixed(2)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-red-50 to-white border-red-200">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-red-800 text-base">
                  <TrendingDown className="h-5 w-5" />
                  Total Gastos
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-red-700">${resumen.totalGastos.toFixed(2)}</div>
                <div className="mt-2 space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Efectivo:</span>
                    <span className="font-medium">${resumen.gastosEfectivo.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Transferencia:</span>
                    <span className="font-medium">${resumen.gastosTransferencia.toFixed(2)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card
              className={`bg-gradient-to-br ${
                resumen.gananciaNeta >= 0
                  ? "from-blue-50 to-white border-blue-200"
                  : "from-orange-50 to-white border-orange-200"
              }`}
            >
              <CardHeader>
                <CardTitle
                  className={`flex items-center gap-2 text-base ${
                    resumen.gananciaNeta >= 0 ? "text-blue-800" : "text-orange-800"
                  }`}
                >
                  <DollarSign className="h-5 w-5" />
                  {resumen.gananciaNeta >= 0 ? "Ganancia Neta" : "Pérdida Neta"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div
                  className={`text-3xl font-bold ${resumen.gananciaNeta >= 0 ? "text-blue-700" : "text-orange-700"}`}
                >
                  ${Math.abs(resumen.gananciaNeta).toFixed(2)}
                </div>
                <div className="mt-2 space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Efectivo:</span>
                    <span className={`font-medium ${resumen.efectivoNeto >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                      ${Math.abs(resumen.efectivoNeto).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Transferencia:</span>
                    <span
                      className={`font-medium ${resumen.transferenciaNeto >= 0 ? "text-emerald-700" : "text-red-700"}`}
                    >
                      ${Math.abs(resumen.transferenciaNeto).toFixed(2)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Receipt className="h-5 w-5" />
                Resumen Detallado
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Concepto</TableHead>
                    <TableHead className="text-right">Efectivo</TableHead>
                    <TableHead className="text-right">Transferencia</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-medium">Ingresos (Ventas)</TableCell>
                    <TableCell className="text-right text-emerald-700">${resumen.ventasEfectivo.toFixed(2)}</TableCell>
                    <TableCell className="text-right text-emerald-700">
                      ${resumen.ventasTransferencia.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right font-medium text-emerald-700">
                      ${resumen.totalVentas.toFixed(2)}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Egresos (Gastos)</TableCell>
                    <TableCell className="text-right text-red-700">${resumen.gastosEfectivo.toFixed(2)}</TableCell>
                    <TableCell className="text-right text-red-700">${resumen.gastosTransferencia.toFixed(2)}</TableCell>
                    <TableCell className="text-right font-medium text-red-700">
                      ${resumen.totalGastos.toFixed(2)}
                    </TableCell>
                  </TableRow>
                  <TableRow className="bg-muted/50">
                    <TableCell className="font-bold">Balance</TableCell>
                    <TableCell
                      className={`text-right font-bold ${resumen.efectivoNeto >= 0 ? "text-emerald-700" : "text-red-700"}`}
                    >
                      ${resumen.efectivoNeto.toFixed(2)}
                    </TableCell>
                    <TableCell
                      className={`text-right font-bold ${
                        resumen.transferenciaNeto >= 0 ? "text-emerald-700" : "text-red-700"
                      }`}
                    >
                      ${resumen.transferenciaNeto.toFixed(2)}
                    </TableCell>
                    <TableCell
                      className={`text-right font-bold ${resumen.gananciaNeta >= 0 ? "text-emerald-700" : "text-red-700"}`}
                    >
                      ${resumen.gananciaNeta.toFixed(2)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
