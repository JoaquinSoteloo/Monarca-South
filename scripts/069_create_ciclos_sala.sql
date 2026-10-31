-- Superciclo Monarca: un ciclo por tanda de cada sala de flora.
--
-- NO SE EJECUTÓ TODAVÍA. Correr después de 067_create_equipo_tareas.sql.
--
-- Se guarda solo la fecha de entrada a la sala y las duraciones; todas las
-- demás fechas (12/12, lavado, cosecha, fin de secado, sala libre) se calculan
-- en la app (lib/ciclo.ts). Así el planificador de cosecha mueve un número y
-- se recalcula todo, incluidas las tareas del protocolo.
--
-- Las tareas del protocolo se guardan en `tareas` con ciclo_id + clave
-- (única por ciclo), sin creada_por: no generan avisos de "te asignaron".

BEGIN;

CREATE TABLE IF NOT EXISTS public.ciclos_sala (
  id BIGSERIAL PRIMARY KEY,
  sala_id INTEGER NOT NULL REFERENCES public.salas_cultivo(id) ON DELETE CASCADE,
  nombre VARCHAR(80),
  estado VARCHAR(10) NOT NULL DEFAULT 'abierto' CHECK (estado IN ('abierto', 'cerrado')),
  geneticas TEXT,
  plantas INTEGER CHECK (plantas IS NULL OR plantas BETWEEN 0 AND 2000),
  m2 NUMERIC(5,2) CHECK (m2 IS NULL OR m2 > 0),
  fecha_inicio DATE NOT NULL,
  dias_vege SMALLINT NOT NULL DEFAULT 21 CHECK (dias_vege BETWEEN 0 AND 120),
  dias_flora SMALLINT NOT NULL DEFAULT 60 CHECK (dias_flora BETWEEN 35 AND 120),
  dias_lavado SMALLINT NOT NULL DEFAULT 7 CHECK (dias_lavado BETWEEN 0 AND 21),
  dias_secado SMALLINT NOT NULL DEFAULT 6 CHECK (dias_secado BETWEEN 1 AND 21),
  dias_limpieza SMALLINT NOT NULL DEFAULT 2 CHECK (dias_limpieza BETWEEN 0 AND 14),
  notas TEXT,
  creado_por UUID REFERENCES public.perfiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ciclos_sala_sala_idx ON public.ciclos_sala (sala_id, fecha_inicio);

ALTER TABLE public.tareas
  ADD COLUMN IF NOT EXISTS ciclo_id BIGINT REFERENCES public.ciclos_sala(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS clave VARCHAR(40);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tareas_ciclo_clave_key') THEN
    ALTER TABLE public.tareas ADD CONSTRAINT tareas_ciclo_clave_key UNIQUE (ciclo_id, clave);
  END IF;
END $$;

ALTER TABLE public.registros_riego
  ADD COLUMN IF NOT EXISTS ciclo_id BIGINT REFERENCES public.ciclos_sala(id) ON DELETE SET NULL;

ALTER TABLE public.ciclos_sala ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all_ciclos_sala" ON public.ciclos_sala;
CREATE POLICY "authenticated_all_ciclos_sala" ON public.ciclos_sala
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;
