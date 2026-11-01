import { createClient } from "@/lib/supabase/server"
import { ExternosManager } from "@/components/externos-manager"
import { obtenerResumenMes } from "@/lib/consumo"

export default async function ExternosPage() {
  const supabase = await createClient()

  const [{ data: externos }, resumenMes, { data: config }] = await Promise.all([
    supabase.from("socios").select("*").eq("tipo", "externo").order("apellido"),
    obtenerResumenMes(supabase),
    supabase.from("config_entregas").select("max_entregas_externo_mes").maybeSingle(),
  ])

  const externosConEntregas =
    externos?.map((x) => ({ ...x, entregas_mes: resumenMes.entregasPorSocio[x.id] || 0 })) || []

  return (
    <main className="container mx-auto px-4 py-8">
      <ExternosManager
        initialExternos={externosConEntregas}
        maxEntregasMes={config?.max_entregas_externo_mes ?? 3}
      />
    </main>
  )
}
