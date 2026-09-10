-- Log de "por qué se disparó (o no) una regla" — separado del log de "qué
-- pasó con el comando de hardware" (comandos_dispositivo), relacionados por
-- FK opcional. Se inserta SOLO en transiciones relevantes (se disparó una
-- acción, se entró/salió de fail-safe, hubo un error evaluando) — no en cada
-- corrida del motor donde no pasó nada, para no inflar la tabla.
CREATE TABLE IF NOT EXISTS ejecuciones_automatizacion (
  id BIGSERIAL PRIMARY KEY,
  automatizacion_id INTEGER NOT NULL REFERENCES automatizaciones(id) ON DELETE CASCADE,
  tipo VARCHAR(15) NOT NULL CHECK (tipo IN ('encendido', 'apagado', 'fail_safe', 'error')),
  variable_valor NUMERIC,
  comando_id BIGINT REFERENCES comandos_dispositivo(id) ON DELETE SET NULL,
  mensaje TEXT,
  creado_en TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ejecuciones_automatizacion_automatizacion
  ON ejecuciones_automatizacion (automatizacion_id, creado_en DESC);

-- Habilitar RLS
ALTER TABLE ejecuciones_automatizacion ENABLE ROW LEVEL SECURITY;

-- Políticas RLS (mismo criterio "abierto" que el resto del proyecto)
DROP POLICY IF EXISTS "Allow select ejecuciones_automatizacion" ON ejecuciones_automatizacion;
CREATE POLICY "Allow select ejecuciones_automatizacion" ON ejecuciones_automatizacion FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow insert ejecuciones_automatizacion" ON ejecuciones_automatizacion;
CREATE POLICY "Allow insert ejecuciones_automatizacion" ON ejecuciones_automatizacion FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow update ejecuciones_automatizacion" ON ejecuciones_automatizacion;
CREATE POLICY "Allow update ejecuciones_automatizacion" ON ejecuciones_automatizacion FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Allow delete ejecuciones_automatizacion" ON ejecuciones_automatizacion;
CREATE POLICY "Allow delete ejecuciones_automatizacion" ON ejecuciones_automatizacion FOR DELETE USING (true);
