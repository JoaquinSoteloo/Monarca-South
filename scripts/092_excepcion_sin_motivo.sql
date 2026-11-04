-- Excepciones a las reglas de entrega sin escribir motivo (pedido de Facundo, 04/11/2026).
--
-- NO SE EJECUTÓ TODAVÍA. Correr después de 084_roles_y_permisos.sql (y de 091).
-- Se puede volver a correr.
--
-- Antes, crear_autorizacion_entrega pedía un motivo de al menos 3 letras
-- (error VB005). Ahora el motivo es opcional: si viene vacío se guarda
-- "Sin motivo". Lo demás no cambia: sólo autoriza quien tiene el permiso
-- entregas.autorizar, queda registrado quién autorizó, la autorización es
-- de un solo uso y vence a los 15 minutos.

BEGIN;

DO $m$
DECLARE
  v_def text;
BEGIN
  v_def := pg_get_functiondef('public.crear_autorizacion_entrega(uuid, text)'::regprocedure);

  -- Sacar la comprobación del motivo (VB005).
  v_def := regexp_replace(
    v_def,
    'IF p_motivo IS NULL OR length\(trim\(p_motivo\)\) < 3 THEN\s+RAISE EXCEPTION ''Escribí el motivo de la excepción'' USING ERRCODE = ''VB005'';\s+END IF;\s+',
    ''
  );
  -- Motivo vacío → "Sin motivo".
  v_def := replace(v_def, 'VALUES (p_socio_id, trim(p_motivo),', 'VALUES (p_socio_id, COALESCE(NULLIF(trim(p_motivo), ''''), ''Sin motivo''),');

  IF position('VB005' IN v_def) > 0 OR position('''Sin motivo''' IN v_def) = 0 THEN
    RAISE EXCEPTION 'crear_autorizacion_entrega no tiene la forma esperada; no se cambió nada';
  END IF;
  EXECUTE v_def;
END
$m$;

COMMIT;

-- Verificación (con un usuario que tenga entregas.autorizar):
--   SELECT motivo FROM public.crear_autorizacion_entrega('<socio>', '');   -- → 'Sin motivo'
