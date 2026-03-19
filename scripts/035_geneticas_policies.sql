-- Agregar políticas RLS para geneticas
ALTER TABLE geneticas ENABLE ROW LEVEL SECURITY;

-- Política para SELECT público
DROP POLICY IF EXISTS "Permitir lectura publica geneticas" ON geneticas;
CREATE POLICY "Permitir lectura publica geneticas" ON geneticas
  FOR SELECT USING (true);

-- Política para INSERT público
DROP POLICY IF EXISTS "Permitir insercion publica geneticas" ON geneticas;
CREATE POLICY "Permitir insercion publica geneticas" ON geneticas
  FOR INSERT WITH CHECK (true);

-- Política para UPDATE público
DROP POLICY IF EXISTS "Permitir actualizacion publica geneticas" ON geneticas;
CREATE POLICY "Permitir actualizacion publica geneticas" ON geneticas
  FOR UPDATE USING (true);

-- Política para DELETE público
DROP POLICY IF EXISTS "Permitir eliminacion publica geneticas" ON geneticas;
CREATE POLICY "Permitir eliminacion publica geneticas" ON geneticas
  FOR DELETE USING (true);
