-- Modificar el constraint para incluir 'no_asistio'
ALTER TABLE citas DROP CONSTRAINT IF EXISTS citas_estado_check;
ALTER TABLE citas ADD CONSTRAINT citas_estado_check 
  CHECK (estado IN ('confirmada', 'cancelada', 'atendida', 'no_asistio'));
