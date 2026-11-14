-- Resumen semanal de Nubi (pedido de Joaquín, 13/11/2026; idea de supercycler.app).
--
-- NO SE EJECUTÓ TODAVÍA. Correr antes de publicar la app que lo usa.
--
-- 1) clima_por_hora(desde, hasta): promedio, mínimo y máximo de temperatura,
--    humedad y luz de cada sala por hora. Una semana son ~10.000 lecturas
--    (más de lo que la API devuelve de una vez); por hora son 5 × 168 filas.
-- 2) resumenes_nubi: un resumen por semana (lunes a domingo). El motor lo arma
--    los lunes desde las 09:00 (lib/resumen-semanal.ts), lo guarda acá y avisa
--    por push. Control manual muestra el último.
--
-- Lee: cualquier usuario logueado. Escribe: el motor, con service_role.
-- Script idempotente, envuelto en una transacción.

BEGIN;

CREATE OR REPLACE FUNCTION public.clima_por_hora(p_desde timestamptz, p_hasta timestamptz)
RETURNS TABLE (
  sala_id integer,
  hora timestamptz,
  temperatura_prom numeric,
  temperatura_min numeric,
  temperatura_max numeric,
  humedad_prom numeric,
  humedad_min numeric,
  humedad_max numeric,
  luz_prom numeric,
  lecturas integer
)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT
    l.sala_id,
    date_trunc('hour', l.leido_en) AS hora,
    round(avg(l.temperatura_c)::numeric, 2),
    round(min(l.temperatura_c)::numeric, 2),
    round(max(l.temperatura_c)::numeric, 2),
    round(avg(l.humedad_rh)::numeric, 2),
    round(min(l.humedad_rh)::numeric, 2),
    round(max(l.humedad_rh)::numeric, 2),
    round(avg(l.luz_lux)::numeric, 2),
    count(*)::integer
  FROM public.lecturas_ambientales AS l
  WHERE l.sala_id IS NOT NULL AND l.leido_en >= p_desde AND l.leido_en < p_hasta
  GROUP BY l.sala_id, date_trunc('hour', l.leido_en)
  ORDER BY 1, 2;
$$;

REVOKE ALL ON FUNCTION public.clima_por_hora(timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clima_por_hora(timestamptz, timestamptz) TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.resumenes_nubi (
  id BIGSERIAL PRIMARY KEY,
  semana_desde DATE NOT NULL UNIQUE,
  texto TEXT NOT NULL,
  sugerencia TEXT NOT NULL,
  datos JSONB,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  enviado_en TIMESTAMPTZ
);

ALTER TABLE public.resumenes_nubi ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "resumenes_nubi_leer" ON public.resumenes_nubi;
CREATE POLICY "resumenes_nubi_leer" ON public.resumenes_nubi
  FOR SELECT TO authenticated USING (true);

COMMIT;

-- =============================================================================
-- VERIFICACIÓN Y ROLLBACK
-- =============================================================================
--   SELECT * FROM public.clima_por_hora(now() - interval '1 day', now()) LIMIT 10;
--   SELECT semana_desde, sugerencia, enviado_en FROM public.resumenes_nubi ORDER BY semana_desde DESC;
--
--   Volver atrás: publicar la versión anterior de la app y después
--   DROP TABLE public.resumenes_nubi;
--   DROP FUNCTION public.clima_por_hora(timestamptz, timestamptz);
