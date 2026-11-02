-- Renombra la tabla de retribuciones (072) de `equipo` a `retribuciones_equipo`.
--
-- `equipo` pasa a ser la tabla del equipo de trabajo (usuarios, tareas, avisos
-- y chat) que crea 077. La tabla de retribuciones estaba vacía al renombrarla.
--
-- liquidar_retribucion y anular_liquidacion usan la tabla con %ROWTYPE y en
-- consultas, que se resuelven por nombre: se recrean con el nombre nuevo.

BEGIN;

ALTER TABLE IF EXISTS public.equipo RENAME TO retribuciones_equipo;

ALTER POLICY equipo_comision ON public.retribuciones_equipo RENAME TO retribuciones_equipo_comision;

DO $m$
DECLARE
  v_fn regprocedure;
  v_def text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.liquidar_retribucion(uuid, date, date, numeric, text, uuid, numeric, integer, numeric, text)'::regprocedure,
    'public.anular_liquidacion(uuid)'::regprocedure
  ] LOOP
    v_def := pg_get_functiondef(v_fn);
    IF v_def !~ 'public\.equipo\M' THEN
      RAISE EXCEPTION 'La función % no usa public.equipo', v_fn;
    END IF;
    EXECUTE regexp_replace(v_def, 'public\.equipo\M', 'public.retribuciones_equipo', 'g');
  END LOOP;
END
$m$;

COMMIT;
