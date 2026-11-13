-- Nubi propone (pedido de Joaquín, 13/11/2026).
--
-- NO SE EJECUTÓ TODAVÍA. Correr antes de publicar la app que lo usa.
--
-- Cuando una sala tiene una alerta de temperatura (alertas_clima, script 095)
-- y un aire controlable, Nubi mira cómo está el aire y propone una orden
-- (lib/nubi.ts): por ejemplo "bajar el aire de 23 a 21 °C". Llega un push a
-- quienes tienen permiso de Control manual y una persona la aprueba ("Mandar")
-- o la descarta ("No"). Vence a los 30 minutos sin respuesta.
--   estado: pendiente → aprobada | rechazada | vencida
--           informada = no había orden para proponer, solo un aviso
--           (por ejemplo, el aire ya está en 16 °C y no alcanza).
-- Una sola propuesta pendiente por equipo (índice único parcial).
--
-- Lee: cualquier usuario logueado (Control manual las muestra).
-- Escribe: el motor y la ruta de aprobación, con service_role.
--
-- Script idempotente, envuelto en una transacción.

BEGIN;

CREATE TABLE IF NOT EXISTS public.propuestas_nubi (
  id BIGSERIAL PRIMARY KEY,
  sala_id INTEGER NOT NULL REFERENCES public.salas_cultivo(id) ON DELETE CASCADE,
  dispositivo_id INTEGER NOT NULL REFERENCES public.dispositivos_controlables(id) ON DELETE CASCADE,
  alerta_id BIGINT REFERENCES public.alertas_clima(id) ON DELETE SET NULL,
  estado TEXT NOT NULL CHECK (estado IN ('pendiente', 'aprobada', 'rechazada', 'vencida', 'informada')),
  motivo TEXT NOT NULL,
  resumen TEXT NOT NULL,
  payload JSONB,
  creada_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  vence_en TIMESTAMPTZ,
  resuelta_en TIMESTAMPTZ,
  resuelta_por UUID,
  resuelta_por_nombre TEXT,
  comando_id BIGINT
);

CREATE UNIQUE INDEX IF NOT EXISTS propuestas_nubi_una_pendiente
  ON public.propuestas_nubi (dispositivo_id) WHERE estado = 'pendiente';
CREATE INDEX IF NOT EXISTS propuestas_nubi_creada ON public.propuestas_nubi (creada_en DESC);

ALTER TABLE public.propuestas_nubi ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "propuestas_nubi_leer" ON public.propuestas_nubi;
CREATE POLICY "propuestas_nubi_leer" ON public.propuestas_nubi
  FOR SELECT TO authenticated USING (true);

COMMIT;

-- =============================================================================
-- VERIFICACIÓN Y ROLLBACK
-- =============================================================================
--   Últimas propuestas:
--   SELECT p.creada_en, s.nombre, p.motivo, p.resumen, p.estado, p.resuelta_por_nombre
--   FROM public.propuestas_nubi p JOIN public.salas_cultivo s ON s.id = p.sala_id
--   ORDER BY p.creada_en DESC LIMIT 20;
--
--   Volver atrás: publicar la versión anterior de la app y después
--   DROP TABLE public.propuestas_nubi;
