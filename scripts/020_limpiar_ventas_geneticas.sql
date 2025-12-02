-- Script para borrar todas las ventas y genéticas
-- Mantiene: sucursales y socios

-- Primero borramos los detalles de venta (dependen de ventas y genéticas)
DELETE FROM detalle_venta;

-- Luego borramos las ventas
DELETE FROM ventas;

-- Finalmente borramos las genéticas
DELETE FROM geneticas;

-- Verificación
SELECT 'Ventas restantes:' as tabla, COUNT(*) as cantidad FROM ventas
UNION ALL
SELECT 'Detalles restantes:', COUNT(*) FROM detalle_venta
UNION ALL
SELECT 'Genéticas restantes:', COUNT(*) FROM geneticas
UNION ALL
SELECT 'Socios (mantenidos):', COUNT(*) FROM socios
UNION ALL
SELECT 'Sucursales (mantenidas):', COUNT(*) FROM sucursales;
