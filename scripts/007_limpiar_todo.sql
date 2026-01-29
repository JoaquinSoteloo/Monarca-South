-- Script para limpiar todas las tablas antes de cargar datos nuevos
-- CUIDADO: Esto eliminará TODOS los datos existentes

-- Primero eliminar ventas (tiene referencias a socios y geneticas)
DELETE FROM ventas;

-- Luego eliminar socios (tiene referencia a membresias)
DELETE FROM socios;

-- Eliminar geneticas/stock
DELETE FROM geneticas;

-- Resetear secuencias solo si existen, usando TRUNCATE como alternativa
-- Usar TRUNCATE con RESTART IDENTITY es más seguro
TRUNCATE TABLE ventas RESTART IDENTITY CASCADE;
TRUNCATE TABLE socios RESTART IDENTITY CASCADE;
TRUNCATE TABLE geneticas RESTART IDENTITY CASCADE;
