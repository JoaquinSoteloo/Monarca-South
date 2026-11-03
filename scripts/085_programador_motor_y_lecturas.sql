-- Programador del motor de automatizaciones dentro de Supabase.
--
-- Hasta acá el motor (/api/automations/evaluate) lo llamaba un servicio
-- externo (cron-job.org) cada 1 minuto. Dejó de llamar a mediados de
-- septiembre de 2026: no se guardaban lecturas del Pulse, no corrían las
-- automatizaciones ni el chequeo de Modo Ausente.
--
-- 1) pg_cron + pg_net: cada 1 minuto Supabase llama al motor con la clave
--    AUTOMATIONS_CRON_SECRET. La clave y la URL de la app se guardan en Vault
--    (no quedan en el repo). Antes de que funcione hay que cargarlas UNA vez
--    en el SQL Editor de Supabase:
--
--      SELECT vault.create_secret('<AUTOMATIONS_CRON_SECRET de Vercel>', 'automations_cron_secret');
--      SELECT vault.create_secret('https://<dominio de la app>', 'monarca_app_url');
--
--    Para cambiarlas después: vault.update_secret(id, nuevo_valor).
--
-- 2) Lecturas repetidas: si el Pulse no actualizó, el motor volvía a guardar
--    la misma lectura cada minuto. Ahora se ignora una lectura con el mismo
--    dispositivo y la misma hora de lectura.
--
-- 3) Historial: lo del último mes queda completo; lo más viejo se resume en
--    un promedio por hora (resumen_hora = true), todos los días a las 04:00.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- =============================================================================
-- 1) Llamar al motor
-- =============================================================================

CREATE OR REPLACE FUNCTION public.disparar_motor_automatizaciones()
RETURNS bigint
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

  RETURN net.http_post(
    url := rtrim(v_url, '/') || '/api/automations/evaluate',
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secreto, 'Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
END;
$$;

REVOKE ALL ON FUNCTION public.disparar_motor_automatizaciones() FROM PUBLIC, anon, authenticated;

-- =============================================================================
-- 2) Lecturas repetidas
-- =============================================================================

ALTER TABLE public.lecturas_ambientales ADD COLUMN IF NOT EXISTS resumen_hora boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS lecturas_ambientales_dispositivo_leido_idx
  ON public.lecturas_ambientales (pulse_device_id, leido_en DESC);

CREATE OR REPLACE FUNCTION public.ignorar_lectura_repetida()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  -- Los resúmenes por hora los crea compactar_lecturas_ambientales en la misma
  -- sentencia que borra las lecturas que resume: no se comparan.
  IF NOT NEW.resumen_hora AND EXISTS (
    SELECT 1 FROM public.lecturas_ambientales
    WHERE pulse_device_id = NEW.pulse_device_id AND leido_en = NEW.leido_en
  ) THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS lecturas_ambientales_ignorar_repetida ON public.lecturas_ambientales;
CREATE TRIGGER lecturas_ambientales_ignorar_repetida
  BEFORE INSERT ON public.lecturas_ambientales
  FOR EACH ROW EXECUTE FUNCTION public.ignorar_lectura_repetida();

-- =============================================================================
-- 3) Resumir el historial viejo por hora
-- =============================================================================

CREATE OR REPLACE FUNCTION public.compactar_lecturas_ambientales()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_resumidas integer;
BEGIN
  WITH viejas AS (
    DELETE FROM public.lecturas_ambientales
    WHERE NOT resumen_hora AND leido_en < now() - interval '30 days'
    RETURNING *
  )
  INSERT INTO public.lecturas_ambientales (
    pulse_device_id, sala_id, temperatura_c, humedad_rh, vpd, luz_lux, presion_hpa, dew_point_c, leido_en, resumen_hora
  )
  SELECT pulse_device_id, max(sala_id), round(avg(temperatura_c), 2), round(avg(humedad_rh), 2), round(avg(vpd), 3),
         round(avg(luz_lux), 1), round(avg(presion_hpa), 2), round(avg(dew_point_c), 2),
         date_trunc('hour', leido_en), true
  FROM viejas
  GROUP BY pulse_device_id, date_trunc('hour', leido_en);
  GET DIAGNOSTICS v_resumidas = ROW_COUNT;
  RETURN v_resumidas;
END;
$$;

REVOKE ALL ON FUNCTION public.compactar_lecturas_ambientales() FROM PUBLIC, anon, authenticated;

-- =============================================================================
-- 4) Programación (UTC: 07:00 = 04:00 de Argentina)
-- =============================================================================

SELECT cron.schedule('motor-automatizaciones', '* * * * *', 'SELECT public.disparar_motor_automatizaciones()');
SELECT cron.schedule('compactar-lecturas-ambientales', '0 7 * * *', 'SELECT public.compactar_lecturas_ambientales()');

COMMIT;

-- =============================================================================
-- VERIFICACIÓN Y ROLLBACK
-- =============================================================================
--   SELECT jobname, schedule, active FROM cron.job;
--   SELECT status, return_message, start_time FROM cron.job_run_details ORDER BY start_time DESC LIMIT 5;
--   SELECT status_code, content, created FROM net._http_response ORDER BY created DESC LIMIT 5;
--
--   Pausar:   SELECT cron.unschedule('motor-automatizaciones');
