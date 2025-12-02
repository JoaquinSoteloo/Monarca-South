-- Script para limpiar los puntos de los DNI existentes
-- Ejecutar este script para normalizar todos los DNI en la base de datos

UPDATE socios
SET dni = REPLACE(REPLACE(dni, '.', ''), ' ', '')
WHERE dni LIKE '%.%' OR dni LIKE '% %';

-- Verificar los DNI actualizados
SELECT id, nombre, apellido, dni FROM socios ORDER BY apellido, nombre;
