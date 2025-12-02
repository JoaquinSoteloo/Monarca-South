-- Agregar gramos_mensuales directamente en socios y remover dependencia de membresias
ALTER TABLE socios ADD COLUMN IF NOT EXISTS gramos_mensuales INTEGER DEFAULT 30;

-- Migrar datos existentes de membresías a la nueva columna
UPDATE socios s
SET gramos_mensuales = m.gramos_mensuales
FROM membresias m
WHERE s.membresia_id = m.id;

-- Remover la columna membresia_id (opcional, se puede mantener por compatibilidad)
-- ALTER TABLE socios DROP COLUMN membresia_id;
