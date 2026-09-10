-- Dispositivo/actuador ABSTRACTO. El motor de automatizaciones y la UI hablan
-- únicamente con esta tabla; nunca conocen BroadLink, Shelly, ni ningún
-- detalle de hardware concreto.
--
-- modo_ejecucion desacopla "qué provider es" de "cómo se resuelve un comando":
--   - servidor_directo: el propio backend de Monarca (Vercel) invoca el
--     adapter del provider en el mismo request que encola el comando. Aplica
--     hoy a manual_noop (simulación) y a futuro a cualquier provider
--     alcanzable por HTTP/API desde Vercel (cloud APIs, relés con IP pública).
--     NO requiere ningún bridge local.
--   - bridge_polling: el comando queda pendiente hasta que un proceso externo
--     en la LAN del hardware lo levanta vía GET /api/bridge/commands. Aplica
--     a hardware solo alcanzable por red local (BroadLink IR, Shelly local).
--     Diseñado desde el modelo de datos, pero NO se implementa todavía
--     (llega cuando haya hardware BroadLink real).
--
-- Distinción pedida entre "último comando conocido" y "estado real
-- confirmado": son dos pares de columnas separados a propósito.
-- ultimo_comando_* siempre está disponible (best-effort, lo que Monarca
-- comandó). ultimo_estado_confirmado_* solo se llena si soporta_feedback
-- = true; para broadlink_ir (IR es unidireccional) queda NULL para siempre,
-- y la UI debe mostrar eso como "sin confirmación posible", no "desconocido".
CREATE TABLE IF NOT EXISTS dispositivos_controlables (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(150) NOT NULL,
  sala_id INTEGER REFERENCES salas_cultivo(id) ON DELETE SET NULL,
  tipo VARCHAR(30) NOT NULL CHECK (tipo IN
    ('aire_acondicionado', 'extractor', 'humidificador', 'deshumidificador', 'otro')),
  proveedor VARCHAR(30) NOT NULL CHECK (proveedor IN
    ('manual_noop', 'broadlink_ir', 'shelly_local', 'shelly_cloud', 'http_directo')),
  modo_ejecucion VARCHAR(20) NOT NULL CHECK (modo_ejecucion IN ('servidor_directo', 'bridge_polling')),
  proveedor_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  soporta_feedback BOOLEAN NOT NULL DEFAULT false,
  modo VARCHAR(20) NOT NULL DEFAULT 'automatico' CHECK (modo IN ('automatico', 'manual')),
  activo BOOLEAN DEFAULT true,

  -- "Último comando conocido" — best-effort, siempre disponible.
  ultimo_comando_payload JSONB,
  ultimo_comando_en TIMESTAMPTZ,
  ultimo_comando_origen VARCHAR(20) CHECK (ultimo_comando_origen IN ('automatizacion', 'manual', 'sistema')),
  ultimo_comando_estado VARCHAR(20),

  -- "Estado real confirmado" — solo si soporta_feedback = true.
  ultimo_estado_confirmado_payload JSONB,
  ultimo_estado_confirmado_en TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dispositivos_controlables_sala ON dispositivos_controlables (sala_id);

-- Habilitar RLS
ALTER TABLE dispositivos_controlables ENABLE ROW LEVEL SECURITY;

-- Políticas RLS (mismo criterio "abierto" que el resto del proyecto)
DROP POLICY IF EXISTS "Allow select dispositivos_controlables" ON dispositivos_controlables;
CREATE POLICY "Allow select dispositivos_controlables" ON dispositivos_controlables FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow insert dispositivos_controlables" ON dispositivos_controlables;
CREATE POLICY "Allow insert dispositivos_controlables" ON dispositivos_controlables FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow update dispositivos_controlables" ON dispositivos_controlables;
CREATE POLICY "Allow update dispositivos_controlables" ON dispositivos_controlables FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Allow delete dispositivos_controlables" ON dispositivos_controlables;
CREATE POLICY "Allow delete dispositivos_controlables" ON dispositivos_controlables FOR DELETE USING (true);
