import { createServiceClient } from "@/lib/supabase/service"

export interface PushSubscriptionInput {
  endpoint: string
  keys: { p256dh: string; auth: string }
  userAgent?: string | null
  deviceLabel?: string | null
}

export interface PushSubscriptionRow {
  id: number
  usuario: string
  endpoint: string
  p256dh: string
  auth: string
  user_agent: string | null
  device_label: string | null
  enabled: boolean
  created_at: string
  last_seen_at: string
}

// Todo el CRUD queda filtrado por `usuario` (la sesión admin dueña de la
// suscripción) para que, el día que exista más de una sesión, ninguna pueda
// leer ni borrar suscripciones de otra — aunque hoy solo exista "admin".
export async function saveSubscription(usuario: string, input: PushSubscriptionInput): Promise<void> {
  const supabase = createServiceClient()

  const { error } = await supabase
    .from("push_subscriptions")
    .upsert(
      {
        usuario,
        endpoint: input.endpoint,
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
        user_agent: input.userAgent ?? null,
        device_label: input.deviceLabel ?? null,
        enabled: true,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "endpoint" },
    )

  if (error) {
    throw new Error(`No se pudo guardar la suscripción: ${error.message}`)
  }
}

export async function removeSubscription(usuario: string, endpoint: string): Promise<void> {
  const supabase = createServiceClient()

  const { error } = await supabase.from("push_subscriptions").delete().eq("usuario", usuario).eq("endpoint", endpoint)

  if (error) {
    throw new Error(`No se pudo eliminar la suscripción: ${error.message}`)
  }
}

// Sin filtro por usuario: la usa el motor de envío (lib/push/send.ts), que
// hoy manda a todos los dispositivos activos porque solo existe una sesión
// admin. El día que haya más de un usuario real, este es el punto para
// decidir a quién le corresponde cada notificación.
export async function listActiveSubscriptions(): Promise<PushSubscriptionRow[]> {
  const supabase = createServiceClient()

  const { data, error } = await supabase.from("push_subscriptions").select("*").eq("enabled", true)

  if (error) {
    throw new Error(`No se pudieron listar las suscripciones activas: ${error.message}`)
  }

  return data ?? []
}

export async function listDevices(usuario: string): Promise<PushSubscriptionRow[]> {
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("*")
    .eq("usuario", usuario)
    .order("created_at", { ascending: false })

  if (error) {
    throw new Error(`No se pudieron listar los dispositivos: ${error.message}`)
  }

  return data ?? []
}

export async function disableSubscription(endpoint: string): Promise<void> {
  const supabase = createServiceClient()
  await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint)
}
