-- Etapa 3B de seguridad (RLS) — PASO 2 de 2: eliminar policies públicas viejas.
--
-- NO SE EJECUTÓ TODAVÍA. Correr SOLO después de:
--   1) Haber ejecutado 055_rls_hardening_business_add.sql.
--   2) Haber verificado en la app (logueado) que ventas, membresías,
--      stock/productos, sucursales, gastos, pagos y genéticas siguen
--      funcionando igual.
--
-- A partir de este script, `anon` deja de tener acceso a estas 8 tablas de
-- negocio (antes tenía lectura Y escritura completa sin sesión). Si algo se
-- rompe, usar 057_rls_hardening_business_rollback.sql para volver atrás.
--
-- Nombres de policy tomados verbatim de los scripts originales:
-- 035_geneticas_policies.sql, 036_all_tables_policies.sql,
-- 038_create_admin_only.sql.
--
-- `usuarios_admin` ya no se usa: este script elimina TODAS sus policies
-- públicas (los dos sets que coexisten, de 036 y de 038) y no crea ninguna
-- policy nueva para ella.

BEGIN;

-- membresias
DROP POLICY IF EXISTS "Permitir lectura publica membresias" ON public.membresias;
DROP POLICY IF EXISTS "Permitir insert publico membresias" ON public.membresias;
DROP POLICY IF EXISTS "Permitir update publico membresias" ON public.membresias;
DROP POLICY IF EXISTS "Permitir delete publico membresias" ON public.membresias;

-- geneticas
DROP POLICY IF EXISTS "Permitir lectura publica geneticas" ON public.geneticas;
DROP POLICY IF EXISTS "Permitir insercion publica geneticas" ON public.geneticas;
DROP POLICY IF EXISTS "Permitir actualizacion publica geneticas" ON public.geneticas;
DROP POLICY IF EXISTS "Permitir eliminacion publica geneticas" ON public.geneticas;

-- ventas
DROP POLICY IF EXISTS "Permitir lectura publica ventas" ON public.ventas;
DROP POLICY IF EXISTS "Permitir insert publico ventas" ON public.ventas;
DROP POLICY IF EXISTS "Permitir update publico ventas" ON public.ventas;
DROP POLICY IF EXISTS "Permitir delete publico ventas" ON public.ventas;

-- detalle_venta
DROP POLICY IF EXISTS "Permitir lectura publica detalle_venta" ON public.detalle_venta;
DROP POLICY IF EXISTS "Permitir insert publico detalle_venta" ON public.detalle_venta;
DROP POLICY IF EXISTS "Permitir update publico detalle_venta" ON public.detalle_venta;
DROP POLICY IF EXISTS "Permitir delete publico detalle_venta" ON public.detalle_venta;

-- sucursales
DROP POLICY IF EXISTS "Permitir lectura publica sucursales" ON public.sucursales;
DROP POLICY IF EXISTS "Permitir insert publico sucursales" ON public.sucursales;
DROP POLICY IF EXISTS "Permitir update publico sucursales" ON public.sucursales;
DROP POLICY IF EXISTS "Permitir delete publico sucursales" ON public.sucursales;

-- gastos
DROP POLICY IF EXISTS "Permitir lectura publica gastos" ON public.gastos;
DROP POLICY IF EXISTS "Permitir insert publico gastos" ON public.gastos;
DROP POLICY IF EXISTS "Permitir update publico gastos" ON public.gastos;
DROP POLICY IF EXISTS "Permitir delete publico gastos" ON public.gastos;

-- productos
DROP POLICY IF EXISTS "Permitir lectura publica productos" ON public.productos;
DROP POLICY IF EXISTS "Permitir insert publico productos" ON public.productos;
DROP POLICY IF EXISTS "Permitir update publico productos" ON public.productos;
DROP POLICY IF EXISTS "Permitir delete publico productos" ON public.productos;

-- pagos
DROP POLICY IF EXISTS "Permitir lectura publica pagos" ON public.pagos;
DROP POLICY IF EXISTS "Permitir insert publico pagos" ON public.pagos;
DROP POLICY IF EXISTS "Permitir update publico pagos" ON public.pagos;
DROP POLICY IF EXISTS "Permitir delete publico pagos" ON public.pagos;

-- usuarios_admin (ya no se usa: se eliminan todas sus policies, no se crea ninguna nueva)
DROP POLICY IF EXISTS "Permitir lectura publica usuarios_admin" ON public.usuarios_admin;
DROP POLICY IF EXISTS "Permitir insert publico usuarios_admin" ON public.usuarios_admin;
DROP POLICY IF EXISTS "Permitir update publico usuarios_admin" ON public.usuarios_admin;
DROP POLICY IF EXISTS "Allow select usuarios_admin" ON public.usuarios_admin;
DROP POLICY IF EXISTS "Allow insert usuarios_admin" ON public.usuarios_admin;
DROP POLICY IF EXISTS "Allow update usuarios_admin" ON public.usuarios_admin;

COMMIT;

-- Verificación: correr esto después del COMMIT y confirmar que, para las 8
-- tablas de negocio, la única policy que queda por tabla es
-- "authenticated_all_*" (ninguna fila "Permitir ..." debería aparecer), y
-- que usuarios_admin no tiene NINGUNA fila (cero policies). Además: repetir
-- la verificación manual (UI logueada) y confirmar que un request con SOLO
-- la clave anon (sin sesión) ya no puede leer ni escribir estas tablas
-- (401/permission denied, o 200 con 0 filas en el caso de SELECT, según cómo
-- PostgREST lo reporte).
SELECT schemaname, tablename, policyname, roles, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'membresias',
    'geneticas',
    'ventas',
    'detalle_venta',
    'sucursales',
    'gastos',
    'productos',
    'pagos',
    'usuarios_admin'
  )
ORDER BY tablename, policyname;
