-- Fase A, paso 2 — cerrar el acceso directo a las funciones viejas.
--
-- Correr DESPUÉS de publicar el frontend que usa registrar_entrega /
-- editar_entrega (scripts/066). Antes de eso la app publicada todavía llama a
-- registrar_venta / editar_venta, y este script la dejaría sin poder
-- registrar ni editar entregas.
--
-- Desde acá registrar_venta/editar_venta sólo se ejecutan desde adentro de
-- registrar_entrega/editar_entrega (SECURITY DEFINER, dueño postgres), así
-- nadie se saltea las reglas de entrega llamándolas directo.
--
-- Hasta este script, `anon` (la clave pública) también podía ejecutarlas: los
-- scripts 062 y 065 revocaban sólo a PUBLIC, pero Supabase otorga EXECUTE a
-- anon/authenticated por defecto en el esquema public.
--
-- Si en el futuro se re-corre 062 o 065, vuelven a otorgar EXECUTE a
-- authenticated: re-correr este script después.
--
-- Rollback (si hubiera que volver al frontend anterior):
--   GRANT EXECUTE ON FUNCTION public.registrar_venta(uuid, jsonb, numeric, numeric, text, timestamptz) TO authenticated;
--   GRANT EXECUTE ON FUNCTION public.editar_venta(uuid, uuid, jsonb, text, timestamptz) TO authenticated;
--   GRANT EXECUTE ON FUNCTION public.eliminar_venta(uuid) TO authenticated;

BEGIN;

REVOKE EXECUTE ON FUNCTION public.registrar_venta(uuid, jsonb, numeric, numeric, text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.editar_venta(uuid, uuid, jsonb, text, timestamptz) FROM PUBLIC, anon, authenticated;
-- Desde 068 la app elimina con eliminar_entrega, que separa los dos stocks.
REVOKE EXECUTE ON FUNCTION public.eliminar_venta(uuid) FROM PUBLIC, anon, authenticated;

COMMIT;
