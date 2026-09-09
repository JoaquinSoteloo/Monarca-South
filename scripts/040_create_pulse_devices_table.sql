-- Catálogo local de dispositivos Pulse Grow y su asignación a salas de cultivo.
-- id = deviceId real de Pulse Grow (no se genera localmente).
-- Se llena/actualiza vía POST /api/pulse/sync (nombre y device_type vienen de
-- Pulse); sala_id y activo se gestionan solo desde nuestra UI.
CREATE TABLE IF NOT EXISTS pulse_devices (
  id INTEGER PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  device_type INTEGER,
  sala_id INTEGER REFERENCES salas_cultivo(id) ON DELETE SET NULL,
  activo BOOLEAN DEFAULT true,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar RLS
ALTER TABLE pulse_devices ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para pulse_devices (mismo criterio "abierto" que el resto del proyecto)
DROP POLICY IF EXISTS "Allow select pulse_devices" ON pulse_devices;
CREATE POLICY "Allow select pulse_devices" ON pulse_devices FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow insert pulse_devices" ON pulse_devices;
CREATE POLICY "Allow insert pulse_devices" ON pulse_devices FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow update pulse_devices" ON pulse_devices;
CREATE POLICY "Allow update pulse_devices" ON pulse_devices FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Allow delete pulse_devices" ON pulse_devices;
CREATE POLICY "Allow delete pulse_devices" ON pulse_devices FOR DELETE USING (true);
