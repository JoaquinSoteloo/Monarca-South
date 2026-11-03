-- Chat: cada mensaje nuevo manda una notificación push al celular de quien
-- corresponde.
--
-- NO SE EJECUTÓ TODAVÍA. Correr a mano en el SQL Editor de Supabase, después
-- de 088_sede_chat_asistente.sql (no depende de 089). Correrlo ANTES de
-- publicar la app que lo usa: esa versión guarda user_id al activar las
-- notificaciones. Mientras tanto el trigger llama a una ruta que todavía no
-- existe, no sale ningún push y los mensajes se guardan igual.
--
-- 1) push_subscriptions.user_id: de quién es cada aparato (usuario de
--    Supabase Auth, el mismo id que equipo_perfiles). Lo guarda
--    /api/push/subscribe con la sesión. Los aparatos que ya estaban activados
--    quedan sin dueño hasta que esa persona vuelva a abrir la app: ahí se
--    registran solos a su nombre (hooks/use-push-subscription.ts). Modo
--    Ausente sigue mandando a todos los aparatos, tengan dueño o no.
--
-- 2) Trigger en mensajes: cada mensaje nuevo, venga del Chat, de Equipo, de
--    un comentario de tarea o de la Sede 3D, le pide a la app que mande el
--    push (POST /api/chat/notificar con pg_net, con los mismos secretos de
--    Vault que el motor, script 085). A quién y qué dice lo decide la app
--    (lib/chat-push.ts). pg_net manda el pedido recién cuando se confirma la
--    transacción: si el mensaje no se guarda, no sale nada.
--
-- Script idempotente, envuelto en una transacción.

BEGIN;

-- 1. De quién es cada aparato ------------------------------------------------
ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS push_subscriptions_user_id_idx ON public.push_subscriptions (user_id);

-- 2. Avisar a la app de cada mensaje nuevo -----------------------------------
CREATE OR REPLACE FUNCTION public.mensajes_avisar_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_url text;
  v_secreto text;
BEGIN
  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'monarca_app_url';
  SELECT decrypted_secret INTO v_secreto FROM vault.decrypted_secrets WHERE name = 'automations_cron_secret';
  IF v_url IS NULL OR v_secreto IS NULL THEN
    RAISE NOTICE 'Faltan los secretos monarca_app_url / automations_cron_secret en Vault';
    RETURN NULL;
  END IF;

  PERFORM net.http_post(
    url := rtrim(v_url, '/') || '/api/chat/notificar',
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secreto, 'Content-Type', 'application/json'),
    body := jsonb_build_object('mensaje_id', NEW.id),
    timeout_milliseconds := 15000
  );
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  -- Un push que no sale nunca puede impedir que se guarde el mensaje.
  RAISE WARNING 'No se pudo pedir el push del mensaje %: %', NEW.id, SQLERRM;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.mensajes_avisar_push() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS mensajes_avisar_push_trg ON public.mensajes;
CREATE TRIGGER mensajes_avisar_push_trg
  AFTER INSERT ON public.mensajes
  FOR EACH ROW EXECUTE FUNCTION public.mensajes_avisar_push();

COMMIT;

-- =============================================================================
-- VERIFICACIÓN Y ROLLBACK
-- =============================================================================
--   Lo que respondió la app a cada mensaje (destinatarios y push enviados):
--   SELECT status_code, content, created FROM net._http_response
--   WHERE content LIKE '%"mensaje"%' ORDER BY created DESC LIMIT 5;
--
--   Aparatos y de quién son:
--   SELECT s.id, p.nombre, s.device_label, s.enabled, s.last_seen_at
--   FROM public.push_subscriptions s LEFT JOIN public.perfiles p ON p.user_id = s.user_id;
--
--   Apagar los push del Chat:  DROP TRIGGER mensajes_avisar_push_trg ON public.mensajes;
