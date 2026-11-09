-- Automatizaciones: push al celular cuando un equipo no pudo cumplir una orden
-- (comando "fallido" o "timeout", lo mismo que la alerta roja de la pantalla).
--
-- NO SE EJECUTÓ TODAVÍA. Correr antes de publicar la app que lo usa.
--
-- falla_notificada_en: cuándo se avisó de la falla actual del equipo. Con la
-- notebook apagada la regla reintenta cada pocos minutos y cada intento vence
-- de nuevo: esta columna hace que llegue un solo aviso por falla. Vuelve a
-- NULL cuando el equipo cumple una orden (lib/automations/aviso-fallas.ts).
--
-- Script idempotente, envuelto en una transacción.

BEGIN;

ALTER TABLE public.dispositivos_controlables
  ADD COLUMN IF NOT EXISTS falla_notificada_en TIMESTAMPTZ;

COMMIT;

-- =============================================================================
-- VERIFICACIÓN Y ROLLBACK
-- =============================================================================
--   Equipos con una falla ya avisada:
--   SELECT nombre, ultimo_comando_estado, falla_notificada_en
--   FROM public.dispositivos_controlables WHERE falla_notificada_en IS NOT NULL;
--
--   Volver atrás: publicar la versión anterior de la app y después
--   ALTER TABLE public.dispositivos_controlables DROP COLUMN falla_notificada_en;
