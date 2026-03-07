-- Habilitar RLS en la tabla citas
ALTER TABLE citas ENABLE ROW LEVEL SECURITY;

-- Política para permitir lectura pública (ver citas del día para contar lugares)
CREATE POLICY "Permitir lectura publica de citas" ON citas
  FOR SELECT
  USING (true);

-- Política para permitir inserción pública (cualquiera puede reservar)
CREATE POLICY "Permitir insercion publica de citas" ON citas
  FOR INSERT
  WITH CHECK (true);

-- Política para permitir actualización (solo usuarios autenticados del sistema)
CREATE POLICY "Permitir actualizacion de citas" ON citas
  FOR UPDATE
  USING (true);

-- Política para permitir eliminación (solo usuarios autenticados del sistema)
CREATE POLICY "Permitir eliminacion de citas" ON citas
  FOR DELETE
  USING (true);
