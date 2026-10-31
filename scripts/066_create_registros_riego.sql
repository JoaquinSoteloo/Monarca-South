-- Prueba piloto del módulo de cultivo: registro digital de riego.
--
-- NO SE EJECUTÓ TODAVÍA. Correr a mano en el SQL Editor de Supabase después
-- de revisar. Reemplaza la planilla de riego en papel (Manual de cultivo 3).
--
-- Un registro = un riego de una sala en un día. Guarda la solución que entró
-- (EC/pH/litros) y el runoff de las 2 macetas testigo (EC/pH/% de drenaje).
-- Las alertas (sales acumuladas, pH fuera de rango, drenaje bajo/alto) se
-- calculan en la app (lib/riego.ts), no se guardan.
--
-- Seguridad: nace solo para `authenticated`, igual que las tablas de cultivo
-- después de la etapa 3A (scripts 052-053). Sin policies abiertas a anon.
--
-- Script idempotente, envuelto en una transacción.

BEGIN;

CREATE TABLE IF NOT EXISTS public.registros_riego (
  id BIGSERIAL PRIMARY KEY,
  fecha DATE NOT NULL DEFAULT (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date,
  sala_id INTEGER NOT NULL REFERENCES public.salas_cultivo(id) ON DELETE CASCADE,
  etapa VARCHAR(20) NOT NULL CHECK (etapa IN ('esqueje', 'vegetativo', 'floracion', 'lavado')),
  semana SMALLINT CHECK (semana IS NULL OR semana BETWEEN 1 AND 12),
  responsable VARCHAR(60) NOT NULL,
  ec_entrada NUMERIC(4,2) CHECK (ec_entrada IS NULL OR ec_entrada BETWEEN 0 AND 5),
  ph_entrada NUMERIC(3,1) CHECK (ph_entrada IS NULL OR ph_entrada BETWEEN 3 AND 9),
  litros_por_maceta NUMERIC(4,2) CHECK (litros_por_maceta IS NULL OR litros_por_maceta BETWEEN 0 AND 10),
  ec_runoff NUMERIC(4,2) CHECK (ec_runoff IS NULL OR ec_runoff BETWEEN 0 AND 10),
  ph_runoff NUMERIC(3,1) CHECK (ph_runoff IS NULL OR ph_runoff BETWEEN 3 AND 9),
  drenaje_pct SMALLINT CHECK (drenaje_pct IS NULL OR drenaje_pct BETWEEN 0 AND 100),
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS registros_riego_sala_fecha_idx
  ON public.registros_riego (sala_id, fecha DESC);

ALTER TABLE public.registros_riego ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_all_registros_riego" ON public.registros_riego;
CREATE POLICY "authenticated_all_registros_riego" ON public.registros_riego
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;
