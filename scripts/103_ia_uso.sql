-- Consumo de IA (pedido de Joaquín, 14/11/2026).
--
-- EJECUTADO en producción el 14/11/2026, antes de publicar la app que lo usa.
--
-- Cada llamada a un modelo (Nubi, evals, resumen semanal, asistente) deja una
-- fila: función, modelo, tokens de entrada (y cuántos salieron del caché, que
-- cobran mucho menos), tokens de salida, cuánto tardó y si respondió.
-- Lo escribe la app con service_role (lib/ia-uso.ts). Lo lee la comisión en
-- Control manual (la página filtra por rol; la política deja leer a cualquier
-- usuario logueado, como nubi_decisiones: no hay datos personales).
-- Script idempotente, envuelto en una transacción.

BEGIN;

CREATE TABLE IF NOT EXISTS public.ia_uso (
  id BIGSERIAL PRIMARY KEY,
  creada_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  funcion TEXT NOT NULL,
  modelo TEXT,
  tokens_entrada INTEGER,
  tokens_cache INTEGER,
  tokens_salida INTEGER,
  latencia_ms INTEGER,
  ok BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS ia_uso_creada ON public.ia_uso (creada_en DESC);

ALTER TABLE public.ia_uso ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ia_uso_leer" ON public.ia_uso;
CREATE POLICY "ia_uso_leer" ON public.ia_uso
  FOR SELECT TO authenticated USING (true);

-- Resumen por día y función, en hora de Argentina, para el panel.
CREATE OR REPLACE VIEW public.ia_uso_por_dia
WITH (security_invoker = true) AS
SELECT
  (creada_en AT TIME ZONE 'America/Argentina/Buenos_Aires')::date AS dia,
  funcion,
  count(*) AS llamadas,
  count(*) FILTER (WHERE NOT ok) AS fallidas,
  coalesce(sum(tokens_entrada), 0) AS tokens_entrada,
  coalesce(sum(tokens_cache), 0) AS tokens_cache,
  coalesce(sum(tokens_salida), 0) AS tokens_salida
FROM public.ia_uso
GROUP BY 1, 2;

COMMIT;

-- =============================================================================
-- VERIFICACIÓN Y ROLLBACK
-- =============================================================================
--   SELECT * FROM public.ia_uso_por_dia ORDER BY dia DESC, funcion;
--
--   Volver atrás: publicar la versión anterior de la app y después
--   DROP VIEW public.ia_uso_por_dia; DROP TABLE public.ia_uso;
