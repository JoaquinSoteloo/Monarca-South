import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import {
  Package,
  Users,
  ShoppingCart,
  Scale,
  Receipt,
  Gauge,
  AlertTriangle,
  ArrowRight,
  Banknote,
  CreditCard,
  Clock,
  PackageSearch,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { formatCurrency, formatGramos, formatNumero } from "@/lib/format"
import { formatFechaLargaArgentina, formatHoraArgentina, getArgentinaDateString, getArgentinaDayRangeUTC } from "@/lib/timezone"
import { cn } from "@/lib/utils"

interface VentaHoy {
  id: string
  total: number
  metodo_pago: "efectivo" | "transferencia" | "pendiente"
  created_at: string
  socio: { nombre: string; apellido: string } | { nombre: string; apellido: string }[] | null
}

const metodoIcon = { efectivo: Banknote, transferencia: CreditCard, pendiente: Clock } as const
const metodoLabel = { efectivo: "Efectivo", transferencia: "Transferencia", pendiente: "Pendiente" } as const

const accesosRapidos = [
  { href: "/stock", label: "Stock" },
  { href: "/socios", label: "Socios" },
  { href: "/historial", label: "Historial" },
  { href: "/caja", label: "Caja" },
]

function socioNombre(socio: VentaHoy["socio"]) {
  const s = Array.isArray(socio) ? socio[0] : socio
  return s ? `${s.apellido}, ${s.nombre}` : "Socio"
}

export default async function Dashboard() {
  const supabase = await createClient()

  let totalSocios = 0
  let totalGeneticas = 0
  let ventasHoyTotal = 0
  let ventasHoy: VentaHoy[] = []
  let stockBajo: { nombre: string; gramos_disponibles: number }[] = []
  let totalGramosDisponibles = 0
  let gastosHoyTotal = 0
  let promedioGramosMes = 0
  let deudaTotal = 0
  let deudaSociosCount = 0
  let sociosLimiteExcedidoCount = 0
  let dashboardError = false

  try {
    const inicioMesActual = new Date()
    inicioMesActual.setDate(1)
    inicioMesActual.setHours(0, 0, 0, 0)
    const inicioVentana = new Date(inicioMesActual)
    inicioVentana.setMonth(inicioVentana.getMonth() - 6)
    // "Hoy" es el día calendario en Argentina, no en UTC (donde corre el
    // servidor) — ver lib/timezone.ts. ventas.created_at es timestamptz:
    // se filtra por rango [inicio del día ART, inicio del día siguiente).
    // gastos.fecha es date (sin hora): se compara por igualdad exacta con
    // la fecha calendario argentina.
    const { startUTC: inicioHoyUTC, endUTC: finHoyUTC } = getArgentinaDayRangeUTC()
    const hoyArgentina = getArgentinaDateString()

    const [
      sociosResult,
      geneticasResult,
      ventasHoyResult,
      stockBajoResult,
      geneticasGramosResult,
      gastosResult,
      ventasPromedioResult,
      deudaResult,
      sociosLimiteResult,
      ventasMesResult,
    ] = await Promise.all([
      supabase.from("socios").select("*", { count: "exact", head: true }).eq("activo", true),
      supabase.from("geneticas").select("*", { count: "exact", head: true }).eq("activo", true),
      supabase
        .from("ventas")
        .select("id, total, metodo_pago, created_at, socio:socios(nombre, apellido)")
        .gte("created_at", inicioHoyUTC)
        .lt("created_at", finHoyUTC)
        .order("created_at", { ascending: false }),
      supabase.from("geneticas").select("nombre, gramos_disponibles").eq("activo", true).lt("gramos_disponibles", 100),
      supabase.from("geneticas").select("gramos_disponibles").eq("activo", true),
      supabase.from("gastos").select("monto").eq("fecha", hoyArgentina),
      supabase
        .from("ventas")
        .select("gramos, detalles:detalle_venta(gramos, peso_enrolados)")
        .gte("created_at", inicioVentana.toISOString())
        .lt("created_at", inicioMesActual.toISOString()),
      // Deuda pendiente real: misma definición que ya usa ventas-manager.tsx
      // (saldo_pendiente > 0 en ventas), agregada para todo el club.
      supabase.from("ventas").select("socio_id, saldo_pendiente").gt("saldo_pendiente", 0),
      // Límite mensual: mismos datos que ya usa app/ventas/page.tsx para
      // calcular el consumo del mes por socio.
      supabase.from("socios").select("id, gramos_mensuales").eq("activo", true).gt("gramos_mensuales", 0),
      supabase.from("ventas").select("socio_id, gramos").gte("created_at", inicioMesActual.toISOString()),
    ])

    totalSocios = sociosResult.count || 0
    totalGeneticas = geneticasResult.count || 0
    ventasHoy = ventasHoyResult.data || []
    ventasHoyTotal = ventasHoy.reduce((sum, v) => sum + Number(v.total), 0)
    stockBajo = stockBajoResult.data || []
    totalGramosDisponibles = geneticasGramosResult.data?.reduce((sum, g) => sum + Number(g.gramos_disponibles), 0) || 0
    gastosHoyTotal = gastosResult.data?.reduce((sum, g) => sum + Number(g.monto), 0) || 0

    const totalGramos6Meses =
      ventasPromedioResult.data?.reduce((sum, venta) => {
        if (venta.detalles && venta.detalles.length > 0) {
          return sum + venta.detalles.reduce((s, d) => s + (Number(d.gramos) || 0) + (Number(d.peso_enrolados) || 0), 0)
        }
        return sum + (Number(venta.gramos) || 0)
      }, 0) || 0
    promedioGramosMes = totalGramos6Meses / 6

    const deudaPorSocio = new Set<string>()
    deudaTotal =
      deudaResult.data?.reduce((sum, v) => {
        if (v.socio_id) deudaPorSocio.add(v.socio_id)
        return sum + Number(v.saldo_pendiente)
      }, 0) || 0
    deudaSociosCount = deudaPorSocio.size

    const consumoPorSocio: Record<string, number> = {}
    ventasMesResult.data?.forEach((v) => {
      if (v.socio_id) consumoPorSocio[v.socio_id] = (consumoPorSocio[v.socio_id] || 0) + (Number(v.gramos) || 0)
    })
    sociosLimiteExcedidoCount =
      sociosLimiteResult.data?.filter((s) => (consumoPorSocio[s.id] || 0) > Number(s.gramos_mensuales)).length || 0
  } catch (error) {
    console.error("Error loading dashboard data:", error)
    dashboardError = true
  }

  const indicadores = [
    { key: "socios", label: "Socios activos", icon: Users, value: formatNumero(totalSocios) },
    { key: "geneticas", label: "Genéticas en stock", icon: Package, value: formatNumero(totalGeneticas) },
    {
      key: "gramos",
      label: "Gramos disponibles",
      icon: Scale,
      value: formatGramos(totalGramosDisponibles),
      highlight: true,
    },
    {
      key: "ventas",
      label: "Ventas hoy",
      icon: ShoppingCart,
      value: formatCurrency(ventasHoyTotal),
      highlight: true,
      money: true,
    },
    { key: "gastos", label: "Gastos hoy", icon: Receipt, value: formatCurrency(gastosHoyTotal), money: true },
    {
      key: "stockBajo",
      label: "Stock bajo",
      icon: PackageSearch,
      value: formatNumero(stockBajo.length),
      note: "< 100 g disponibles",
      alert: stockBajo.length > 0,
    },
    {
      key: "promedio",
      label: "Promedio gramos/mes",
      icon: Gauge,
      value: formatGramos(promedioGramosMes),
      note: "últimos 6 meses",
    },
  ]

  const alertas = [
    deudaSociosCount > 0
      ? {
          key: "deuda",
          texto: `${formatNumero(deudaSociosCount)} socio${deudaSociosCount === 1 ? "" : "s"} con saldo pendiente por un total de ${formatCurrency(deudaTotal)}`,
          href: "/deudas",
        }
      : null,
    stockBajo.length > 0
      ? {
          key: "stock",
          texto: `${formatNumero(stockBajo.length)} genética${stockBajo.length === 1 ? "" : "s"} por debajo de 100 g disponibles`,
          href: "/stock",
        }
      : null,
    sociosLimiteExcedidoCount > 0
      ? {
          key: "limite",
          texto: `${formatNumero(sociosLimiteExcedidoCount)} socio${sociosLimiteExcedidoCount === 1 ? "" : "s"} superó su límite mensual este mes`,
          href: "/socios",
        }
      : null,
  ].filter((a): a is { key: string; texto: string; href: string } => a !== null)

  return (
    <main className="container mx-auto flex flex-col gap-6 px-4 py-6 sm:gap-8 sm:py-8">
      {/* 1. Encabezado + acción principal — título más chico en mobile para
          que los indicadores aparezcan antes, sin cambiar el desktop. */}
      <section className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div>
          <p className="text-sm text-muted-foreground">{formatFechaLargaArgentina()}</p>
          <h1 className="text-xl font-semibold leading-tight text-foreground sm:text-[26px]">
            Hola — así viene el día en Monarca
          </h1>
        </div>
        <Link
          href="/ventas"
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <ShoppingCart className="h-4 w-4" />
          Registrar venta
        </Link>
      </section>

      {dashboardError && (
        <p className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          No se pudieron cargar todos los datos del panel. Probá recargar la página.
        </p>
      )}

      {/* 2. Los siete indicadores — estado general al entrar */}
      <section aria-labelledby="indicadores-heading" className="flex flex-col gap-3">
        <h2 id="indicadores-heading" className="text-sm font-semibold text-foreground">
          Estado general
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {indicadores.map(({ key, label, icon: Icon, value, note, highlight, alert, money }) => (
            <div
              key={key}
              className={cn(
                "min-w-0 rounded-lg border p-4",
                // Los importes ($220.000,00 y similares) no entran cómodos en
                // media columna de un teléfono chico: ocupan la fila completa
                // para no quedar pegados al borde ni recortados. En lg (4
                // columnas, referencia de escritorio) vuelven a su celda.
                money && "col-span-2 lg:col-span-1",
                alert
                  ? "border-amber-300 bg-amber-50"
                  : highlight
                    ? "border-primary/25 bg-primary/5"
                    : "border-border bg-card",
              )}
            >
              <div className="mb-2 flex items-center gap-2">
                <span
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                    alert ? "bg-amber-100 text-amber-700" : "bg-primary/12 text-primary",
                  )}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <p className="text-xs font-medium text-muted-foreground">{label}</p>
              </div>
              <p
                className={cn(
                  "break-words font-semibold leading-tight",
                  money ? "text-xl sm:text-2xl lg:text-[28px]" : "text-2xl leading-none sm:text-[28px]",
                  alert ? "text-amber-800" : "text-foreground",
                )}
              >
                {value}
              </p>
              {note && <p className="mt-1.5 text-xs text-muted-foreground">{note}</p>}
            </div>
          ))}
        </div>
      </section>

      {/* 3. Alertas y actividad reciente */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <section aria-labelledby="alertas-heading" className="flex flex-col gap-2">
          <h2 id="alertas-heading" className="text-sm font-semibold text-foreground">
            Alertas
          </h2>
          {alertas.length === 0 ? (
            <div className="rounded-lg border border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
              Sin alertas por ahora.
            </div>
          ) : (
            <div className="flex flex-col divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
              {alertas.map((a) => (
                <Link
                  key={a.key}
                  href={a.href}
                  className="flex items-center justify-between gap-3 px-4 py-3 text-sm transition-colors hover:bg-amber-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                >
                  <span className="flex items-center gap-2.5 text-foreground">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                    {a.texto}
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </Link>
              ))}
            </div>
          )}
        </section>

        <section aria-labelledby="actividad-heading" className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h2 id="actividad-heading" className="text-sm font-semibold text-foreground">
              Actividad de hoy
            </h2>
            <span className="text-sm text-muted-foreground">
              Total: <span className="font-semibold text-foreground">{formatCurrency(ventasHoyTotal)}</span>
            </span>
          </div>
          <Card className="border-border bg-card shadow-sm">
            <CardContent className="p-0">
              {ventasHoy.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">No hay ventas registradas hoy</p>
              ) : (
                <ul className="divide-y divide-border">
                  {ventasHoy.slice(0, 8).map((v) => {
                    const Icon = metodoIcon[v.metodo_pago] ?? Clock
                    return (
                      <li key={v.id} className="flex items-center justify-between gap-3 px-4 py-3">
                        <div className="flex items-center gap-3">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                            <Icon className="h-4 w-4" />
                          </span>
                          <div>
                            <p className="text-sm font-medium text-foreground">{socioNombre(v.socio)}</p>
                            <p className="text-xs text-muted-foreground">
                              {metodoLabel[v.metodo_pago] ?? v.metodo_pago} · {formatHoraArgentina(v.created_at)}hs
                            </p>
                          </div>
                        </div>
                        <span className="text-sm font-semibold text-foreground">{formatCurrency(Number(v.total))}</span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </section>
      </div>

      {/* Accesos secundarios, discretos */}
      <section aria-labelledby="accesos-heading" className="flex flex-col gap-2 pb-2">
        <h2 id="accesos-heading" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Otros accesos
        </h2>
        <div className="flex flex-wrap gap-2">
          {accesosRapidos.map((a) => (
            <Link key={a.href} href={a.href}>
              <Badge
                variant="outline"
                className="cursor-pointer border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:border-primary/40 hover:text-foreground"
              >
                {a.label}
              </Badge>
            </Link>
          ))}
        </div>
      </section>
    </main>
  )
}
