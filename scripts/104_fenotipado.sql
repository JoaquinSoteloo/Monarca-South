-- 104 — Fenotipado (pedido de Facundo, 18/11/2026).
--
-- EJECUTADO en producción el 19/11/2026, antes de publicar la app que lo usa.
--
-- Seguimiento de las plantas de semilla de genéticas compradas, desde la
-- germinación hasta la cosecha, para elegir con qué fenotipos quedarse como
-- madres. Lo cargan Lucho y Demian desde la pantalla Fenotipado o
-- contándoselo al Asistente (herramientas fenotipado_* en
-- lib/asistente-herramientas.ts).
--
-- 1) fenotipado_plantas: una fila por semilla/planta, con código (GEL-01).
-- 2) fenotipado_observaciones: lo que se ve en cada revisión (altura, nudos,
--    forma, salud, olor, sexo, puntajes de 1 a 5, pesos de cosecha y nota).
--
-- Permisos (lib/permisos.ts):
--   fenotipado.ver    → ver, sumar plantas y anotar observaciones; corregir
--                       o borrar lo propio durante 24 h.
--   fenotipado.editar → cambiar o borrar cualquier planta u observación.
-- Se dan a los roles que ya ven Cultivo (editar: todos menos operador).
-- Script idempotente, envuelto en una transacción.

BEGIN;

CREATE TABLE IF NOT EXISTS public.fenotipado_plantas (
  id BIGSERIAL PRIMARY KEY,
  codigo TEXT NOT NULL,
  genetica TEXT NOT NULL,
  banco TEXT,
  fecha_germinacion DATE,
  ubicacion TEXT,
  estado TEXT NOT NULL DEFAULT 'en_curso'
    CHECK (estado IN ('en_curso', 'madre', 'descartada', 'cosechada')),
  sexo TEXT NOT NULL DEFAULT 'sin_definir'
    CHECK (sexo IN ('sin_definir', 'hembra', 'macho', 'hermafrodita')),
  notas TEXT,
  creado_por UUID DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS fenotipado_plantas_codigo_unico ON public.fenotipado_plantas (upper(codigo));

CREATE TABLE IF NOT EXISTS public.fenotipado_observaciones (
  id BIGSERIAL PRIMARY KEY,
  planta_id BIGINT NOT NULL REFERENCES public.fenotipado_plantas(id) ON DELETE CASCADE,
  fecha DATE NOT NULL DEFAULT (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date,
  etapa TEXT NOT NULL CHECK (etapa IN ('germinacion', 'vege', 'flora', 'cosecha', 'curado')),
  semana INTEGER CHECK (semana IS NULL OR semana BETWEEN 0 AND 30),
  altura_cm NUMERIC(5,1) CHECK (altura_cm IS NULL OR altura_cm BETWEEN 0 AND 500),
  nudos TEXT CHECK (nudos IS NULL OR nudos IN ('cortos', 'medios', 'largos')),
  forma TEXT CHECK (forma IS NULL OR forma IN ('indica', 'sativa', 'mixta')),
  salud TEXT CHECK (salud IS NULL OR salud IN ('bien', 'regular', 'mal')),
  olor TEXT,
  vigor SMALLINT CHECK (vigor IS NULL OR vigor BETWEEN 1 AND 5),
  estructura SMALLINT CHECK (estructura IS NULL OR estructura BETWEEN 1 AND 5),
  aroma SMALLINT CHECK (aroma IS NULL OR aroma BETWEEN 1 AND 5),
  resina SMALLINT CHECK (resina IS NULL OR resina BETWEEN 1 AND 5),
  resistencia SMALLINT CHECK (resistencia IS NULL OR resistencia BETWEEN 1 AND 5),
  rendimiento SMALLINT CHECK (rendimiento IS NULL OR rendimiento BETWEEN 1 AND 5),
  peso_humedo_g NUMERIC(7,1) CHECK (peso_humedo_g IS NULL OR peso_humedo_g >= 0),
  peso_seco_g NUMERIC(7,1) CHECK (peso_seco_g IS NULL OR peso_seco_g >= 0),
  nota TEXT,
  origen TEXT NOT NULL DEFAULT 'pantalla' CHECK (origen IN ('pantalla', 'asistente')),
  cargado_por UUID DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fenotipado_obs_planta_fecha ON public.fenotipado_observaciones (planta_id, fecha DESC);

ALTER TABLE public.fenotipado_plantas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fenotipado_observaciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "feno_plantas_leer" ON public.fenotipado_plantas;
DROP POLICY IF EXISTS "feno_plantas_cargar" ON public.fenotipado_plantas;
DROP POLICY IF EXISTS "feno_plantas_editar" ON public.fenotipado_plantas;
DROP POLICY IF EXISTS "feno_plantas_borrar" ON public.fenotipado_plantas;
CREATE POLICY "feno_plantas_leer" ON public.fenotipado_plantas
  FOR SELECT TO authenticated USING (public.tiene_permiso('fenotipado.ver'));
CREATE POLICY "feno_plantas_cargar" ON public.fenotipado_plantas
  FOR INSERT TO authenticated WITH CHECK (public.tiene_permiso('fenotipado.ver'));
-- Cambiar estado y sexo es parte del seguimiento: lo puede hacer quien carga.
CREATE POLICY "feno_plantas_editar" ON public.fenotipado_plantas
  FOR UPDATE TO authenticated
  USING (public.tiene_permiso('fenotipado.ver')) WITH CHECK (public.tiene_permiso('fenotipado.ver'));
CREATE POLICY "feno_plantas_borrar" ON public.fenotipado_plantas
  FOR DELETE TO authenticated
  USING (public.tiene_permiso('fenotipado.editar') OR (creado_por = auth.uid() AND created_at > now() - interval '24 hours'));

DROP POLICY IF EXISTS "feno_obs_leer" ON public.fenotipado_observaciones;
DROP POLICY IF EXISTS "feno_obs_cargar" ON public.fenotipado_observaciones;
DROP POLICY IF EXISTS "feno_obs_editar" ON public.fenotipado_observaciones;
DROP POLICY IF EXISTS "feno_obs_borrar" ON public.fenotipado_observaciones;
CREATE POLICY "feno_obs_leer" ON public.fenotipado_observaciones
  FOR SELECT TO authenticated USING (public.tiene_permiso('fenotipado.ver'));
CREATE POLICY "feno_obs_cargar" ON public.fenotipado_observaciones
  FOR INSERT TO authenticated WITH CHECK (public.tiene_permiso('fenotipado.ver'));
CREATE POLICY "feno_obs_editar" ON public.fenotipado_observaciones
  FOR UPDATE TO authenticated
  USING (public.tiene_permiso('fenotipado.editar') OR (cargado_por = auth.uid() AND created_at > now() - interval '24 hours'))
  WITH CHECK (public.tiene_permiso('fenotipado.ver'));
CREATE POLICY "feno_obs_borrar" ON public.fenotipado_observaciones
  FOR DELETE TO authenticated
  USING (public.tiene_permiso('fenotipado.editar') OR (cargado_por = auth.uid() AND created_at > now() - interval '24 hours'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fenotipado_plantas, public.fenotipado_observaciones TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.fenotipado_plantas_id_seq, public.fenotipado_observaciones_id_seq TO authenticated;

INSERT INTO public.rol_permisos (rol, permiso)
SELECT rol, 'fenotipado.ver' FROM public.rol_permisos WHERE permiso = 'cultivo.ver'
ON CONFLICT DO NOTHING;
INSERT INTO public.rol_permisos (rol, permiso)
SELECT rol, 'fenotipado.editar' FROM public.rol_permisos WHERE permiso = 'cultivo.ver' AND rol <> 'operador'
ON CONFLICT DO NOTHING;

COMMIT;
