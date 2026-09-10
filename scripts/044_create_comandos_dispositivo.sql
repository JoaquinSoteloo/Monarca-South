-- Cola de comandos de hardware: la interfaz ÚNICA entre el motor de
-- automatizaciones y cualquier provider, sin importar cómo se resuelva.
--
-- estado usa nombres genéricos a propósito, sin mencionar "bridge":
-- 'ejecutado' significa "el adapter (servidor o bridge) procesó el comando
-- sin error", NUNCA "el equipo confirmó el cambio real". Esa verdad de campo
-- solo existe, aparte, en dispositivos_controlables.ultimo_estado_confirmado_*
-- y solo si el dispositivo tiene soporta_feedback = true.
--
-- Para dispositivos con modo_ejecucion = 'servidor_directo' (ej. manual_noop),
-- el ciclo pendiente -> en_proceso -> ejecutado/fallido ocurre dentro del
-- mismo request que encola el comando, sin polling de por medio.
-- Para modo_ejecucion = 'bridge_polling' (futuro, ej. broadlink_ir), el
-- comando queda 'pendiente' hasta que un bridge externo lo toma vía
-- GET /api/bridge/commands.
CREATE TABLE IF NOT EXISTS comandos_dispositivo (
  id BIGSERIAL PRIMARY KEY,
  dispositivo_id INTEGER NOT NULL REFERENCES dispositivos_controlables(id) ON DELETE CASCADE,
  origen VARCHAR(20) NOT NULL CHECK (origen IN ('automatizacion', 'manual', 'sistema')),
  automatizacion_id INTEGER REFERENCES automatizaciones(id) ON DELETE SET NULL,
  payload JSONB NOT NULL,
  estado VARCHAR(20) NOT NULL DEFAULT 'pendiente' CHECK (estado IN
    ('pendiente', 'en_proceso', 'ejecutado', 'fallido', 'timeout', 'cancelado')),
  ejecutado_por VARCHAR(20) CHECK (ejecutado_por IN ('servidor', 'bridge')),
  bridge_id VARCHAR(50),
  intentos INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  creado_en TIMESTAMPTZ DEFAULT NOW(),
  enviado_en TIMESTAMPTZ,
  resuelto_en TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_comandos_dispositivo_estado ON comandos_dispositivo (estado, creado_en);
CREATE INDEX IF NOT EXISTS idx_comandos_dispositivo_dispositivo ON comandos_dispositivo (dispositivo_id, creado_en DESC);

-- Habilitar RLS
ALTER TABLE comandos_dispositivo ENABLE ROW LEVEL SECURITY;

-- Políticas RLS (mismo criterio "abierto" que el resto del proyecto).
-- El control real de hardware se protege a nivel de endpoint (secrets
-- dedicados en /api/automations/evaluate y /api/bridge/*), no acá.
DROP POLICY IF EXISTS "Allow select comandos_dispositivo" ON comandos_dispositivo;
CREATE POLICY "Allow select comandos_dispositivo" ON comandos_dispositivo FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow insert comandos_dispositivo" ON comandos_dispositivo;
CREATE POLICY "Allow insert comandos_dispositivo" ON comandos_dispositivo FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow update comandos_dispositivo" ON comandos_dispositivo;
CREATE POLICY "Allow update comandos_dispositivo" ON comandos_dispositivo FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Allow delete comandos_dispositivo" ON comandos_dispositivo;
CREATE POLICY "Allow delete comandos_dispositivo" ON comandos_dispositivo FOR DELETE USING (true);
