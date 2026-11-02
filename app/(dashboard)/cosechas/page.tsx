import { CosechasManager } from "@/components/cosechas-manager"
import { getServerSession } from "@/lib/auth/session"

export default async function CosechasPage() {
  const session = await getServerSession()
  return (
    <main className="container mx-auto px-4 py-8">
      <CosechasManager esComision={session?.rol === "comision"} />
    </main>
  )
}
