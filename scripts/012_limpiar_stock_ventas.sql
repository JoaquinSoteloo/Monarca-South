-- =============================================
-- LIMPIAR STOCK Y VENTAS (MANTENER SOCIOS)
-- =============================================

-- Primero eliminar ventas (depende de geneticas y socios)
DELETE FROM ventas;

-- Luego eliminar stock/geneticas
DELETE FROM geneticas;

-- Confirmar limpieza
SELECT 'Ventas eliminadas' as resultado, COUNT(*) as total FROM ventas
UNION ALL
SELECT 'Genéticas eliminadas', COUNT(*) FROM geneticas
UNION ALL
SELECT 'Socios mantenidos', COUNT(*) FROM socios;
