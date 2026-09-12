-- Etapa 3B de seguridad (RLS) — ROLLBACK.
--
-- NO SE EJECUTÓ TODAVÍA. Usar solo si, después de correr
-- 055_rls_hardening_business_add.sql y/o
-- 056_rls_hardening_business_drop_old.sql, algo se rompe y hace falta volver
-- exactamente al estado anterior (RLS habilitada pero abierta a
-- anon+authenticated) mientras se investiga.
--
-- No re-ejecuta los scripts históricos completos (035, 036, 038): esos
-- mezclan DDL/seed con las policies (ej. 038 también hace INSERT del usuario
-- admin) y volver a correrlos podría reinsertar datos o fallar por objetos
-- que ya existen. Este script contiene ÚNICAMENTE las policies viejas,
-- extraídas verbatim, más el DROP de las nuevas.
--
-- Es seguro correr esto en cualquier momento (antes o después del paso 2):
-- las policies son aditivas — mientras una tabla tenga AL MENOS una policy
-- permissive que autorice una operación para un rol, esa operación funciona,
-- sin importar cuántas otras policies (nuevas o viejas) también existan.
--
-- Incluye también el rollback de usuarios_admin: restaura sus dos sets de
-- policies históricos (036 y 038) tal como coexistían antes de este cambio.
--
-- Script idempotente: cada CREATE POLICY va precedido de su propio
-- DROP POLICY IF EXISTS, así se puede re-correr sin error si se cortó a
-- mitad de camino. Envuelto en una transacción (BEGIN/COMMIT).

BEGIN;

-- 1) Restaurar las policies abiertas originales (idénticas a como estaban).

DROP POLICY IF EXISTS "Permitir lectura publica membresias" ON public.membresias;
CREATE POLICY "Permitir lectura publica membresias" ON public.membresias FOR SELECT USING (true);
DROP POLICY IF EXISTS "Permitir insert publico membresias" ON public.membresias;
CREATE POLICY "Permitir insert publico membresias" ON public.membresias FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Permitir update publico membresias" ON public.membresias;
CREATE POLICY "Permitir update publico membresias" ON public.membresias FOR UPDATE USING (true);
DROP POLICY IF EXISTS "Permitir delete publico membresias" ON public.membresias;
CREATE POLICY "Permitir delete publico membresias" ON public.membresias FOR DELETE USING (true);

DROP POLICY IF EXISTS "Permitir lectura publica geneticas" ON public.geneticas;
CREATE POLICY "Permitir lectura publica geneticas" ON public.geneticas FOR SELECT USING (true);
DROP POLICY IF EXISTS "Permitir insercion publica geneticas" ON public.geneticas;
CREATE POLICY "Permitir insercion publica geneticas" ON public.geneticas FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Permitir actualizacion publica geneticas" ON public.geneticas;
CREATE POLICY "Permitir actualizacion publica geneticas" ON public.geneticas FOR UPDATE USING (true);
DROP POLICY IF EXISTS "Permitir eliminacion publica geneticas" ON public.geneticas;
CREATE POLICY "Permitir eliminacion publica geneticas" ON public.geneticas FOR DELETE USING (true);

DROP POLICY IF EXISTS "Permitir lectura publica ventas" ON public.ventas;
CREATE POLICY "Permitir lectura publica ventas" ON public.ventas FOR SELECT USING (true);
DROP POLICY IF EXISTS "Permitir insert publico ventas" ON public.ventas;
CREATE POLICY "Permitir insert publico ventas" ON public.ventas FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Permitir update publico ventas" ON public.ventas;
CREATE POLICY "Permitir update publico ventas" ON public.ventas FOR UPDATE USING (true);
DROP POLICY IF EXISTS "Permitir delete publico ventas" ON public.ventas;
CREATE POLICY "Permitir delete publico ventas" ON public.ventas FOR DELETE USING (true);

DROP POLICY IF EXISTS "Permitir lectura publica detalle_venta" ON public.detalle_venta;
CREATE POLICY "Permitir lectura publica detalle_venta" ON public.detalle_venta FOR SELECT USING (true);
DROP POLICY IF EXISTS "Permitir insert publico detalle_venta" ON public.detalle_venta;
CREATE POLICY "Permitir insert publico detalle_venta" ON public.detalle_venta FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Permitir update publico detalle_venta" ON public.detalle_venta;
CREATE POLICY "Permitir update publico detalle_venta" ON public.detalle_venta FOR UPDATE USING (true);
DROP POLICY IF EXISTS "Permitir delete publico detalle_venta" ON public.detalle_venta;
CREATE POLICY "Permitir delete publico detalle_venta" ON public.detalle_venta FOR DELETE USING (true);

DROP POLICY IF EXISTS "Permitir lectura publica sucursales" ON public.sucursales;
CREATE POLICY "Permitir lectura publica sucursales" ON public.sucursales FOR SELECT USING (true);
DROP POLICY IF EXISTS "Permitir insert publico sucursales" ON public.sucursales;
CREATE POLICY "Permitir insert publico sucursales" ON public.sucursales FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Permitir update publico sucursales" ON public.sucursales;
CREATE POLICY "Permitir update publico sucursales" ON public.sucursales FOR UPDATE USING (true);
DROP POLICY IF EXISTS "Permitir delete publico sucursales" ON public.sucursales;
CREATE POLICY "Permitir delete publico sucursales" ON public.sucursales FOR DELETE USING (true);

DROP POLICY IF EXISTS "Permitir lectura publica gastos" ON public.gastos;
CREATE POLICY "Permitir lectura publica gastos" ON public.gastos FOR SELECT USING (true);
DROP POLICY IF EXISTS "Permitir insert publico gastos" ON public.gastos;
CREATE POLICY "Permitir insert publico gastos" ON public.gastos FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Permitir update publico gastos" ON public.gastos;
CREATE POLICY "Permitir update publico gastos" ON public.gastos FOR UPDATE USING (true);
DROP POLICY IF EXISTS "Permitir delete publico gastos" ON public.gastos;
CREATE POLICY "Permitir delete publico gastos" ON public.gastos FOR DELETE USING (true);

DROP POLICY IF EXISTS "Permitir lectura publica productos" ON public.productos;
CREATE POLICY "Permitir lectura publica productos" ON public.productos FOR SELECT USING (true);
DROP POLICY IF EXISTS "Permitir insert publico productos" ON public.productos;
CREATE POLICY "Permitir insert publico productos" ON public.productos FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Permitir update publico productos" ON public.productos;
CREATE POLICY "Permitir update publico productos" ON public.productos FOR UPDATE USING (true);
DROP POLICY IF EXISTS "Permitir delete publico productos" ON public.productos;
CREATE POLICY "Permitir delete publico productos" ON public.productos FOR DELETE USING (true);

DROP POLICY IF EXISTS "Permitir lectura publica pagos" ON public.pagos;
CREATE POLICY "Permitir lectura publica pagos" ON public.pagos FOR SELECT USING (true);
DROP POLICY IF EXISTS "Permitir insert publico pagos" ON public.pagos;
CREATE POLICY "Permitir insert publico pagos" ON public.pagos FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Permitir update publico pagos" ON public.pagos;
CREATE POLICY "Permitir update publico pagos" ON public.pagos FOR UPDATE USING (true);
DROP POLICY IF EXISTS "Permitir delete publico pagos" ON public.pagos;
CREATE POLICY "Permitir delete publico pagos" ON public.pagos FOR DELETE USING (true);

-- usuarios_admin: restaurar los dos sets históricos que coexistían (036 y 038).
DROP POLICY IF EXISTS "Permitir lectura publica usuarios_admin" ON public.usuarios_admin;
CREATE POLICY "Permitir lectura publica usuarios_admin" ON public.usuarios_admin FOR SELECT USING (true);
DROP POLICY IF EXISTS "Permitir insert publico usuarios_admin" ON public.usuarios_admin;
CREATE POLICY "Permitir insert publico usuarios_admin" ON public.usuarios_admin FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Permitir update publico usuarios_admin" ON public.usuarios_admin;
CREATE POLICY "Permitir update publico usuarios_admin" ON public.usuarios_admin FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Allow select usuarios_admin" ON public.usuarios_admin;
CREATE POLICY "Allow select usuarios_admin" ON public.usuarios_admin FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow insert usuarios_admin" ON public.usuarios_admin;
CREATE POLICY "Allow insert usuarios_admin" ON public.usuarios_admin FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Allow update usuarios_admin" ON public.usuarios_admin;
CREATE POLICY "Allow update usuarios_admin" ON public.usuarios_admin FOR UPDATE USING (true);

-- 2) Eliminar las policies nuevas (si llegaron a crearse con
--    055_rls_hardening_business_add.sql).
DROP POLICY IF EXISTS "authenticated_all_membresias" ON public.membresias;
DROP POLICY IF EXISTS "authenticated_all_geneticas" ON public.geneticas;
DROP POLICY IF EXISTS "authenticated_all_ventas" ON public.ventas;
DROP POLICY IF EXISTS "authenticated_all_detalle_venta" ON public.detalle_venta;
DROP POLICY IF EXISTS "authenticated_all_sucursales" ON public.sucursales;
DROP POLICY IF EXISTS "authenticated_all_gastos" ON public.gastos;
DROP POLICY IF EXISTS "authenticated_all_productos" ON public.productos;
DROP POLICY IF EXISTS "authenticated_all_pagos" ON public.pagos;

COMMIT;

-- No hace falta tocar ningún archivo .ts/.tsx para este rollback: el service
-- role (si algún endpoint lo usara) bypassa RLS de cualquier forma, y el
-- resto de la app sigue autenticando igual con las policies viejas
-- restauradas.
