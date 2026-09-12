-- Etapa 3C de seguridad (RLS) — PASO 2 de 2: eliminar policies públicas viejas.
--
-- NO SE EJECUTÓ TODAVÍA. Correr SOLO después de:
--   1) Haber ejecutado 058_public_reservation_rpcs.sql y
--      059_rls_hardening_reservations_add.sql.
--   2) Haber verificado que /reservar (sin sesión) sigue funcionando
--      (ocupación de hoy, reservar, reprogramar) y que la gestión logueada
--      de citas/socios sigue igual.
--
-- A partir de este script, `anon` deja de tener acceso directo a `citas` y
-- `socios` (antes tenía lectura Y escritura completa sin sesión) y pierde
-- INSERT/UPDATE sobre `config_citas` (conserva SELECT, agregado en el paso
-- anterior). Si algo se rompe, usar
-- 061_rls_hardening_reservations_rollback.sql para volver atrás.
--
-- Nombres de policy tomados verbatim:
--   - citas: de 029_create_citas.sql / 030_citas_public_policies.sql /
--     031_citas_update_policy.sql (dos generaciones de "actualizacion" y
--     "eliminacion", con y sin tilde, que coexisten desde 031).
--   - socios: de 036_all_tables_policies.sql.
--   - config_citas: la tabla y sus policies no están en los scripts
--     versionados de este repo (se crearon directo en el SQL Editor /
--     dashboard de Supabase). Los nombres exactos ("Allow public insert/
--     select/update on config_citas") surgen de haberlos visto en
--     Supabase; si tu proyecto tiene nombres o condiciones distintas,
--     ajustá esta lista antes de correr el script — un DROP POLICY con un
--     nombre que no existe no falla (por el IF EXISTS), pero uno que sí
--     existe con OTRO nombre quedaría sin eliminar.

BEGIN;

-- citas
DROP POLICY IF EXISTS "Permitir actualizacion de citas" ON public.citas;
DROP POLICY IF EXISTS "Permitir actualización de citas" ON public.citas;
DROP POLICY IF EXISTS "Permitir eliminacion de citas" ON public.citas;
DROP POLICY IF EXISTS "Permitir eliminación de citas" ON public.citas;
DROP POLICY IF EXISTS "Permitir insercion publica de citas" ON public.citas;
DROP POLICY IF EXISTS "Permitir lectura publica de citas" ON public.citas;

-- config_citas
DROP POLICY IF EXISTS "Allow public insert on config_citas" ON public.config_citas;
DROP POLICY IF EXISTS "Allow public select on config_citas" ON public.config_citas;
DROP POLICY IF EXISTS "Allow public update on config_citas" ON public.config_citas;

-- socios
DROP POLICY IF EXISTS "Permitir delete publico socios" ON public.socios;
DROP POLICY IF EXISTS "Permitir insert publico socios" ON public.socios;
DROP POLICY IF EXISTS "Permitir lectura publica socios" ON public.socios;
DROP POLICY IF EXISTS "Permitir update publico socios" ON public.socios;

COMMIT;

-- Verificación: correr esto después del COMMIT. Resultado esperado:
--   - socios: solo "authenticated_all_socios".
--   - citas: solo "authenticated_all_citas".
--   - config_citas: "authenticated_all_config_citas" y
--     "anon_select_config_citas".
-- Además, repetir la verificación manual: /reservar sin sesión sigue
-- andando (vía las RPC + la policy de SELECT de config_citas), y un
-- request con SOLO la clave anon ya no puede leer ni escribir `citas` o
-- `socios` directo (401/permission denied, o 200 con 0 filas en un SELECT,
-- según cómo PostgREST lo reporte).
SELECT schemaname, tablename, policyname, roles, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('socios', 'citas', 'config_citas')
ORDER BY tablename, policyname;
