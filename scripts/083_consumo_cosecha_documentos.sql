-- Pedido de Facu (02/11/2026): consumo del equipo, salidas de stock, cierre de
-- cosecha y documentos de los socios. Correr después de 075.
--
-- 1) retribuciones_equipo.socio_id: el socio con el que cada persona del
--    equipo retira, para ver qué y cuánto retiró en el mes y descontarlo.
--
-- 2) Salidas de stock: movimiento_stock acepta tipo 'salida' con motivo
--    'exposicion' o 'muestra' (destino = stock del que sale).
--
-- 3) Cierre de cosecha de una sala (una o varias genéticas): peso seco contra
--    lo entregado + el stock actual + las salidas (muestras, exposición y
--    retribuciones en producto) desde la cosecha. La diferencia es la merma.
--
-- 4) Socios: checklist de documentos y vencimiento del REPROCANN.
--
-- Errores nuevos: VS004 motivo de salida inválido · CC001 datos del cierre

BEGIN;

-- =============================================================================
-- 1) Consumo del equipo
-- =============================================================================

ALTER TABLE public.retribuciones_equipo
  ADD COLUMN IF NOT EXISTS socio_id uuid REFERENCES public.socios(id) ON DELETE SET NULL;

-- =============================================================================
-- 2) Salidas de stock (exposición, muestras)
-- =============================================================================

ALTER TABLE public.movimientos_stock ADD COLUMN IF NOT EXISTS motivo text;

ALTER TABLE public.movimientos_stock DROP CONSTRAINT IF EXISTS movimientos_stock_tipo_check;
ALTER TABLE public.movimientos_stock
  ADD CONSTRAINT movimientos_stock_tipo_check CHECK (tipo IN ('ingreso', 'traspaso', 'retribucion', 'salida'));

ALTER TABLE public.movimientos_stock DROP CONSTRAINT IF EXISTS movimientos_stock_motivo_check;
ALTER TABLE public.movimientos_stock
  ADD CONSTRAINT movimientos_stock_motivo_check CHECK (
    (tipo = 'salida' AND motivo IN ('exposicion', 'muestra')) OR (tipo <> 'salida' AND motivo IS NULL)
  );

DROP FUNCTION IF EXISTS public.movimiento_stock(uuid, text, text, numeric, text);

CREATE OR REPLACE FUNCTION public.movimiento_stock(
  p_genetica_id uuid,
  p_tipo text,
  p_destino text,
  p_gramos numeric,
  p_nota text DEFAULT NULL,
  p_motivo text DEFAULT NULL
)
RETURNS SETOF public.movimientos_stock
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_gen public.geneticas%ROWTYPE;
  v_gramos numeric := round(COALESCE(p_gramos, 0), 2);
  v_s numeric;
  v_e numeric;
  v_mov public.movimientos_stock%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Tenés que iniciar sesión' USING ERRCODE = '42501';
  END IF;
  IF p_tipo IS NULL OR p_tipo NOT IN ('ingreso', 'traspaso', 'salida') THEN
    RAISE EXCEPTION 'Tipo de movimiento inválido' USING ERRCODE = 'VS001';
  END IF;
  IF p_destino IS NULL OR p_destino NOT IN ('sueltos', 'enrolados') THEN
    RAISE EXCEPTION 'Elegí a qué stock va' USING ERRCODE = 'VS001';
  END IF;
  IF p_tipo = 'salida' AND (p_motivo IS NULL OR p_motivo NOT IN ('exposicion', 'muestra')) THEN
    RAISE EXCEPTION 'Elegí si la salida es exposición o muestra' USING ERRCODE = 'VS004';
  END IF;
  IF v_gramos <= 0 THEN
    RAISE EXCEPTION 'Los gramos tienen que ser mayores a 0' USING ERRCODE = 'VS001';
  END IF;

  SELECT * INTO v_gen FROM public.geneticas WHERE id = p_genetica_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La genética indicada no existe' USING ERRCODE = 'VS003';
  END IF;

  v_s := v_gen.gramos_disponibles;
  v_e := v_gen.gramos_enrolados;

  IF p_tipo = 'ingreso' THEN
    IF p_destino = 'sueltos' THEN v_s := v_s + v_gramos; ELSE v_e := v_e + v_gramos; END IF;
  ELSIF p_tipo = 'salida' THEN
    -- En una salida, p_destino es el stock del que sale.
    IF p_destino = 'sueltos' THEN
      IF v_s < v_gramos THEN
        RAISE EXCEPTION 'No alcanza el stock de sueltos de %: hay %', v_gen.nombre, public.fmt_gramos(v_s) USING ERRCODE = 'VS002';
      END IF;
      v_s := v_s - v_gramos;
    ELSE
      IF v_e < v_gramos THEN
        RAISE EXCEPTION 'No alcanza el stock de enrolados de %: hay %', v_gen.nombre, public.fmt_gramos(v_e) USING ERRCODE = 'VS002';
      END IF;
      v_e := v_e - v_gramos;
    END IF;
  ELSIF p_destino = 'enrolados' THEN
    IF v_s < v_gramos THEN
      RAISE EXCEPTION 'No alcanza el stock de sueltos de %: hay %', v_gen.nombre, public.fmt_gramos(v_s) USING ERRCODE = 'VS002';
    END IF;
    v_s := v_s - v_gramos;
    v_e := v_e + v_gramos;
  ELSE
    IF v_e < v_gramos THEN
      RAISE EXCEPTION 'No alcanza el stock de enrolados de %: hay %', v_gen.nombre, public.fmt_gramos(v_e) USING ERRCODE = 'VS002';
    END IF;
    v_e := v_e - v_gramos;
    v_s := v_s + v_gramos;
  END IF;

  UPDATE public.geneticas
  SET gramos_disponibles = v_s, gramos_enrolados = v_e, updated_at = now()
  WHERE id = p_genetica_id;

  INSERT INTO public.movimientos_stock (
    genetica_id, tipo, destino, gramos, motivo,
    sueltos_antes, sueltos_despues, enrolados_antes, enrolados_despues,
    nota, usuario_id, usuario_nombre
  ) VALUES (
    p_genetica_id, p_tipo, p_destino, v_gramos, CASE WHEN p_tipo = 'salida' THEN p_motivo END,
    v_gen.gramos_disponibles, v_s, v_gen.gramos_enrolados, v_e,
    NULLIF(btrim(COALESCE(p_nota, '')), ''), auth.uid(),
    (SELECT nombre FROM public.perfiles WHERE user_id = auth.uid())
  ) RETURNING * INTO v_mov;

  RETURN NEXT v_mov;
END;
$$;

REVOKE ALL ON FUNCTION public.movimiento_stock(uuid, text, text, numeric, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.movimiento_stock(uuid, text, text, numeric, text, text) TO authenticated;

-- =============================================================================
-- 3) Cierre de cosecha
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.cierres_cosecha (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sala_id integer NOT NULL REFERENCES public.salas_cultivo(id) ON DELETE RESTRICT,
  -- Desde cuándo se cuentan las entregas y salidas (la fecha de la cosecha).
  desde date NOT NULL,
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  genetica_ids uuid[] NOT NULL CHECK (cardinality(genetica_ids) > 0),
  peso_seco numeric(10,2) NOT NULL CHECK (peso_seco > 0),
  entregado numeric(10,2) NOT NULL,
  stock numeric(10,2) NOT NULL,
  muestras numeric(10,2) NOT NULL,
  exposicion numeric(10,2) NOT NULL,
  retribuciones numeric(10,2) NOT NULL,
  merma numeric(10,2) NOT NULL,
  nota text,
  usuario_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  usuario_nombre text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cierres_cosecha ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cierres_cosecha_select ON public.cierres_cosecha;
CREATE POLICY cierres_cosecha_select ON public.cierres_cosecha
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS cierres_cosecha_borrar ON public.cierres_cosecha;
CREATE POLICY cierres_cosecha_borrar ON public.cierres_cosecha
  FOR DELETE TO authenticated USING (public.rol_actual() = 'comision');

REVOKE ALL ON public.cierres_cosecha FROM anon;

-- Cuánto salió de las genéticas desde una fecha (Argentina) y cuánto queda.
CREATE OR REPLACE FUNCTION public.resumen_cosecha(p_genetica_ids uuid[], p_desde date)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH desde AS (
    SELECT (p_desde::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires') AS ts
  )
  SELECT jsonb_build_object(
    'entregado', COALESCE((
      SELECT sum(COALESCE(dv.gramos, 0) + COALESCE(dv.peso_enrolados,
               round(COALESCE(dv.cantidad_enrolados, 0) * COALESCE(dv.peso_por_enrolado, 0), 1), 0))
      FROM public.detalle_venta dv JOIN public.ventas v ON v.id = dv.venta_id, desde
      WHERE dv.genetica_id = ANY(p_genetica_ids) AND v.created_at >= desde.ts
    ), 0),
    'stock', COALESCE((
      SELECT sum(gramos_disponibles + gramos_enrolados) FROM public.geneticas WHERE id = ANY(p_genetica_ids)
    ), 0),
    'muestras', COALESCE((
      SELECT sum(m.gramos) FROM public.movimientos_stock m, desde
      WHERE m.genetica_id = ANY(p_genetica_ids) AND m.tipo = 'salida' AND m.motivo = 'muestra' AND m.created_at >= desde.ts
    ), 0),
    'exposicion', COALESCE((
      SELECT sum(m.gramos) FROM public.movimientos_stock m, desde
      WHERE m.genetica_id = ANY(p_genetica_ids) AND m.tipo = 'salida' AND m.motivo = 'exposicion' AND m.created_at >= desde.ts
    ), 0),
    'retribuciones', COALESCE((
      SELECT sum(m.gramos) FROM public.movimientos_stock m, desde
      WHERE m.genetica_id = ANY(p_genetica_ids) AND m.tipo = 'retribucion' AND m.created_at >= desde.ts
    ), 0)
  );
$$;

REVOKE ALL ON FUNCTION public.resumen_cosecha(uuid[], date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resumen_cosecha(uuid[], date) TO authenticated;

CREATE OR REPLACE FUNCTION public.registrar_cierre_cosecha(
  p_sala_id integer,
  p_desde date,
  p_genetica_ids uuid[],
  p_peso_seco numeric,
  p_nota text DEFAULT NULL
)
RETURNS SETOF public.cierres_cosecha
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_r jsonb;
  v_cierre public.cierres_cosecha%ROWTYPE;
  v_contado numeric;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Tenés que iniciar sesión' USING ERRCODE = '42501';
  END IF;
  IF p_sala_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.salas_cultivo WHERE id = p_sala_id) THEN
    RAISE EXCEPTION 'Elegí la sala' USING ERRCODE = 'CC001';
  END IF;
  IF p_desde IS NULL OR p_desde > CURRENT_DATE THEN
    RAISE EXCEPTION 'Elegí la fecha de la cosecha' USING ERRCODE = 'CC001';
  END IF;
  IF COALESCE(cardinality(p_genetica_ids), 0) = 0 THEN
    RAISE EXCEPTION 'Elegí al menos una genética' USING ERRCODE = 'CC001';
  END IF;
  IF COALESCE(p_peso_seco, 0) <= 0 THEN
    RAISE EXCEPTION 'Cargá el peso seco' USING ERRCODE = 'CC001';
  END IF;

  v_r := public.resumen_cosecha(p_genetica_ids, p_desde);
  v_contado := (v_r->>'entregado')::numeric + (v_r->>'stock')::numeric + (v_r->>'muestras')::numeric
             + (v_r->>'exposicion')::numeric + (v_r->>'retribuciones')::numeric;

  INSERT INTO public.cierres_cosecha (
    sala_id, desde, genetica_ids, peso_seco, entregado, stock, muestras, exposicion, retribuciones, merma,
    nota, usuario_id, usuario_nombre
  ) VALUES (
    p_sala_id, p_desde, p_genetica_ids, round(p_peso_seco, 2),
    (v_r->>'entregado')::numeric, (v_r->>'stock')::numeric, (v_r->>'muestras')::numeric,
    (v_r->>'exposicion')::numeric, (v_r->>'retribuciones')::numeric, round(p_peso_seco - v_contado, 2),
    NULLIF(btrim(COALESCE(p_nota, '')), ''), auth.uid(),
    (SELECT nombre FROM public.perfiles WHERE user_id = auth.uid())
  ) RETURNING * INTO v_cierre;

  RETURN NEXT v_cierre;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_cierre_cosecha(integer, date, uuid[], numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_cierre_cosecha(integer, date, uuid[], numeric, text) TO authenticated;

-- =============================================================================
-- 4) Documentos de los socios
-- =============================================================================

ALTER TABLE public.socios
  ADD COLUMN IF NOT EXISTS doc_credencial_reprocann boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS doc_codigo_vinculacion boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS doc_dni boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS doc_notas_firmadas boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reprocann_vence date;

COMMIT;
