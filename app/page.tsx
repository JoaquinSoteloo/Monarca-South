import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { Package, Users, ShoppingCart, TrendingUp, History, Scale, MapPin, Receipt, DollarSign, AlertCircle, CalendarClock, Sprout, Thermometer, Gauge } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Header } from "@/components/header"

export default async function Dashboard() {
  const supabase = await createClient()

  let totalSocios = 0
  let totalGeneticas = 0
  let ventasHoyTotal = 0
  let stockBajo: { nombre: string; gramos_disponibles: number }[] = []
  let totalGramosDisponibles = 0
  let gastosHoyTotal = 0
  let promedioGramosMes = 0

  try {
    const inicioMesActual = new Date()
    inicioMesActual.setDate(1)
    inicioMesActual.setHours(0, 0, 0, 0)
    const inicioVentana = new Date(inicioMesActual)
    inicioVentana.setMonth(inicioVentana.getMonth() - 6)

    const [
      sociosResult,
      geneticasResult,
      ventasResult,
      stockBajoResult,
      geneticasGramosResult,
      gastosResult,
      ventasPromedioResult,
    ] = await Promise.all([
      supabase.from("socios").select("*", { count: "exact", head: true }).eq("activo", true),
      supabase.from("geneticas").select("*", { count: "exact", head: true }).eq("activo", true),
      supabase.from("ventas").select("total").gte("created_at", new Date().toISOString().split("T")[0]),
      supabase.from("geneticas").select("nombre, gramos_disponibles").eq("activo", true).lt("gramos_disponibles", 100),
      supabase.from("geneticas").select("gramos_disponibles").eq("activo", true),
      supabase.from("gastos").select("monto").gte("fecha", new Date().toISOString().split("T")[0]),
      supabase
        .from("ventas")
        .select("gramos, detalles:detalle_venta(gramos, peso_enrolados)")
        .gte("created_at", inicioVentana.toISOString())
        .lt("created_at", inicioMesActual.toISOString()),
    ])

    totalSocios = sociosResult.count || 0
    totalGeneticas = geneticasResult.count || 0
    ventasHoyTotal = ventasResult.data?.reduce((sum, v) => sum + Number(v.total), 0) || 0
    stockBajo = stockBajoResult.data || []
    totalGramosDisponibles = geneticasGramosResult.data?.reduce((sum, g) => sum + Number(g.gramos_disponibles), 0) || 0
    gastosHoyTotal = gastosResult.data?.reduce((sum, g) => sum + Number(g.monto), 0) || 0

    const totalGramos6Meses =
      ventasPromedioResult.data?.reduce((sum, venta) => {
        if (venta.detalles && venta.detalles.length > 0) {
          return (
            sum +
            venta.detalles.reduce((s, d) => s + (Number(d.gramos) || 0) + (Number(d.peso_enrolados) || 0), 0)
          )
        }
        return sum + (Number(venta.gramos) || 0)
      }, 0) || 0
    promedioGramosMes = totalGramos6Meses / 6
  } catch (error) {
    console.error("Error loading dashboard data:", error)
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container mx-auto px-4 py-8">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-5 mb-8">
          <Card className="bg-card border-emerald-200/50 shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Socios Activos</CardTitle>
              <Users className="h-4 w-4 text-emerald-700" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-emerald-900">{totalSocios || 0}</div>
            </CardContent>
          </Card>

          <Card className="bg-card border-emerald-200/50 shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Genéticas en Stock</CardTitle>
              <Package className="h-4 w-4 text-emerald-700" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-emerald-900">{totalGeneticas || 0}</div>
            </CardContent>
          </Card>

          <Card className="bg-card border-emerald-200/50 shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Gramos Disponibles</CardTitle>
              <Scale className="h-4 w-4 text-emerald-700" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-emerald-900">{totalGramosDisponibles.toFixed(2)}g</div>
            </CardContent>
          </Card>

          <Card className="bg-card border-emerald-200/50 shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Ventas Hoy</CardTitle>
              <ShoppingCart className="h-4 w-4 text-emerald-700" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-emerald-900">${ventasHoyTotal.toFixed(2)}</div>
            </CardContent>
          </Card>

          <Card className="bg-card border-red-200/50 shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Gastos Hoy</CardTitle>
              <TrendingUp className="h-4 w-4 text-red-700" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-900">${gastosHoyTotal.toFixed(2)}</div>
            </CardContent>
          </Card>

          <Card className="bg-card border-amber-300/50 shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Stock Bajo</CardTitle>
              <TrendingUp className="h-4 w-4 text-amber-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-700">{stockBajo?.length || 0}</div>
              <p className="text-xs text-muted-foreground">{"<"} 100g disponibles</p>
            </CardContent>
          </Card>

          <Card className="bg-card border-purple-200/50 shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Promedio Gramos/Mes</CardTitle>
              <Gauge className="h-4 w-4 text-purple-700" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-900">{promedioGramosMes.toFixed(2)}g</div>
              <p className="text-xs text-muted-foreground">últimos 6 meses</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <Link href="/stock" className="group">
            <Card className="bg-gradient-to-br from-emerald-50 to-white border-emerald-200/50 hover:border-emerald-400 hover:shadow-lg transition-all h-full">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-emerald-800">
                  <Package className="h-5 w-5 text-emerald-600" />
                  Gestión de Stock
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-sm">
                  Administra las genéticas, cantidades y precios del inventario.
                </p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/socios" className="group">
            <Card className="bg-gradient-to-br from-emerald-50 to-white border-emerald-200/50 hover:border-emerald-400 hover:shadow-lg transition-all h-full">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-emerald-800">
                  <Users className="h-5 w-5 text-emerald-600" />
                  Gestión de Socios
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-sm">
                  Registra y administra socios con sus membresías correspondientes.
                </p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/sucursales" className="group">
            <Card className="bg-gradient-to-br from-blue-50 to-white border-blue-200/50 hover:border-blue-400 hover:shadow-lg transition-all h-full">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-blue-800">
                  <MapPin className="h-5 w-5 text-blue-600" />
                  Sucursales
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-sm">Administra las sucursales y sus direcciones.</p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/ventas" className="group">
            <Card className="bg-gradient-to-br from-amber-50 to-white border-amber-200/50 hover:border-amber-400 hover:shadow-lg transition-all h-full">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-amber-800">
                  <ShoppingCart className="h-5 w-5 text-amber-600" />
                  Registrar Venta
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-sm">
                  Registra entregas a socios seleccionando genética y cantidad.
                </p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/historial" className="group">
            <Card className="bg-gradient-to-br from-emerald-50 to-white border-emerald-200/50 hover:border-emerald-400 hover:shadow-lg transition-all h-full">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-emerald-800">
                  <History className="h-5 w-5 text-emerald-600" />
                  Historial de Ventas
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-sm">Consulta el historial de ventas por período de fechas.</p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/gastos" className="group">
            <Card className="bg-gradient-to-br from-red-50 to-white border-red-200/50 hover:border-red-400 hover:shadow-lg transition-all h-full">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-red-800">
                  <Receipt className="h-5 w-5 text-red-600" />
                  Gestión de Gastos
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-sm">Registrá y administrá los gastos del club.</p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/caja" className="group">
            <Card className="bg-gradient-to-br from-blue-50 to-white border-blue-200/50 hover:border-blue-400 hover:shadow-lg transition-all h-full">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-blue-800">
                  <DollarSign className="h-5 w-5 text-blue-600" />
                  Reporte de Caja
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-sm">Visualizá ganancias, gastos y balance por período.</p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/deudas" className="group">
            <Card className="bg-gradient-to-br from-orange-50 to-white border-orange-200/50 hover:border-orange-400 hover:shadow-lg transition-all h-full">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-orange-800">
                  <AlertCircle className="h-5 w-5 text-orange-600" />
                  Control de Deudas
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-sm">Gestioná deudas pendientes y registrá pagos parciales.</p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/citas" className="group">
            <Card className="bg-gradient-to-br from-purple-50 to-white border-purple-200/50 hover:border-purple-400 hover:shadow-lg transition-all h-full">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-purple-800">
                  <CalendarClock className="h-5 w-5 text-purple-600" />
                  Gestión de Citas
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-sm">Administrá los turnos y reservas del día.</p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/cultivo" className="group">
            <Card className="bg-gradient-to-br from-green-50 to-white border-green-200/50 hover:border-green-400 hover:shadow-lg transition-all h-full">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-green-800">
                  <Sprout className="h-5 w-5 text-green-600" />
                  Salas de Cultivo
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-sm">Gestioná las salas y camas de cultivo.</p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/monitoreo" className="group">
            <Card className="bg-gradient-to-br from-cyan-50 to-white border-cyan-200/50 hover:border-cyan-400 hover:shadow-lg transition-all h-full">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-cyan-800">
                  <Thermometer className="h-5 w-5 text-cyan-600" />
                  Monitoreo Ambiental
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-sm">
                  Temperatura, humedad, VPD, luz, dew point y presión en tiempo real (Pulse Grow).
                </p>
              </CardContent>
            </Card>
          </Link>
        </div>

        {stockBajo && stockBajo.length > 0 && (
          <Card className="mt-8 bg-amber-50 border-amber-300">
            <CardHeader>
              <CardTitle className="text-amber-700">Alerta de Stock Bajo</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1">
                {stockBajo.map((item, i) => (
                  <li key={i} className="text-foreground">
                    {item.nombre}: <span className="text-amber-600 font-medium">{item.gramos_disponibles}g</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  )
}
