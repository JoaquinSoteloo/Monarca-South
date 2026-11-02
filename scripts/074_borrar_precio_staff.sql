-- Borra las columnas de precio staff que agregó 072: el precio para las
-- retribuciones en producto es el de Miembro (073).
--
-- Correr DESPUÉS de publicar el frontend sin la fila Staff: hasta entonces la
-- app publicada las manda al guardar una genética.

BEGIN;

ALTER TABLE public.geneticas
  DROP COLUMN IF EXISTS precio_gramo_staff,
  DROP COLUMN IF EXISTS precio_enrolado_staff;

COMMIT;
