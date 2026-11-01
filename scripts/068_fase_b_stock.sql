-- Fase B — stock separado en sueltos y enrolados, e ingresos de stock.
--
-- 1) Cada genética tiene dos stocks:
--      gramos_disponibles -> gramos para entregar sueltos (el de siempre)
--      gramos_enrolados   -> gramos reservados para enrolados (cocos más chicos)
--    Al correr este script gramos_enrolados arranca en 0, así que todo el stock
--    actual queda como sueltos y nada cambia hasta que se carguen enrolados.
--
-- 2) movimientos_stock + movimiento_stock(): "sumar lo pesado nuevo" a uno de
--    los dos stocks, o pasar gramos de uno al otro, dejando registro de quién,
--    cuándo, y el stock antes/después.
--
-- 3) registrar_entrega / editar_entrega descuentan cada línea del stock que
--    corresponde: los gramos sueltos de gramos_disponibles y el peso de los
--    enrolados de gramos_enrolados. eliminar_entrega (nueva) los devuelve igual.
--
--    Cómo: registrar_venta/editar_venta/eliminar_venta (062/065) sólo conocen
--    gramos_disponibles. Antes de llamarlas se bloquean las genéticas y se
--    juntan los dos stocks en gramos_disponibles; después se vuelven a separar
--    según el peso de enrolados de la entrega (detalle_venta) y se valida que
--    ninguno de los dos quede negativo (VB006). Todo pasa en la misma
--    transacción, así que nadie ve el stock juntado.
--
-- Mientras la app publicada siga usando registrar_venta directo, todo se
-- descuenta de gramos_disponibles como hasta ahora (gramos_enrolados = 0).
--
-- Errores nuevos:
--   VB006  no alcanza el stock de sueltos o de enrolados
--   VS001  movimiento inválido
--   VS002  no alcanza el stock de origen para un traspaso
--   VS003  la genética no existe

BEGIN;

-- =============================================================================
-- 1) Esquema
-- =============================================================================

ALTER TABLE public.geneticas
  ADD COLUMN IF NOT EXISTS gramos_enrolados numeric(10,2) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.movimientos_stock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  genetica_id uuid NOT NULL REFERENCES public.geneticas(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('ingreso', 'traspaso')),
  -- ingreso: a qué stock se suma. traspaso: a qué stock pasan los gramos.
  destino text NOT NULL CHECK (destino IN ('sueltos', 'enrolados')),
  gramos numeric(10,2) NOT NULL CHECK (gramos > 0),
  sueltos_antes numeric(10,2) NOT NULL,
  sueltos_despues numeric(10,2) NOT NULL,
  enrolados_antes numeric(10,2) NOT NULL,
  enrolados_despues numeric(10,2) NOT NULL,
  nota text,
  usuario_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  usuario_nombre text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS movimientos_stock_genetica_idx
  ON public.movimientos_stock (genetica_id, created_at DESC);

ALTER TABLE public.movimientos_stock ENABLE ROW LEVEL SECURITY;

-- Sólo lectura desde la app: se escribe únicamente con movimiento_stock().
DROP POLICY IF EXISTS movimientos_stock_select ON public.movimientos_stock;
CREATE POLICY movimientos_stock_select ON public.movimientos_stock
  FOR SELECT TO authenticated USING (true);

-- =============================================================================
-- 2) Ingresos y traspasos
-- =============================================================================

CREATE OR REPLACE FUNCTION public.movimiento_stock(
  p_genetica_id uuid,
  p_tipo text,
  p_destino text,
  p_gramos numeric,
  p_nota text DEFAULT NULL
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
  IF p_tipo IS NULL OR p_tipo NOT IN ('ingreso', 'traspaso') THEN
    RAISE EXCEPTION 'Tipo de movimiento inválido' USING ERRCODE = 'VS001';
  END IF;
  IF p_destino IS NULL OR p_destino NOT IN ('sueltos', 'enrolados') THEN
    RAISE EXCEPTION 'Elegí a qué stock va' USING ERRCODE = 'VS001';
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
  ELSIF p_destino = 'enrolados' THEN
    IF v_s < v_gramos THEN
      RAISE EXCEPTION 'No alcanza el stock de sueltos de %: hay %', v_gen.nombre, public.fmt_gramos(v_s)
        USING ERRCODE = 'VS002';
    END IF;
    v_s := v_s - v_gramos;
    v_e := v_e + v_gramos;
  ELSE
    IF v_e < v_gramos THEN
      RAISE EXCEPTION 'No alcanza el stock de enrolados de %: hay %', v_gen.nombre, public.fmt_gramos(v_e)
        USING ERRCODE = 'VS002';
    END IF;
    v_e := v_e - v_gramos;
    v_s := v_s + v_gramos;
  END IF;

  UPDATE public.geneticas
  SET gramos_disponibles = v_s, gramos_enrolados = v_e, updated_at = now()
  WHERE id = p_genetica_id;

  INSERT INTO public.movimientos_stock (
    genetica_id, tipo, destino, gramos,
    sueltos_antes, sueltos_despues, enrolados_antes, enrolados_despues,
    nota, usuario_id, usuario_nombre
  ) VALUES (
    p_genetica_id, p_tipo, p_destino, v_gramos,
    v_gen.gramos_disponibles, v_s, v_gen.gramos_enrolados, v_e,
    NULLIF(btrim(COALESCE(p_nota, '')), ''), auth.uid(),
    (SELECT nombre FROM public.perfiles WHERE user_id = auth.uid())
  ) RETURNING * INTO v_mov;

  RETURN NEXT v_mov;
END;
$$;

REVOKE ALL ON FUNCTION public.movimiento_stock(uuid, text, text, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.movimiento_stock(uuid, text, text, numeric, text) TO authenticated;

-- =============================================================================
-- 3) Ayudantes para separar el stock de una entrega
-- =============================================================================

-- Genéticas que toca una entrega: las de su detalle actual y las de p_lineas.
CREATE OR REPLACE FUNCTION public.geneticas_de_entrega(p_venta_id uuid, p_lineas jsonb)
RETURNS uuid[]
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT COALESCE(array_agg(DISTINCT id), '{}')
  FROM (
    SELECT dv.genetica_id AS id
    FROM public.detalle_venta dv
    WHERE p_venta_id IS NOT NULL AND dv.venta_id = p_venta_id AND dv.genetica_id IS NOT NULL
    UNION ALL
    SELECT v.genetica_id
    FROM public.ventas v
    WHERE p_venta_id IS NOT NULL AND v.id = p_venta_id AND v.genetica_id IS NOT NULL
    UNION ALL
    -- Ids mal formados se ignoran acá; registrar_venta/editar_venta dan el error.
    SELECT (l->>'genetica_id')::uuid
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_lineas) = 'array' THEN p_lineas ELSE '[]'::jsonb END) l
    WHERE l->>'tipo' = 'genetica'
      AND l->>'genetica_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ) x;
$$;

-- Peso de enrolados por genética de una entrega: {"<genetica_id>": gramos}.
CREATE OR REPLACE FUNCTION public.enrolados_por_genetica(p_venta_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT COALESCE(jsonb_object_agg(genetica_id, peso), '{}'::jsonb)
  FROM (
    SELECT dv.genetica_id,
           sum(COALESCE(dv.peso_enrolados,
                        round(COALESCE(dv.cantidad_enrolados, 0) * COALESCE(dv.peso_por_enrolado, 0), 1))) AS peso
    FROM public.detalle_venta dv
    WHERE dv.venta_id = p_venta_id AND dv.genetica_id IS NOT NULL
    GROUP BY dv.genetica_id
  ) x;
$$;

-- Bloquea las genéticas (en orden por id, como 065), guarda los dos stocks y
-- los junta en gramos_disponibles para que las funciones de 062/065 validen y
-- descuenten contra el total. Devuelve {"<id>": {"s": sueltos, "e": enrolados}}.
CREATE OR REPLACE FUNCTION public.stock_pools_preparar(p_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_row public.geneticas%ROWTYPE;
  v_snap jsonb := '{}'::jsonb;
BEGIN
  FOR v_row IN
    SELECT * FROM public.geneticas WHERE id = ANY(COALESCE(p_ids, '{}')) ORDER BY id FOR UPDATE
  LOOP
    v_snap := v_snap || jsonb_build_object(
      v_row.id::text, jsonb_build_object('s', v_row.gramos_disponibles, 'e', v_row.gramos_enrolados)
    );
    IF v_row.gramos_enrolados <> 0 THEN
      UPDATE public.geneticas
      SET gramos_disponibles = gramos_disponibles + gramos_enrolados, gramos_enrolados = 0
      WHERE id = v_row.id;
    END IF;
  END LOOP;
  RETURN v_snap;
END;
$$;

-- Vuelve a separar los stocks. p_enr_antes / p_enr_despues son el peso de
-- enrolados por genética antes y después del cambio (enrolados_por_genetica);
-- lo que no es enrolados sale de (o vuelve a) sueltos.
CREATE OR REPLACE FUNCTION public.stock_pools_cerrar(p_snap jsonb, p_enr_antes jsonb, p_enr_despues jsonb)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_id text;
  v_old jsonb;
  v_total numeric;
  v_s_old numeric;
  v_e_old numeric;
  v_e numeric;
  v_s numeric;
  v_nombre text;
  v_faltas text[] := '{}';
BEGIN
  FOR v_id, v_old IN SELECT key, value FROM jsonb_each(COALESCE(p_snap, '{}'::jsonb)) LOOP
    SELECT gramos_disponibles, nombre INTO v_total, v_nombre FROM public.geneticas WHERE id = v_id::uuid;
    v_s_old := (v_old->>'s')::numeric;
    v_e_old := (v_old->>'e')::numeric;
    v_e := v_e_old
           - COALESCE((p_enr_despues->>v_id)::numeric, 0)
           + COALESCE((p_enr_antes->>v_id)::numeric, 0);
    v_s := v_total - v_e;

    -- Sólo es error si el stock bajó y quedó negativo (no por un negativo viejo).
    IF v_s < 0 AND v_s < v_s_old THEN
      v_faltas := array_append(v_faltas,
        format('No alcanza el stock de sueltos de %s: faltan %s', v_nombre, public.fmt_gramos(-v_s)));
    END IF;
    IF v_e < 0 AND v_e < v_e_old THEN
      v_faltas := array_append(v_faltas,
        format('No alcanza el stock de enrolados de %s: faltan %s', v_nombre, public.fmt_gramos(-v_e)));
    END IF;

    UPDATE public.geneticas
    SET gramos_disponibles = v_s, gramos_enrolados = v_e
    WHERE id = v_id::uuid;
  END LOOP;

  IF array_length(v_faltas, 1) > 0 THEN
    RAISE EXCEPTION '%', array_to_string(v_faltas, ' · ') USING ERRCODE = 'VB006';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.geneticas_de_entrega(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enrolados_por_genetica(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.stock_pools_preparar(uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.stock_pools_cerrar(jsonb, jsonb, jsonb) FROM PUBLIC, anon, authenticated;

-- =============================================================================
-- 4) Puntos de entrada de la app (reemplazan los de 066)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.registrar_entrega(
  p_socio_id uuid,
  p_lineas jsonb,
  p_pago_efectivo numeric,
  p_pago_transferencia numeric,
  p_notas text,
  p_fecha timestamptz,
  p_autorizacion_id uuid DEFAULT NULL
)
RETURNS SETOF public.ventas
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_venta public.ventas%ROWTYPE;
  v_snap jsonb;
BEGIN
  IF EXISTS (SELECT 1 FROM public.socios WHERE id = p_socio_id AND es_generico) THEN
    RAISE EXCEPTION 'Este registro genérico ya no admite entregas nuevas. Cargá a la persona en Externos.'
      USING ERRCODE = 'VB002';
  END IF;

  v_snap := public.stock_pools_preparar(public.geneticas_de_entrega(NULL, p_lineas));

  SELECT * INTO v_venta
  FROM public.registrar_venta(p_socio_id, p_lineas, p_pago_efectivo, p_pago_transferencia, p_notas, p_fecha);

  PERFORM public.stock_pools_cerrar(v_snap, '{}'::jsonb, public.enrolados_por_genetica(v_venta.id));

  PERFORM public.aplicar_reglas_entrega(v_venta.id, false, NULL, NULL, 0, 0, p_autorizacion_id);

  RETURN QUERY SELECT * FROM public.ventas WHERE id = v_venta.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.editar_entrega(
  p_venta_id uuid,
  p_socio_id uuid,
  p_lineas jsonb,
  p_notas text,
  p_fecha timestamptz,
  p_autorizacion_id uuid DEFAULT NULL
)
RETURNS SETOF public.ventas
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_antes public.ventas%ROWTYPE;
  v_sueltos_antes numeric;
  v_enr_antes jsonb;
  v_snap jsonb;
BEGIN
  -- Bloquea la entrega primero, igual que editar_venta (065).
  SELECT * INTO v_antes FROM public.ventas WHERE id = p_venta_id FOR UPDATE;
  v_sueltos_antes := COALESCE(public.gramos_sueltos_venta(p_venta_id), 0);
  v_enr_antes := public.enrolados_por_genetica(p_venta_id);

  IF p_socio_id IS DISTINCT FROM v_antes.socio_id
     AND EXISTS (SELECT 1 FROM public.socios WHERE id = p_socio_id AND es_generico) THEN
    RAISE EXCEPTION 'Este registro genérico ya no admite entregas nuevas. Cargá a la persona en Externos.'
      USING ERRCODE = 'VB002';
  END IF;

  v_snap := public.stock_pools_preparar(public.geneticas_de_entrega(p_venta_id, p_lineas));

  -- editar_venta valida que la entrega exista (VE001).
  PERFORM 1 FROM public.editar_venta(p_venta_id, p_socio_id, p_lineas, p_notas, p_fecha);

  PERFORM public.stock_pools_cerrar(v_snap, v_enr_antes, public.enrolados_por_genetica(p_venta_id));

  PERFORM public.aplicar_reglas_entrega(
    p_venta_id, true, v_antes.socio_id, v_antes.created_at, v_sueltos_antes,
    COALESCE(v_antes.saldo_pendiente, 0), p_autorizacion_id
  );

  RETURN QUERY SELECT * FROM public.ventas WHERE id = p_venta_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.eliminar_entrega(p_venta_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_enr_antes jsonb;
  v_snap jsonb;
BEGIN
  PERFORM 1 FROM public.ventas WHERE id = p_venta_id FOR UPDATE;
  v_enr_antes := public.enrolados_por_genetica(p_venta_id);
  v_snap := public.stock_pools_preparar(public.geneticas_de_entrega(p_venta_id, NULL));

  -- eliminar_venta valida que la entrega exista (VD001) y devuelve el stock.
  PERFORM public.eliminar_venta(p_venta_id);

  PERFORM public.stock_pools_cerrar(v_snap, v_enr_antes, '{}'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_entrega(uuid, jsonb, numeric, numeric, text, timestamptz, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_entrega(uuid, jsonb, numeric, numeric, text, timestamptz, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.editar_entrega(uuid, uuid, jsonb, text, timestamptz, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.editar_entrega(uuid, uuid, jsonb, text, timestamptz, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.eliminar_entrega(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.eliminar_entrega(uuid) TO authenticated;

-- El acceso directo a eliminar_venta se cierra en 067, junto con
-- registrar_venta/editar_venta, después de publicar el frontend nuevo.

COMMIT;

-- =============================================================================
-- ROLLBACK
-- =============================================================================
--
-- Antes de borrar la columna, devolver los enrolados a sueltos:
--   BEGIN;
--   UPDATE public.geneticas SET gramos_disponibles = gramos_disponibles + gramos_enrolados WHERE gramos_enrolados <> 0;
--   DROP FUNCTION IF EXISTS public.eliminar_entrega(uuid);
--   DROP FUNCTION IF EXISTS public.movimiento_stock(uuid, text, text, numeric, text);
--   -- re-correr la sección 6 de 066 (registrar_entrega/editar_entrega originales)
--   DROP FUNCTION IF EXISTS public.stock_pools_cerrar(jsonb, jsonb, jsonb);
--   DROP FUNCTION IF EXISTS public.stock_pools_preparar(uuid[]);
--   DROP FUNCTION IF EXISTS public.enrolados_por_genetica(uuid);
--   DROP FUNCTION IF EXISTS public.geneticas_de_entrega(uuid, jsonb);
--   DROP TABLE IF EXISTS public.movimientos_stock;
--   ALTER TABLE public.geneticas DROP COLUMN IF EXISTS gramos_enrolados;
--   COMMIT;
