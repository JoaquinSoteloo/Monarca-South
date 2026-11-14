-- Nubi decide con IA: registro de cada decisión (observabilidad).
-- Pedido de Joaquín, 14/11/2026, aplicando lo del curso de AI Engineering.
--
-- EJECUTADO en producción el 14/11/2026, antes de publicar la app que lo usa.
--
-- Cada vez que Nubi evalúa una sala con equipos queda una fila: qué vio
-- (entrada), qué pensó (analisis), qué decidió (salida), si pasó los
-- guardrails (valida / motivo_rechazo), el modelo, los tokens y cuánto tardó.
-- fuente: 'ia' (motor), 'reglas' (respaldo si la IA no responde),
-- 'prueba' (Probar Nubi) o 'eval' (evals de escenarios).
--
-- Lee: cualquier usuario logueado (Control manual muestra las últimas).
-- Escribe: el motor y las rutas de Nubi, con service_role.
-- Script idempotente, envuelto en una transacción.

BEGIN;

CREATE TABLE IF NOT EXISTS public.nubi_decisiones (
  id BIGSERIAL PRIMARY KEY,
  creada_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  sala_id INTEGER REFERENCES public.salas_cultivo(id) ON DELETE SET NULL,
  fuente TEXT NOT NULL CHECK (fuente IN ('ia', 'reglas', 'prueba', 'eval')),
  modelo TEXT,
  entrada JSONB,
  salida JSONB,
  analisis TEXT,
  decision TEXT,
  valida BOOLEAN,
  motivo_rechazo TEXT,
  tokens_entrada INTEGER,
  tokens_salida INTEGER,
  latencia_ms INTEGER,
  propuesta_id BIGINT REFERENCES public.propuestas_nubi(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS nubi_decisiones_creada ON public.nubi_decisiones (creada_en DESC);

ALTER TABLE public.nubi_decisiones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "nubi_decisiones_leer" ON public.nubi_decisiones;
CREATE POLICY "nubi_decisiones_leer" ON public.nubi_decisiones
  FOR SELECT TO authenticated USING (true);

COMMIT;

-- =============================================================================
-- VERIFICACIÓN Y ROLLBACK
-- =============================================================================
--   SELECT creada_en, fuente, decision, valida, motivo_rechazo, tokens_entrada + tokens_salida AS tokens, latencia_ms, analisis
--   FROM public.nubi_decisiones ORDER BY creada_en DESC LIMIT 20;
--
--   Volver atrás: publicar la versión anterior de la app y después
--   DROP TABLE public.nubi_decisiones;
