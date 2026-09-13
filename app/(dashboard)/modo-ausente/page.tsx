import { createClient } from "@/lib/supabase/server"
import { ModoAusenteManager } from "@/components/modo-ausente-manager"
import { getModoAusenteEstado, loadChecklist } from "@/lib/modo-ausente/engine"

export default async function ModoAusentePage() {
  const supabase = await createClient()
  const [estado, checklist] = await Promise.all([getModoAusenteEstado(supabase), loadChecklist(supabase)])

  return (
          <main className="container mx-auto px-4 py-8 space-y-6">
        <ModoAusenteManager initialEstado={estado} initialChecklist={checklist} />
      </main>
  )
}
