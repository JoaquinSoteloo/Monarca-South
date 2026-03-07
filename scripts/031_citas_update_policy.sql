-- Agregar política para permitir actualización de citas
-- Esto permite que los administradores actualicen el estado de las citas

CREATE POLICY "Permitir actualización de citas" ON citas
FOR UPDATE USING (true) WITH CHECK (true);

-- Agregar política para permitir eliminación de citas
CREATE POLICY "Permitir eliminación de citas" ON citas
FOR DELETE USING (true);
