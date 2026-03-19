-- Agregar políticas RLS para todas las tablas principales

-- VENTAS
ALTER TABLE ventas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir lectura publica ventas" ON ventas;
DROP POLICY IF EXISTS "Permitir insert publico ventas" ON ventas;
DROP POLICY IF EXISTS "Permitir update publico ventas" ON ventas;
DROP POLICY IF EXISTS "Permitir delete publico ventas" ON ventas;

CREATE POLICY "Permitir lectura publica ventas" ON ventas FOR SELECT USING (true);
CREATE POLICY "Permitir insert publico ventas" ON ventas FOR INSERT WITH CHECK (true);
CREATE POLICY "Permitir update publico ventas" ON ventas FOR UPDATE USING (true);
CREATE POLICY "Permitir delete publico ventas" ON ventas FOR DELETE USING (true);

-- SOCIOS
ALTER TABLE socios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir lectura publica socios" ON socios;
DROP POLICY IF EXISTS "Permitir insert publico socios" ON socios;
DROP POLICY IF EXISTS "Permitir update publico socios" ON socios;
DROP POLICY IF EXISTS "Permitir delete publico socios" ON socios;

CREATE POLICY "Permitir lectura publica socios" ON socios FOR SELECT USING (true);
CREATE POLICY "Permitir insert publico socios" ON socios FOR INSERT WITH CHECK (true);
CREATE POLICY "Permitir update publico socios" ON socios FOR UPDATE USING (true);
CREATE POLICY "Permitir delete publico socios" ON socios FOR DELETE USING (true);

-- MEMBRESIAS
ALTER TABLE membresias ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir lectura publica membresias" ON membresias;
DROP POLICY IF EXISTS "Permitir insert publico membresias" ON membresias;
DROP POLICY IF EXISTS "Permitir update publico membresias" ON membresias;
DROP POLICY IF EXISTS "Permitir delete publico membresias" ON membresias;

CREATE POLICY "Permitir lectura publica membresias" ON membresias FOR SELECT USING (true);
CREATE POLICY "Permitir insert publico membresias" ON membresias FOR INSERT WITH CHECK (true);
CREATE POLICY "Permitir update publico membresias" ON membresias FOR UPDATE USING (true);
CREATE POLICY "Permitir delete publico membresias" ON membresias FOR DELETE USING (true);

-- DETALLE_VENTA
ALTER TABLE detalle_venta ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir lectura publica detalle_venta" ON detalle_venta;
DROP POLICY IF EXISTS "Permitir insert publico detalle_venta" ON detalle_venta;
DROP POLICY IF EXISTS "Permitir update publico detalle_venta" ON detalle_venta;
DROP POLICY IF EXISTS "Permitir delete publico detalle_venta" ON detalle_venta;

CREATE POLICY "Permitir lectura publica detalle_venta" ON detalle_venta FOR SELECT USING (true);
CREATE POLICY "Permitir insert publico detalle_venta" ON detalle_venta FOR INSERT WITH CHECK (true);
CREATE POLICY "Permitir update publico detalle_venta" ON detalle_venta FOR UPDATE USING (true);
CREATE POLICY "Permitir delete publico detalle_venta" ON detalle_venta FOR DELETE USING (true);

-- PAGOS
ALTER TABLE pagos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir lectura publica pagos" ON pagos;
DROP POLICY IF EXISTS "Permitir insert publico pagos" ON pagos;
DROP POLICY IF EXISTS "Permitir update publico pagos" ON pagos;
DROP POLICY IF EXISTS "Permitir delete publico pagos" ON pagos;

CREATE POLICY "Permitir lectura publica pagos" ON pagos FOR SELECT USING (true);
CREATE POLICY "Permitir insert publico pagos" ON pagos FOR INSERT WITH CHECK (true);
CREATE POLICY "Permitir update publico pagos" ON pagos FOR UPDATE USING (true);
CREATE POLICY "Permitir delete publico pagos" ON pagos FOR DELETE USING (true);

-- PRODUCTOS
ALTER TABLE productos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir lectura publica productos" ON productos;
DROP POLICY IF EXISTS "Permitir insert publico productos" ON productos;
DROP POLICY IF EXISTS "Permitir update publico productos" ON productos;
DROP POLICY IF EXISTS "Permitir delete publico productos" ON productos;

CREATE POLICY "Permitir lectura publica productos" ON productos FOR SELECT USING (true);
CREATE POLICY "Permitir insert publico productos" ON productos FOR INSERT WITH CHECK (true);
CREATE POLICY "Permitir update publico productos" ON productos FOR UPDATE USING (true);
CREATE POLICY "Permitir delete publico productos" ON productos FOR DELETE USING (true);

-- SUCURSALES
ALTER TABLE sucursales ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir lectura publica sucursales" ON sucursales;
DROP POLICY IF EXISTS "Permitir insert publico sucursales" ON sucursales;
DROP POLICY IF EXISTS "Permitir update publico sucursales" ON sucursales;
DROP POLICY IF EXISTS "Permitir delete publico sucursales" ON sucursales;

CREATE POLICY "Permitir lectura publica sucursales" ON sucursales FOR SELECT USING (true);
CREATE POLICY "Permitir insert publico sucursales" ON sucursales FOR INSERT WITH CHECK (true);
CREATE POLICY "Permitir update publico sucursales" ON sucursales FOR UPDATE USING (true);
CREATE POLICY "Permitir delete publico sucursales" ON sucursales FOR DELETE USING (true);

-- GASTOS
ALTER TABLE gastos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir lectura publica gastos" ON gastos;
DROP POLICY IF EXISTS "Permitir insert publico gastos" ON gastos;
DROP POLICY IF EXISTS "Permitir update publico gastos" ON gastos;
DROP POLICY IF EXISTS "Permitir delete publico gastos" ON gastos;

CREATE POLICY "Permitir lectura publica gastos" ON gastos FOR SELECT USING (true);
CREATE POLICY "Permitir insert publico gastos" ON gastos FOR INSERT WITH CHECK (true);
CREATE POLICY "Permitir update publico gastos" ON gastos FOR UPDATE USING (true);
CREATE POLICY "Permitir delete publico gastos" ON gastos FOR DELETE USING (true);

-- USUARIOS_ADMIN
ALTER TABLE usuarios_admin ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir lectura publica usuarios_admin" ON usuarios_admin;
DROP POLICY IF EXISTS "Permitir insert publico usuarios_admin" ON usuarios_admin;
DROP POLICY IF EXISTS "Permitir update publico usuarios_admin" ON usuarios_admin;

CREATE POLICY "Permitir lectura publica usuarios_admin" ON usuarios_admin FOR SELECT USING (true);
CREATE POLICY "Permitir insert publico usuarios_admin" ON usuarios_admin FOR INSERT WITH CHECK (true);
CREATE POLICY "Permitir update publico usuarios_admin" ON usuarios_admin FOR UPDATE USING (true);
