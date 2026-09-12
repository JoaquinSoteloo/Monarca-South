-- Etapa 3B de seguridad (RLS) — PASO 1 de 2: agregar.
--
-- NO SE EJECUTÓ TODAVÍA. Preparado para revisión manual y ejecución en el SQL
-- Editor de Supabase cuando se decida avanzar.
--
-- Alcance de esta etapa: SOLO las 8 tablas de negocio (membresias, geneticas,
-- ventas, detalle_venta, sucursales, gastos, productos, pagos). Socios, citas,
-- config_citas, /reservar y Storage quedan fuera. Las tablas de cultivo/
-- monitoreo/automatizaciones ya se trataron en la etapa 3A (scripts 052-054).
--
-- Estas tablas hoy tienen RLS habilitada pero con policies USING(true) sin
-- `TO`, es decir abiertas a `anon` y `authenticated` por igual (ver scripts
-- 035, 036). Eso permite que cualquiera con la clave anon pública (visible en
-- el bundle del browser) lea o escriba directo sobre ventas, membresías,
-- pagos y stock sin sesión.
--
-- Este script AGREGA una policy nueva por tabla, exclusiva de `authenticated`
-- (el rol que ya usa el admin logueado, único usuario de la app). Las
-- policies viejas (abiertas a anon) NO se tocan todavía — eso es
-- 056_rls_hardening_business_drop_old.sql, a correr recién después de
-- verificar que la UI de ventas/socios/stock/caja sigue funcionando con estas
-- policies nuevas presentes.
--
-- `usuarios_admin` NO se toca en este script: esa tabla ya no se usa, así que
-- no recibe policy nueva (ver 056 y 057 para el resto de su tratamiento).
--
-- Script idempotente: cada CREATE POLICY va precedido de su propio
-- DROP POLICY IF EXISTS, así se puede re-correr sin error si se cortó a
-- mitad de camino. Envuelto en una transacción (BEGIN/COMMIT).

BEGIN;

DROP POLICY IF EXISTS "authenticated_all_membresias" ON public.membresias;
CREATE POLICY "authenticated_all_membresias" ON public.membresias
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_all_geneticas" ON public.geneticas;
CREATE POLICY "authenticated_all_geneticas" ON public.geneticas
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_all_ventas" ON public.ventas;
CREATE POLICY "authenticated_all_ventas" ON public.ventas
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_all_detalle_venta" ON public.detalle_venta;
CREATE POLICY "authenticated_all_detalle_venta" ON public.detalle_venta
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_all_sucursales" ON public.sucursales;
CREATE POLICY "authenticated_all_sucursales" ON public.sucursales
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_all_gastos" ON public.gastos;
CREATE POLICY "authenticated_all_gastos" ON public.gastos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_all_productos" ON public.productos;
CREATE POLICY "authenticated_all_productos" ON public.productos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_all_pagos" ON public.pagos;
CREATE POLICY "authenticated_all_pagos" ON public.pagos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;

-- Después de correr esto: verificar (logueado) que ventas, membresías,
-- stock/productos, sucursales, gastos, pagos y genéticas siguen andando
-- igual. Recién entonces correr 056_rls_hardening_business_drop_old.sql.
