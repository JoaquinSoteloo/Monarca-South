-- Modo Ausente / Cierre: permite marcar dispositivos de
-- dispositivos_controlables como "críticos" (deben quedar en un estado fijo
-- cuando no hay nadie) y trackear el estado global de activación + el
-- cumplimiento por dispositivo mientras está activo.
--
-- requisito_ausente = NULL (default) significa "este dispositivo no es
-- crítico para Modo Ausente" — no se toca ningún dispositivo existente.
-- No hace falta una columna de "payload requerido": todo comando en este
-- proyecto usa la convención payload.accion IN ('encender','apagar')
-- (ver lib/automations/format.ts, lib/automations/adapters/manual-noop.ts,
-- handleComandoManual en automatizaciones-manager.tsx), así que comparar
-- contra ese campo alcanza para cualquier tipo de dispositivo sin
-- hardcodear "extractor" ni ningún otro tipo puntual.
ALTER TABLE dispositivos_controlables
  ADD COLUMN IF NOT EXISTS requisito_ausente VARCHAR(10)
    CHECK (requisito_ausente IN ('encendido', 'apagado'));

-- Estado global de Modo Ausente: una sola fila (mismo patrón que
-- automations_engine_lock, ver scripts/047_create_automations_engine_lock.sql).
CREATE TABLE IF NOT EXISTS modo_ausente_estado (
  id SMALLINT PRIMARY KEY DEFAULT 1,
  activo BOOLEAN NOT NULL DEFAULT false,
  activado_en TIMESTAMPTZ,
  activado_por TEXT,
  activado_desde TEXT,
  desactivado_en TIMESTAMPTZ,
  desactivado_por TEXT,
  CONSTRAINT modo_ausente_estado_single_row CHECK (id = 1)
);

INSERT INTO modo_ausente_estado (id, activo)
VALUES (1, false)
ON CONFLICT (id) DO NOTHING;

-- Tracking de cumplimiento por dispositivo crítico. Es el mecanismo de
-- deduplicación de alertas: el evaluador solo manda push en la transición
-- 'ok' <-> 'violacion' de cada fila, nunca en cada corrida (ver
-- lib/modo-ausente/engine.ts).
CREATE TABLE IF NOT EXISTS modo_ausente_violaciones (
  dispositivo_id INTEGER PRIMARY KEY REFERENCES dispositivos_controlables(id) ON DELETE CASCADE,
  estado VARCHAR(10) NOT NULL DEFAULT 'ok' CHECK (estado IN ('ok', 'violacion')),
  motivo TEXT,
  detectado_en TIMESTAMPTZ,
  notificado_en TIMESTAMPTZ,
  resuelto_notificado_en TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Habilitar RLS
ALTER TABLE modo_ausente_estado ENABLE ROW LEVEL SECURITY;
ALTER TABLE modo_ausente_violaciones ENABLE ROW LEVEL SECURITY;

-- Políticas RLS (mismo criterio "abierto" que el resto del proyecto). El
-- control real de acceso vive en los endpoints (getServerSession()), no acá.
DROP POLICY IF EXISTS "Allow select modo_ausente_estado" ON modo_ausente_estado;
CREATE POLICY "Allow select modo_ausente_estado" ON modo_ausente_estado FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow insert modo_ausente_estado" ON modo_ausente_estado;
CREATE POLICY "Allow insert modo_ausente_estado" ON modo_ausente_estado FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Allow update modo_ausente_estado" ON modo_ausente_estado;
CREATE POLICY "Allow update modo_ausente_estado" ON modo_ausente_estado FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Allow select modo_ausente_violaciones" ON modo_ausente_violaciones;
CREATE POLICY "Allow select modo_ausente_violaciones" ON modo_ausente_violaciones FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow insert modo_ausente_violaciones" ON modo_ausente_violaciones;
CREATE POLICY "Allow insert modo_ausente_violaciones" ON modo_ausente_violaciones FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Allow update modo_ausente_violaciones" ON modo_ausente_violaciones;
CREATE POLICY "Allow update modo_ausente_violaciones" ON modo_ausente_violaciones FOR UPDATE USING (true);
DROP POLICY IF EXISTS "Allow delete modo_ausente_violaciones" ON modo_ausente_violaciones;
CREATE POLICY "Allow delete modo_ausente_violaciones" ON modo_ausente_violaciones FOR DELETE USING (true);
