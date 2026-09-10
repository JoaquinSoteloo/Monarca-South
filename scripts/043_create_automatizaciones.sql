-- Reglas de automatización ambiental. Condición simple en v1 (columnas
-- inline); el camino de migración a AND/OR queda anotado más abajo sin
-- crearse ahora, para no sobre-diseñar.
--
-- ultimo_disparo_en/tipo es el ÚNICO estado mutable real de la regla (hace
-- falta para el cooldown). Todo lo demás (si la condición está sostenida
-- hace duracion_minima_segundos) se recalcula sin estado a partir de
-- lecturas_ambientales en cada corrida del motor, así el motor es stateless,
-- autocorrectivo si una corrida se pierde, e independiente de la frecuencia
-- con la que se lo invoque.
CREATE TABLE IF NOT EXISTS automatizaciones (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(150) NOT NULL,
  sala_id INTEGER NOT NULL REFERENCES salas_cultivo(id) ON DELETE CASCADE,
  activa BOOLEAN DEFAULT true,

  pulse_device_id INTEGER NOT NULL REFERENCES pulse_devices(id) ON DELETE CASCADE,
  variable VARCHAR(30) NOT NULL CHECK (variable IN
    ('temperatura_c', 'humedad_rh', 'vpd', 'luz_lux', 'dew_point_c', 'presion_hpa')),

  -- Condición de encendido
  operador VARCHAR(3) NOT NULL CHECK (operador IN ('>', '<', '>=', '<=')),
  valor_objetivo NUMERIC NOT NULL,
  duracion_minima_segundos INTEGER NOT NULL DEFAULT 0,

  -- Condición de apagado / histéresis. NULL = se infiere como negación
  -- estricta de la condición de encendido.
  operador_apagado VARCHAR(3) CHECK (operador_apagado IN ('>', '<', '>=', '<=')),
  valor_apagado NUMERIC,
  duracion_apagado_segundos INTEGER,

  cooldown_segundos INTEGER NOT NULL DEFAULT 300,

  dispositivo_id INTEGER NOT NULL REFERENCES dispositivos_controlables(id) ON DELETE CASCADE,
  accion_encendido JSONB NOT NULL,
  accion_apagado JSONB NOT NULL,

  accion_fail_safe VARCHAR(10) NOT NULL DEFAULT 'mantener' CHECK (accion_fail_safe IN ('mantener', 'apagar')),

  ultimo_disparo_en TIMESTAMPTZ,
  ultimo_disparo_tipo VARCHAR(10) CHECK (ultimo_disparo_tipo IN ('encendido', 'apagado')),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_automatizaciones_sala ON automatizaciones (sala_id);
CREATE INDEX IF NOT EXISTS idx_automatizaciones_activa ON automatizaciones (activa);

-- Camino de migración futuro a condiciones AND/OR (NO se crea todavía):
--   CREATE TABLE automatizacion_condiciones (
--     id SERIAL PRIMARY KEY,
--     automatizacion_id INTEGER REFERENCES automatizaciones(id) ON DELETE CASCADE,
--     grupo INTEGER NOT NULL,
--     operador_logico VARCHAR(3) CHECK (operador_logico IN ('AND', 'OR')),
--     variable VARCHAR(30) NOT NULL,
--     operador VARCHAR(3) NOT NULL,
--     valor NUMERIC NOT NULL,
--     orden INTEGER NOT NULL
--   );
-- + columna automatizaciones.usa_condiciones_avanzadas BOOLEAN, para que las
-- reglas existentes sigan usando las columnas inline sin migrar nada.

-- Habilitar RLS
ALTER TABLE automatizaciones ENABLE ROW LEVEL SECURITY;

-- Políticas RLS (mismo criterio "abierto" que el resto del proyecto)
DROP POLICY IF EXISTS "Allow select automatizaciones" ON automatizaciones;
CREATE POLICY "Allow select automatizaciones" ON automatizaciones FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow insert automatizaciones" ON automatizaciones;
CREATE POLICY "Allow insert automatizaciones" ON automatizaciones FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow update automatizaciones" ON automatizaciones;
CREATE POLICY "Allow update automatizaciones" ON automatizaciones FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Allow delete automatizaciones" ON automatizaciones;
CREATE POLICY "Allow delete automatizaciones" ON automatizaciones FOR DELETE USING (true);
