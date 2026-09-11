-- Suscripciones Web Push por dispositivo/navegador. Cada fila es una
-- suscripción PushSubscription del browser (endpoint único), asociada a la
-- sesión admin que la creó. Hoy solo existe una sesión ("admin"), pero el
-- CRUD (ver lib/push/subscriptions.ts) siempre filtra por `usuario` para que
-- el día que exista más de una sesión, ninguna pueda listar/borrar
-- suscripciones de otra.
--
-- A diferencia del resto de las tablas del proyecto (RLS abierta con
-- policies USING(true) y autorización real en los endpoints), esta tabla
-- guarda credenciales de push (endpoint + claves) y queda con RLS cerrada:
-- no se agregan policies para anon/authenticated, así que solo el rol
-- service_role (que tiene BYPASSRLS en Supabase) puede leerla o escribirla.
-- Ver lib/supabase/service.ts.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id BIGSERIAL PRIMARY KEY,
  usuario TEXT NOT NULL DEFAULT 'admin',
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  device_label TEXT,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS push_subscriptions_usuario_idx ON push_subscriptions (usuario);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
