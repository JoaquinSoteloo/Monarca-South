-- Función de agregación para graficar el histórico de lecturas_ambientales
-- (Monitoreo → gráficos de temperatura/humedad/VPD, últimas 24h / 7 días).
--
-- Por qué una función SQL y no traer filas crudas por PostgREST: con un
-- pinger externo corriendo el motor cada ~1 minuto, 7 días son hasta ~10.000
-- filas por dispositivo — demasiado para transportar y graficar. La función
-- agrupa en buckets de tiempo parejos (date_bin) y promedia server-side, así
-- el endpoint siempre devuelve un puñado de puntos sin importar cuántas
-- lecturas haya guardadas.
--
-- Solo lee lecturas_ambientales (ya cubierta por RLS "select true", mismo
-- criterio abierto que el resto del proyecto) — no necesita SECURITY DEFINER.
CREATE OR REPLACE FUNCTION historial_ambiental_bucketed(
  p_pulse_device_id INTEGER,
  p_desde TIMESTAMPTZ,
  p_hasta TIMESTAMPTZ,
  p_bucket_minutos INTEGER
)
RETURNS TABLE (
  bucket TIMESTAMPTZ,
  temperatura_c NUMERIC,
  humedad_rh NUMERIC,
  vpd NUMERIC,
  muestras BIGINT
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    date_bin(make_interval(mins => GREATEST(p_bucket_minutos, 1)), leido_en, p_desde) AS bucket,
    AVG(temperatura_c) AS temperatura_c,
    AVG(humedad_rh) AS humedad_rh,
    AVG(vpd) AS vpd,
    COUNT(*) AS muestras
  FROM lecturas_ambientales
  WHERE pulse_device_id = p_pulse_device_id
    AND leido_en >= p_desde
    AND leido_en <= p_hasta
  GROUP BY bucket
  ORDER BY bucket;
$$;

-- Las funciones no heredan RLS de las tablas que leen: PostgREST necesita
-- permiso explícito de ejecución para exponerla vía supabase.rpc(...).
GRANT EXECUTE ON FUNCTION historial_ambiental_bucketed(INTEGER, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER) TO anon, authenticated;
