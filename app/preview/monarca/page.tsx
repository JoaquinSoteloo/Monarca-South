import Link from "next/link"
import {
  ShoppingCart,
  AlertTriangle,
  Clock,
  Scale,
  Users,
  Package,
  Gauge,
  ArrowRight,
  Banknote,
  CreditCard,
  Receipt,
  PackageSearch,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { PreviewShell } from "@/components/preview/preview-shell"
import { formatCurrency, formatGramos } from "@/components/preview/format"
import { cn } from "@/lib/utils"

// Datos ficticios sólo para esta muestra visual — ningún valor sale de
// Supabase ni de una escritura real. Los tipos de dato y sus períodos de
// cálculo son los mismos que ya usa app/page.tsx (socios activos, genéticas
// en stock, gramos disponibles, ventas/gastos de hoy, stock bajo <100g,
// promedio de gramos de los últimos 6 meses); acá sólo se re-maquetan con
// números de ejemplo.
const alertas = [
  {
    texto: "4 socios con saldo pendiente por un total de $86.400,00",
    href: "/deudas",
  },
  {
    texto: "2 genéticas por debajo de 100 g disponibles",
    href: "/stock",
  },
  {
    texto: "1 socio superó su límite mensual esta semana",
    href: "/socios",
  },
]

const actividadHoy = [
  { socio: "Gómez, Ana", monto: 12500, metodo: "efectivo" as const, hora: "11:24" },
  { socio: "Pereyra, Luis", monto: 8200, metodo: "transferencia" as const, hora: "10:57" },
  { socio: "Fernández, Marta", monto: 21000, metodo: "pendiente" as const, hora: "10:12" },
  { socio: "Ibarra, Tomás", monto: 6400, metodo: "efectivo" as const, hora: "09:41" },
]

const accesosRapidos = [
  { href: "/stock", label: "Stock" },
  { href: "/socios", label: "Socios" },
  { href: "/historial", label: "Historial" },
  { href: "/caja", label: "Caja" },
]

const metodoIcon = { efectivo: Banknote, transferencia: CreditCard, pendiente: Clock }
const metodoLabel = { efectivo: "Efectivo", transferencia: "Transferencia", pendiente: "Pendiente" }

export default function PreviewInicioPage() {
  const hoy = new Date()
  const ventasHoyTotal = actividadHoy.reduce((acc, v) => acc + v.monto, 0)
  const gastosHoyTotal = 15600
  const stockBajoCount = 2

  // Los 7 indicadores obligatorios del panel de Inicio, con la misma
  // definición y período que ya calcula app/page.tsx.
  const indicadores = [
    { key: "socios", label: "Socios activos", icon: Users, value: "128" },
    { key: "geneticas", label: "Genéticas en stock", icon: Package, value: "14" },
    { key: "gramos", label: "Gramos disponibles", icon: Scale, value: formatGramos(3240), highlight: true },
    { key: "ventas", label: "Ventas hoy", icon: ShoppingCart, value: formatCurrency(ventasHoyTotal), highlight: true },
    { key: "gastos", label: "Gastos hoy", icon: Receipt, value: formatCurrency(gastosHoyTotal) },
    {
      key: "stockBajo",
      label: "Stock bajo",
      icon: PackageSearch,
      value: String(stockBajoCount),
      note: "< 100 g disponibles",
      alert: stockBajoCount > 0,
    },
    {
      key: "promedio",
      label: "Promedio gramos/mes",
      icon: Gauge,
      value: formatGramos(412),
      note: "últimos 6 meses",
    },
  ]

  return (
    <PreviewShell title="Inicio">
      <div className="flex flex-col gap-8">
        {/* 1. Encabezado + acción principal */}
        <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm text-muted-foreground">
              {hoy.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" })}
            </p>
            <h1 className="text-[26px] font-semibold leading-tight text-foreground">
              Hola — así viene el día en Monarca
            </h1>
          </div>
          <Link
            href="/preview/monarca/ventas"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <ShoppingCart className="h-4 w-4" />
            Registrar venta
          </Link>
        </section>

        {/* 2. Los siete indicadores — estado general al entrar */}
        <section aria-labelledby="indicadores-heading" className="flex flex-col gap-3">
          <h2 id="indicadores-heading" className="text-sm font-semibold text-foreground">
            Estado general
          </h2>
          <div className="grid grid-cols-2 gap-3 max-[380px]:grid-cols-1 sm:gap-4 lg:grid-cols-4">
            {indicadores.map(({ key, label, icon: Icon, value, note, highlight, alert }) => (
              <div
                key={key}
                className={cn(
                  "rounded-lg border p-4",
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
                    "text-2xl font-semibold leading-none sm:text-[28px]",
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
            <div className="flex flex-col divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
              {alertas.map((a) => (
                <Link
                  key={a.texto}
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
                <ul className="divide-y divide-border">
                  {actividadHoy.map((v) => {
                    const Icon = metodoIcon[v.metodo]
                    return (
                      <li key={`${v.socio}-${v.hora}`} className="flex items-center justify-between gap-3 px-4 py-3">
                        <div className="flex items-center gap-3">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                            <Icon className="h-4 w-4" />
                          </span>
                          <div>
                            <p className="text-sm font-medium text-foreground">{v.socio}</p>
                            <p className="text-xs text-muted-foreground">
                              {metodoLabel[v.metodo]} · {v.hora}hs
                            </p>
                          </div>
                        </div>
                        <span className="text-sm font-semibold text-foreground">{formatCurrency(v.monto)}</span>
                      </li>
                    )
                  })}
                </ul>
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
      </div>
    </PreviewShell>
  )
}
