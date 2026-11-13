-- 098 — Riego: mediciones del pincho de EC (Bluelab) en las 2 testigo.
-- Desde el 16/11/2026 no se mide runoff en cada riego (decisión de Facundo y
-- Lucho, 10/11/2026): antes de regar se pincha cada testigo (humedad y EC del
-- sustrato) y 1 h después se mide la humedad. El runoff queda solo los jueves,
-- para el pH. Columnas opcionales: los riegos viejos quedan como están.
BEGIN;

ALTER TABLE public.registros_riego
  ADD COLUMN IF NOT EXISTS pincho_t1_humedad NUMERIC(4,1) CHECK (pincho_t1_humedad IS NULL OR pincho_t1_humedad BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS pincho_t1_ec NUMERIC(4,2) CHECK (pincho_t1_ec IS NULL OR pincho_t1_ec BETWEEN 0 AND 10),
  ADD COLUMN IF NOT EXISTS pincho_t2_humedad NUMERIC(4,1) CHECK (pincho_t2_humedad IS NULL OR pincho_t2_humedad BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS pincho_t2_ec NUMERIC(4,2) CHECK (pincho_t2_ec IS NULL OR pincho_t2_ec BETWEEN 0 AND 10),
  ADD COLUMN IF NOT EXISTS pincho_humedad_despues NUMERIC(4,1) CHECK (pincho_humedad_despues IS NULL OR pincho_humedad_despues BETWEEN 0 AND 100);

COMMIT;
