"use client"

import { useEffect, useState } from "react"
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { BarChart3 } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { formatGramos } from "@/lib/format"
import {
  desdePeriodo,
  PERIODOS_RANKING,
  rankingGeneticas,
  type FilaRanking,
  type PeriodoRanking,
  type VentaParaRanking,
} from "@/lib/ranking-geneticas"

// Genéticas más retiradas por los socios (gramos entregados), para decidir
// con qué genéticas seguir cuando se reduzca el catálogo.

const MAX_EN_GRAFICO = 12
const PAGINA = 1000
// Mismos tonos sobrios que el histórico ambiental: distinguen sueltos de
// enrolados, no comunican estados.
const COLOR_SUELTOS = "#3f6b52"
const COLOR_ENROLADOS = "#9c7a4a"

export function RankingGeneticas() {
  const [periodo, setPeriodo] = useState<PeriodoRanking>("30d")
  const [filas, setFilas] = useState<FilaRanking[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelado = false
    const supabase = createClient()
    async function cargar() {
      setLoading(true)
      setError(false)
      try {
        const { data: geneticas, error: errGen } = await supabase.from("geneticas").select("id, nombre")
        if (errGen) throw errGen
        const nombres: Record<string, string> = {}
        for (const g of (geneticas ?? []) as { id: string; nombre: string }[]) nombres[g.id] = g.nombre

        const desde = desdePeriodo(periodo)
        const ventas: VentaParaRanking[] = []
        for (let pagina = 0; ; pagina++) {
          let consulta = supabase
            .from("ventas")
            .select(
              "id, genetica_id, gramos, detalles:detalle_venta(genetica_id, gramos, cantidad_enrolados, peso_enrolados, peso_por_enrolado)",
            )
            .order("created_at", { ascending: false })
            .range(pagina * PAGINA, pagina * PAGINA + PAGINA - 1)
          if (desde) consulta = consulta.gte("created_at", desde)
          const { data, error: errVentas } = await consulta
          if (errVentas) throw errVentas
          ventas.push(...((data ?? []) as VentaParaRanking[]))
          if (!data || data.length < PAGINA) break
        }
        if (!cancelado) setFilas(rankingGeneticas(ventas, nombres))
      } catch {
        if (!cancelado) setError(true)
      } finally {
        if (!cancelado) setLoading(false)
      }
    }
    cargar()
    return () => {
      cancelado = true
    }
  }, [periodo])

  const totalPeriodo = filas.reduce((s, f) => s + f.total, 0)
  const enGrafico = filas.slice(0, MAX_EN_GRAFICO)
  const alto = Math.max(160, enGrafico.length * 34 + 60)

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          Genéticas más retiradas
        </CardTitle>
        <CardDescription>
          Gramos entregados a los socios por genética (sueltos y enrolados). Sirve para decidir con qué genéticas
          seguimos.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs value={periodo} onValueChange={(v) => setPeriodo(v as PeriodoRanking)}>
          <TabsList>
            {PERIODOS_RANKING.map((p) => (
              <TabsTrigger key={p.valor} value={p.valor}>
                {p.etiqueta}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {loading ? (
          <p className="text-sm text-muted-foreground">Cargando entregas…</p>
        ) : error ? (
          <p className="text-sm text-muted-foreground">No se pudieron cargar las entregas. Probá de nuevo en un rato.</p>
        ) : filas.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay entregas con genética en este período.</p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              {formatGramos(totalPeriodo)} entregados en {filas.length} genéticas
              {filas.length > MAX_EN_GRAFICO ? ` · el gráfico muestra las ${MAX_EN_GRAFICO} primeras` : ""}.
            </p>
            <div style={{ height: alto }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={enGrafico} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 8 }}>
                  <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                  <XAxis type="number" tickFormatter={(v: number) => `${v} g`} fontSize={12} />
                  <YAxis type="category" dataKey="nombre" width={170} fontSize={12} interval={0} />
                  <Tooltip
                    formatter={(valor, nombre) => [formatGramos(Number(valor)), String(nombre)]}
                    cursor={{ fillOpacity: 0.08 }}
                  />
                  <Legend />
                  <Bar dataKey="sueltos" name="Sueltos" stackId="g" fill={COLOR_SUELTOS} />
                  <Bar dataKey="enrolados" name="Enrolados" stackId="g" fill={COLOR_ENROLADOS} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Genética</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Sueltos</TableHead>
                  <TableHead className="text-right">Enrolados</TableHead>
                  <TableHead className="text-right">Entregas</TableHead>
                  <TableHead className="text-right">% del total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filas.map((f, i) => (
                  <TableRow key={f.genetica_id}>
                    <TableCell>{i + 1}</TableCell>
                    <TableCell className="font-medium">{f.nombre}</TableCell>
                    <TableCell className="text-right">{formatGramos(f.total)}</TableCell>
                    <TableCell className="text-right">{formatGramos(f.sueltos)}</TableCell>
                    <TableCell className="text-right">{formatGramos(f.enrolados)}</TableCell>
                    <TableCell className="text-right">{f.entregas}</TableCell>
                    <TableCell className="text-right">{(f.participacion * 100).toFixed(1).replace(".", ",")} %</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="text-xs text-muted-foreground">
              Falta sumar el rendimiento de cada genética (g por m² y por planta): se agrega cuando se registren los
              cierres de cosecha.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  )
}
