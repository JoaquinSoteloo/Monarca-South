-- Lock de una sola fila para evitar que dos corridas de evaluateAutomations
-- se solapen (ej. el pinger externo dispara cada 1 minuto pero una corrida
-- puntual tarda más que eso, o alguien aprieta "Evaluar ahora" justo cuando
-- el cron externo está corriendo).
--
-- Por qué una tabla y no un advisory lock de Postgres (pg_advisory_lock):
-- supabase-js habla con la base vía PostgREST, que abre una transacción por
-- request — un advisory lock de sesión no sobrevive de forma confiable entre
-- llamadas hechas así. Un UPDATE condicional sobre una fila sí es atómico
-- por statement, y es el mismo patrón que ya usa
-- lib/automations/engine.ts para el cooldown de cada regla
-- (automatizaciones.ultimo_disparo_en).
--
-- Incluye recuperación de locks "colgados": si una corrida se cae sin
-- liberar el lock (crash, timeout de la función serverless), una corrida
-- posterior puede reclamarlo igual pasado LOCK_STALE_MS (ver
-- lib/automations/lock.ts) — así un solo request fallido no deja el motor
-- trabado para siempre.
CREATE TABLE IF NOT EXISTS automations_engine_lock (
  id SMALLINT PRIMARY KEY DEFAULT 1,
  locked BOOLEAN NOT NULL DEFAULT false,
  locked_at TIMESTAMPTZ,
  CONSTRAINT automations_engine_lock_single_row CHECK (id = 1)
);

INSERT INTO automations_engine_lock (id, locked)
VALUES (1, false)
ON CONFLICT (id) DO NOTHING;

-- Habilitar RLS
ALTER TABLE automations_engine_lock ENABLE ROW LEVEL SECURITY;

-- Políticas RLS (mismo criterio "abierto" que el resto del proyecto). El
-- control real de acceso al motor está en los endpoints
-- (AUTOMATIONS_CRON_SECRET / sesión), no acá.
DROP POLICY IF EXISTS "Allow select automations_engine_lock" ON automations_engine_lock;
CREATE POLICY "Allow select automations_engine_lock" ON automations_engine_lock FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow update automations_engine_lock" ON automations_engine_lock;
CREATE POLICY "Allow update automations_engine_lock" ON automations_engine_lock FOR UPDATE USING (true);
