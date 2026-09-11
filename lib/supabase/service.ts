import { createClient } from "@supabase/supabase-js"

// Cliente administrativo (service_role) — bypassea RLS. Usar SOLO desde
// código server-only (rutas API, libs de servidor) y solo para tablas que
// deliberadamente cerraron RLS a anon/authenticated (hoy: push_subscriptions).
// Nunca importar este archivo desde un componente cliente ni reusarlo como
// reemplazo del cliente normal (lib/supabase/server.ts): si se usa para otra
// tabla, hay que re-implementar acá mismo el gateo por sesión que en el resto
// de la app vive en las rutas.
export function createServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase URL y SUPABASE_SERVICE_ROLE_KEY son requeridos.")
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })
}
