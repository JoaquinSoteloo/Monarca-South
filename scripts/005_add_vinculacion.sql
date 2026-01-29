-- Agregar campo vinculacion a la tabla socios
ALTER TABLE socios ADD COLUMN IF NOT EXISTS vinculacion TEXT CHECK (vinculacion IN ('Paciente', 'Autocultivador'));
