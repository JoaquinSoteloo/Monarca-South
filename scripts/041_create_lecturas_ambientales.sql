-- Persistencia mínima de lecturas ambientales de Pulse Grow.
-- Hoy /api/pulse/devices consulta a Pulse en vivo y NUNCA persiste nada; esta
-- tabla es la primera. Se llena EXCLUSIVAMENTE desde
-- POST /api/automations/evaluate (cada corrida del motor persiste el snapshot
-- que ya trae de Pulse), no desde /api/pulse/devices, que sigue siendo
-- puramente de lectura en vivo.
--
-- Sirve para que el motor de automatizaciones evalúe condiciones "sostenidas
-- durante X minutos" contra timestamps reales (no contra un conteo de ticks
-- del cron), y para detectar huecos cuando Pulse deja de reportar: si una
-- lectura falla, simplemente no se inserta fila, y el hueco en la serie es la
-- señal.
CREATE TABLE IF NOT EXISTS lecturas_ambientales (
  id BIGSERIAL PRIMARY KEY,
  pulse_device_id INTEGER NOT NULL REFERENCES pulse_devices(id) ON DELETE CASCADE,
  sala_id INTEGER REFERENCES salas_cultivo(id) ON DELETE SET NULL,
  temperatura_c NUMERIC,
  humedad_rh NUMERIC,
  vpd NUMERIC,
  luz_lux NUMERIC,
  presion_hpa NUMERIC,
  dew_point_c NUMERIC,
  leido_en TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lecturas_ambientales_device_leido
  ON lecturas_ambientales (pulse_device_id, leido_en DESC);

-- Habilitar RLS
ALTER TABLE lecturas_ambientales ENABLE ROW LEVEL SECURITY;

-- Políticas RLS (mismo criterio "abierto" que el resto del proyecto)
DROP POLICY IF EXISTS "Allow select lecturas_ambientales" ON lecturas_ambientales;
CREATE POLICY "Allow select lecturas_ambientales" ON lecturas_ambientales FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow insert lecturas_ambientales" ON lecturas_ambientales;
CREATE POLICY "Allow insert lecturas_ambientales" ON lecturas_ambientales FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow update lecturas_ambientales" ON lecturas_ambientales;
CREATE POLICY "Allow update lecturas_ambientales" ON lecturas_ambientales FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Allow delete lecturas_ambientales" ON lecturas_ambientales;
CREATE POLICY "Allow delete lecturas_ambientales" ON lecturas_ambientales FOR DELETE USING (true);
