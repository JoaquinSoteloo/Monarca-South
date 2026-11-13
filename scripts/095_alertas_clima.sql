-- Alertas de clima: Nubi de verdad (pedido de Joaquín, 13/11/2026).
--
-- NO SE EJECUTÓ TODAVÍA. Correr antes de publicar la app que lo usa.
--
-- El motor (cada 5 minutos) compara el Pulse de cada sala con el rango de su
-- etapa (lib/clima-alertas.ts). Si lleva ~15 minutos fuera de rango, abre una
-- alerta acá y manda un push; cuando vuelve al rango la cierra y avisa.
-- Una alerta abierta por sala y variable (índice único parcial).
--
-- Lee: cualquier usuario logueado (la Sede 3D muestra las abiertas con Nubi).
-- Escribe: solo el motor, con service_role (sin políticas de escritura).
--
-- Script idempotente, envuelto en una transacción.

BEGIN;

CREATE TABLE IF NOT EXISTS public.alertas_clima (
  id BIGSERIAL PRIMARY KEY,
  sala_id INTEGER NOT NULL REFERENCES public.salas_cultivo(id) ON DELETE CASCADE,
  variable TEXT NOT NULL CHECK (variable IN ('temperatura', 'humedad')),
  lado TEXT NOT NULL CHECK (lado IN ('alto', 'bajo')),
  valor NUMERIC NOT NULL,
  limite NUMERIC NOT NULL,
  mensaje TEXT NOT NULL,
  desde TIMESTAMPTZ NOT NULL DEFAULT now(),
  notificada_en TIMESTAMPTZ,
  resuelta_en TIMESTAMPTZ,
  actualizada_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS alertas_clima_una_abierta
  ON public.alertas_clima (sala_id, variable) WHERE resuelta_en IS NULL;

ALTER TABLE public.alertas_clima ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "alertas_clima_leer" ON public.alertas_clima;
CREATE POLICY "alertas_clima_leer" ON public.alertas_clima
  FOR SELECT TO authenticated USING (true);

COMMIT;

-- =============================================================================
-- VERIFICACIÓN Y ROLLBACK
-- =============================================================================
--   Alertas abiertas:
--   SELECT s.nombre, a.mensaje, a.desde, a.notificada_en
--   FROM public.alertas_clima a JOIN public.salas_cultivo s ON s.id = a.sala_id
--   WHERE a.resuelta_en IS NULL;
--
--   Volver atrás: publicar la versión anterior de la app y después
--   DROP TABLE public.alertas_clima;
