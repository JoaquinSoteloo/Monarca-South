-- Etapa 3C de seguridad (RLS) — ROLLBACK.
--
-- NO SE EJECUTÓ TODAVÍA. Usar solo si, después de correr
-- 059_rls_hardening_reservations_add.sql y/o
-- 060_rls_hardening_reservations_drop_old.sql, algo se rompe y hace falta
-- volver exactamente al estado anterior (RLS habilitada pero abierta a
-- anon+authenticated en socios/citas/config_citas) mientras se investiga.
--
-- No re-ejecuta los scripts históricos completos (030, 031, 034, 036): esos
-- mezclan DDL/seed con las policies y volver a correrlos podría fallar por
-- objetos que ya existen. Este script contiene ÚNICAMENTE las policies
-- viejas, extraídas verbatim (ver la misma advertencia sobre config_citas
-- en 060_rls_hardening_reservations_drop_old.sql: esa tabla no tiene script
-- de creación versionado en este repo, así que sus 3 policies se
-- reconstruyen con la forma estándar "abierta" usada en el resto del
-- proyecto — ajustá si tu proyecto real las tiene distintas), más el DROP
-- de las nuevas.
--
-- Es seguro correr esto en cualquier momento (antes o después del paso 2):
-- las policies son aditivas — mientras una tabla tenga AL MENOS una policy
-- permissive que autorice una operación para un rol, esa operación
-- funciona, sin importar cuántas otras policies (nuevas o viejas) también
-- existan.
--
-- Script idempotente: cada CREATE POLICY va precedido de su propio
-- DROP POLICY IF EXISTS, así se puede re-correr sin error si se cortó a
-- mitad de camino. Envuelto en una transacción (BEGIN/COMMIT).

BEGIN;

-- 1) Restaurar las policies abiertas originales (idénticas a como estaban).

-- citas (029/030/031)
DROP POLICY IF EXISTS "Permitir lectura publica de citas" ON public.citas;
CREATE POLICY "Permitir lectura publica de citas" ON public.citas FOR SELECT USING (true);

DROP POLICY IF EXISTS "Permitir insercion publica de citas" ON public.citas;
CREATE POLICY "Permitir insercion publica de citas" ON public.citas FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir actualizacion de citas" ON public.citas;
CREATE POLICY "Permitir actualizacion de citas" ON public.citas FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Permitir eliminacion de citas" ON public.citas;
CREATE POLICY "Permitir eliminacion de citas" ON public.citas FOR DELETE USING (true);

DROP POLICY IF EXISTS "Permitir actualización de citas" ON public.citas;
CREATE POLICY "Permitir actualización de citas" ON public.citas FOR UPDATE USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir eliminación de citas" ON public.citas;
CREATE POLICY "Permitir eliminación de citas" ON public.citas FOR DELETE USING (true);

-- config_citas (forma estándar abierta; ver advertencia arriba)
DROP POLICY IF EXISTS "Allow public select on config_citas" ON public.config_citas;
CREATE POLICY "Allow public select on config_citas" ON public.config_citas FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public insert on config_citas" ON public.config_citas;
CREATE POLICY "Allow public insert on config_citas" ON public.config_citas FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public update on config_citas" ON public.config_citas;
CREATE POLICY "Allow public update on config_citas" ON public.config_citas FOR UPDATE USING (true);

-- socios (036)
DROP POLICY IF EXISTS "Permitir lectura publica socios" ON public.socios;
CREATE POLICY "Permitir lectura publica socios" ON public.socios FOR SELECT USING (true);

DROP POLICY IF EXISTS "Permitir insert publico socios" ON public.socios;
CREATE POLICY "Permitir insert publico socios" ON public.socios FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir update publico socios" ON public.socios;
CREATE POLICY "Permitir update publico socios" ON public.socios FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Permitir delete publico socios" ON public.socios;
CREATE POLICY "Permitir delete publico socios" ON public.socios FOR DELETE USING (true);

-- 2) Eliminar las policies nuevas (si llegaron a crearse con
--    059_rls_hardening_reservations_add.sql).
DROP POLICY IF EXISTS "authenticated_all_socios" ON public.socios;
DROP POLICY IF EXISTS "authenticated_all_citas" ON public.citas;
DROP POLICY IF EXISTS "authenticated_all_config_citas" ON public.config_citas;
DROP POLICY IF EXISTS "anon_select_config_citas" ON public.config_citas;

COMMIT;

-- Este rollback deja las 4 RPC de 058_public_reservation_rpcs.sql
-- instaladas (no las toca): son inertes mientras app/reservar/page.tsx no
-- se revierta también a leer/escribir las tablas directo, y no representan
-- riesgo adicional por sí solas (siguen validando todo server-side). Si en
-- algún momento hiciera falta un rollback completo de la etapa 3C
-- (incluyendo las funciones), correr aparte:
--
--   DROP FUNCTION IF EXISTS public.citas_ocupacion_hoy();
--   DROP FUNCTION IF EXISTS public.mi_cita_hoy(text);
--   DROP FUNCTION IF EXISTS public.crear_reserva_publica(text, text, text, time);
--   DROP FUNCTION IF EXISTS public.reprogramar_reserva_publica(text, text, text, time);
--
-- (y revertir app/reservar/page.tsx a la versión previa a esta etapa, ya
-- que dejaría de tener a quién llamar).
