-- Guardián de luces (pedido de Joaquín, 13/11/2026).
--
-- Ejecutado en producción el 13/11/2026, antes de publicar la app que lo usa.
--
-- 1) Horario de luces de cada sala (salas_cultivo.luz_prende / luz_apaga).
--    Valores iniciales: los que midió el Pulse del 11 al 13/11, confirmados
--    por Joaquín. Se cambian en Ciclos al pasar una sala a flora.
-- 2) alertas_clima acepta la variable 'luz' (script 095):
--      lado 'alto' = luces prendidas en horario de oscuridad (lo más grave en flora)
--      lado 'bajo' = las luces no prendieron a su hora
--    El motor las abre y cierra (lib/guardian-luces.ts) y avisa por push.
--
-- Script idempotente, envuelto en una transacción.

BEGIN;

ALTER TABLE public.salas_cultivo
  ADD COLUMN IF NOT EXISTS luz_prende TIME,
  ADD COLUMN IF NOT EXISTS luz_apaga TIME;

UPDATE public.salas_cultivo SET luz_prende = '09:35', luz_apaga = '03:35' WHERE nombre = 'Sala 1' AND luz_prende IS NULL;
UPDATE public.salas_cultivo SET luz_prende = '10:00', luz_apaga = '22:00' WHERE nombre = 'Sala 2' AND luz_prende IS NULL;
UPDATE public.salas_cultivo SET luz_prende = '06:00', luz_apaga = '00:00' WHERE nombre = 'Sala 3' AND luz_prende IS NULL;
UPDATE public.salas_cultivo SET luz_prende = '09:00', luz_apaga = '03:00' WHERE nombre = 'Sala 4' AND luz_prende IS NULL;
UPDATE public.salas_cultivo SET luz_prende = '17:00', luz_apaga = '05:00' WHERE nombre = 'Sala 5' AND luz_prende IS NULL;

ALTER TABLE public.alertas_clima DROP CONSTRAINT IF EXISTS alertas_clima_variable_check;
ALTER TABLE public.alertas_clima
  ADD CONSTRAINT alertas_clima_variable_check CHECK (variable IN ('temperatura', 'humedad', 'luz'));

COMMIT;

-- =============================================================================
-- VERIFICACIÓN Y ROLLBACK
-- =============================================================================
--   SELECT nombre, luz_prende, luz_apaga FROM public.salas_cultivo ORDER BY nombre;
--
--   Volver atrás: publicar la versión anterior de la app y después
--   DELETE FROM public.alertas_clima WHERE variable = 'luz';
--   ALTER TABLE public.alertas_clima DROP CONSTRAINT alertas_clima_variable_check;
--   ALTER TABLE public.alertas_clima ADD CONSTRAINT alertas_clima_variable_check CHECK (variable IN ('temperatura', 'humedad'));
--   ALTER TABLE public.salas_cultivo DROP COLUMN luz_prende, DROP COLUMN luz_apaga;
