-- El historial del Pulse se guarda cada 5 minutos (pedido de Joaquín, 03/11/2026).
--
-- El motor sigue consultando el Pulse y evaluando las automatizaciones cada
-- 1 minuto (085). Para las reglas "sostenido durante X minutos" necesita las
-- lecturas recientes minuto a minuto, así que:
--
--   - últimas 2 horas: todas las lecturas (la regla más larga hoy es de 5 min);
--   - de 2 horas a 30 días: un promedio cada 5 minutos (resumen_5min);
--   - más de 30 días: un promedio por hora (resumen_hora).
--
-- compactar_lecturas_ambientales() pasa a correr cada hora.

BEGIN;

ALTER TABLE public.lecturas_ambientales ADD COLUMN IF NOT EXISTS resumen_5min boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.ignorar_lectura_repetida()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  -- Los resúmenes los crea compactar_lecturas_ambientales en la misma
  -- sentencia que borra las lecturas que resume: no se comparan.
  IF NOT NEW.resumen_hora AND NOT NEW.resumen_5min AND EXISTS (
    SELECT 1 FROM public.lecturas_ambientales
    WHERE pulse_device_id = NEW.pulse_device_id AND leido_en = NEW.leido_en
  ) THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.compactar_lecturas_ambientales()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_5min integer;
  v_hora integer;
BEGIN
  -- 1) Más de 2 horas: un promedio cada 5 minutos.
  WITH crudas AS (
    DELETE FROM public.lecturas_ambientales
    WHERE NOT resumen_hora AND NOT resumen_5min AND leido_en < now() - interval '2 hours'
    RETURNING *
  )
  INSERT INTO public.lecturas_ambientales (
    pulse_device_id, sala_id, temperatura_c, humedad_rh, vpd, luz_lux, presion_hpa, dew_point_c, leido_en, resumen_5min
  )
  SELECT pulse_device_id, max(sala_id), round(avg(temperatura_c), 2), round(avg(humedad_rh), 2), round(avg(vpd), 3),
         round(avg(luz_lux), 1), round(avg(presion_hpa), 2), round(avg(dew_point_c), 2),
         date_bin('5 minutes', leido_en, timestamptz '2000-01-01'), true
  FROM crudas
  GROUP BY pulse_device_id, date_bin('5 minutes', leido_en, timestamptz '2000-01-01');
  GET DIAGNOSTICS v_5min = ROW_COUNT;

  -- 2) Más de 30 días: un promedio por hora.
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
  GET DIAGNOSTICS v_hora = ROW_COUNT;

  RETURN v_5min + v_hora;
END;
$$;

REVOKE ALL ON FUNCTION public.compactar_lecturas_ambientales() FROM PUBLIC, anon, authenticated;

-- Cada hora, a los 5 minutos (reemplaza la corrida diaria de 085).
SELECT cron.schedule('compactar-lecturas-ambientales', '5 * * * *', 'SELECT public.compactar_lecturas_ambientales()');

COMMIT;
