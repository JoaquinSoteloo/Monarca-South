import { createClient } from "@/lib/supabase/server"
import { getServerSession } from "@/lib/auth/session"
import { UsuariosManager } from "@/components/usuarios-manager"
import { RolesManager } from "@/components/roles-manager"
import { tienePermiso } from "@/lib/permisos"

export default async function UsuariosPage() {
  const session = await getServerSession()

  // Ver la pantalla lo controla el layout (usuarios.ver); administrar
  // usuarios, roles y permisos necesita usuarios.administrar.
  const puedeAdministrar = tienePermiso(session?.permisos, "usuarios.administrar")
  if (!session || !puedeAdministrar) {
    return (
      <main className="container mx-auto px-4 py-8">
        <h1 className="text-[26px] font-semibold leading-tight text-foreground">Usuarios</h1>
        <p className="mb-6 mt-2 text-sm text-muted-foreground">
          Tu rol puede ver los roles, pero no crear usuarios ni cambiar permisos.
        </p>
        <RolesManager puedeAdministrar={false} />
      </main>
    )
  }

  const supabase = await createClient()
  const { data: config } = await supabase
    .from("config_entregas")
    .select("tope_deuda, dias_max_pendiente, max_entregas_externo_mes")
    .maybeSingle()

  return (
    <main className="container mx-auto flex flex-col gap-6 px-4 py-8">
      <UsuariosManager
        usuarioActualId={session.id}
        initialConfig={{
          tope_deuda: Number(config?.tope_deuda ?? 120000),
          dias_max_pendiente: config?.dias_max_pendiente ?? 30,
          max_entregas_externo_mes: config?.max_entregas_externo_mes ?? 3,
        }}
      />
      <RolesManager puedeAdministrar />
    </main>
  )
}
