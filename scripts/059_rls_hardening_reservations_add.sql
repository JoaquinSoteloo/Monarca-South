-- Etapa 3C de seguridad (RLS) — PASO 1 de 2: agregar.
--
-- NO SE EJECUTÓ TODAVÍA. Preparado para revisión manual y ejecución en el SQL
-- Editor de Supabase cuando se decida avanzar.
--
-- Alcance de esta etapa: socios, citas y config_citas — las tres tablas que
-- hoy tiene abiertas /reservar (ver 030, 031, 034, 036, y las policies
-- "Allow public ... on config_citas" creadas fuera de este repo). Las 8
-- tablas de negocio ya se trataron en la etapa 3B (scripts 055-057) y
-- cultivo/monitoreo/automatizaciones en la 3A (052-054). Storage queda fuera
-- de todas estas etapas.
--
-- Requisito previo: haber corrido 058_public_reservation_rpcs.sql. A partir
-- de este script, `anon` deja de poder leer/escribir `citas` y `socios`
-- directo — /reservar pasa a usar exclusivamente las 4 RPC de 058
-- (ver app/reservar/page.tsx). `config_citas` es la excepción: /reservar
-- necesita seguir leyéndola directo (hora_inicio/hora_fin/etc. para pintar
-- la grilla de horarios), así que se agrega una policy de SELECT para
-- `anon` además de la de `authenticated`.
--
-- Este script AGREGA las policies nuevas, exclusivas de `authenticated`
-- (y una de SELECT para `anon` en config_citas). Las policies viejas
-- (abiertas a anon) NO se tocan todavía — eso es
-- 060_rls_hardening_reservations_drop_old.sql, a correr recién después de
-- verificar que /reservar y la gestión de citas/socios logueada siguen
-- funcionando con las policies nuevas presentes.
--
-- Script idempotente: cada CREATE POLICY va precedido de su propio
-- DROP POLICY IF EXISTS, y ENABLE ROW LEVEL SECURITY es un no-op si ya
-- estaba habilitada. Envuelto en una transacción (BEGIN/COMMIT).

BEGIN;

ALTER TABLE public.socios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.citas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.config_citas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_all_socios" ON public.socios;
CREATE POLICY "authenticated_all_socios" ON public.socios
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_all_citas" ON public.citas;
CREATE POLICY "authenticated_all_citas" ON public.citas
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_all_config_citas" ON public.config_citas;
CREATE POLICY "authenticated_all_config_citas" ON public.config_citas
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- /reservar (sin sesión) sigue necesitando leer la configuración de horarios
-- directo desde el cliente para pintar la grilla y calcular el cutoff.
DROP POLICY IF EXISTS "anon_select_config_citas" ON public.config_citas;
CREATE POLICY "anon_select_config_citas" ON public.config_citas
  FOR SELECT TO anon USING (true);

COMMIT;

-- Después de correr esto: verificar que
--   1) /reservar (sin sesión) sigue mostrando la ocupación de hoy, permite
--      reservar y reprogramar (usa las RPC de 058 + esta policy de SELECT).
--   2) La gestión de citas/socios logueada (app/citas, app/socios,
--      components/citas-manager.tsx, components/socios-manager.tsx) sigue
--      funcionando igual.
-- Recién entonces correr 060_rls_hardening_reservations_drop_old.sql.
