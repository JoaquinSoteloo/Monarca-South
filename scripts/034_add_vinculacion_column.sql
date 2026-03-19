-- Agregar columna vinculacion si no existe
ALTER TABLE socios ADD COLUMN IF NOT EXISTS vinculacion TEXT CHECK (vinculacion IN ('Paciente', 'Autocultivador'));
