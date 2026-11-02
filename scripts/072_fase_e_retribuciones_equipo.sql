-- Fase E — retribuciones del equipo.
--
-- 1) equipo: una ficha por persona con su retribución mensual y si la cobra
--    en dinero o en producto. Sólo la comisión lo ve y lo administra.
--
-- 2) Precio staff en cada genética (por gramo y por enrolado): lo que se
--    cobra en producto se valora a ese precio.
--
-- 3) liquidar_retribucion(): el día de pago se carga cuánta plata y/o cuántos
--    gramos sueltos y enrolados de una genética se le dan. El producto se
--    valora al precio staff y se descuenta de su stock (sueltos de
--    gramos_disponibles, enrolados de gramos_enrolados, con registro en
--    movimientos_stock). Cada parte queda como gasto de "Retribuciones del
--    equipo": la plata con su método de pago, el producto con método
--    'producto' (cuenta en el resultado del mes pero no mueve caja).
--    Lo que no se retira queda pendiente en ese mes y se liquida después;
--    no se puede liquidar más que la retribución del mes.
--
-- 4) anular_liquidacion(): devuelve el producto a su stock y borra los gastos.
--    Los gastos de una liquidación no se editan ni se borran desde Gastos.
--
-- Errores:
--   EQ001  datos inválidos
--   EQ002  no alcanza el stock
--   EQ003  supera lo que queda de la retribución del mes
--   EQ004  sólo la comisión
--   EQ005  la persona o la liquidación no existe
--   EQ006  el gasto es parte de una liquidación
--   EQ007  falta la categoría "Retribuciones del equipo"

BEGIN;

-- =============================================================================
-- 1) Esquema
-- =============================================================================

ALTER TABLE public.geneticas
  ADD COLUMN IF NOT EXISTS precio_gramo_staff numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS precio_enrolado_staff numeric NOT NULL DEFAULT 0;

ALTER TABLE public.gastos DROP CONSTRAINT IF EXISTS gastos_metodo_pago_check;
ALTER TABLE public.gastos
  ADD CONSTRAINT gastos_metodo_pago_check CHECK (metodo_pago IN ('efectivo', 'transferencia', 'producto'));

ALTER TABLE public.movimientos_stock DROP CONSTRAINT IF EXISTS movimientos_stock_tipo_check;
ALTER TABLE public.movimientos_stock
  ADD CONSTRAINT movimientos_stock_tipo_check CHECK (tipo IN ('ingreso', 'traspaso', 'retribucion'));

CREATE TABLE IF NOT EXISTS public.equipo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL CHECK (btrim(nombre) <> ''),
  retribucion_mensual numeric(14,2) NOT NULL CHECK (retribucion_mensual >= 0),
  forma_cobro text NOT NULL DEFAULT 'dinero' CHECK (forma_cobro IN ('dinero', 'producto')),
  -- Primer mes que se le debe la retribución.
  desde date NOT NULL DEFAULT date_trunc('month', CURRENT_DATE)::date,
  activo boolean NOT NULL DEFAULT true,
  nota text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.liquidaciones_equipo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  miembro_id uuid NOT NULL REFERENCES public.equipo(id) ON DELETE RESTRICT,
  periodo date NOT NULL CHECK (periodo = date_trunc('month', periodo)::date),
  fecha date NOT NULL,
  dinero numeric(14,2) NOT NULL DEFAULT 0 CHECK (dinero >= 0),
  metodo_pago text CHECK (metodo_pago IN ('efectivo', 'transferencia')),
  genetica_id uuid REFERENCES public.geneticas(id) ON DELETE RESTRICT,
  gramos numeric(10,2) NOT NULL DEFAULT 0 CHECK (gramos >= 0),
  cantidad_enrolados integer NOT NULL DEFAULT 0 CHECK (cantidad_enrolados >= 0),
  peso_enrolados numeric(10,2) NOT NULL DEFAULT 0 CHECK (peso_enrolados >= 0),
  precio_gramo numeric NOT NULL DEFAULT 0,
  precio_enrolado numeric NOT NULL DEFAULT 0,
  valor_producto numeric(14,2) NOT NULL DEFAULT 0,
  total numeric(14,2) NOT NULL CHECK (total > 0),
  gasto_dinero_id uuid REFERENCES public.gastos(id) ON DELETE RESTRICT,
  gasto_producto_id uuid REFERENCES public.gastos(id) ON DELETE RESTRICT,
  nota text,
  usuario_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  usuario_nombre text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS liquidaciones_equipo_miembro_idx ON public.liquidaciones_equipo (miembro_id, periodo);

ALTER TABLE public.equipo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.liquidaciones_equipo ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS equipo_comision ON public.equipo;
CREATE POLICY equipo_comision ON public.equipo
  FOR ALL TO authenticated
  USING (public.rol_actual() = 'comision')
  WITH CHECK (public.rol_actual() = 'comision');

-- Las liquidaciones sólo se escriben con liquidar_retribucion / anular_liquidacion.
DROP POLICY IF EXISTS liquidaciones_equipo_select ON public.liquidaciones_equipo;
CREATE POLICY liquidaciones_equipo_select ON public.liquidaciones_equipo
  FOR SELECT TO authenticated USING (public.rol_actual() = 'comision');

REVOKE ALL ON public.equipo, public.liquidaciones_equipo FROM anon;

-- =============================================================================
-- 2) Los gastos de una liquidación no se tocan desde Gastos
-- =============================================================================

CREATE OR REPLACE FUNCTION public.proteger_gasto_liquidacion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Las funciones de este script avisan que están trabajando con esta marca.
  IF current_setting('monarca.liquidando', true) = 'si' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.liquidaciones_equipo
    WHERE gasto_dinero_id = OLD.id OR gasto_producto_id = OLD.id
  ) AND (
    TG_OP = 'DELETE'
    OR NEW.monto IS DISTINCT FROM OLD.monto
    OR NEW.metodo_pago IS DISTINCT FROM OLD.metodo_pago
    OR NEW.fecha IS DISTINCT FROM OLD.fecha
    OR NEW.categoria IS DISTINCT FROM OLD.categoria
  ) THEN
    RAISE EXCEPTION 'Este gasto es una liquidación de retribuciones: se anula desde Retribuciones del equipo'
      USING ERRCODE = 'EQ006';
  END IF;

  -- Un gasto común no puede pasar a "producto": eso sólo lo hace una liquidación.
  IF TG_OP <> 'DELETE' AND NEW.metodo_pago = 'producto' AND OLD.metodo_pago IS DISTINCT FROM 'producto' THEN
    RAISE EXCEPTION 'Los pagos en producto se registran al liquidar retribuciones' USING ERRCODE = 'EQ006';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION public.proteger_gasto_liquidacion() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS gastos_proteger_liquidacion ON public.gastos;
CREATE TRIGGER gastos_proteger_liquidacion
  BEFORE UPDATE OR DELETE ON public.gastos
  FOR EACH ROW EXECUTE FUNCTION public.proteger_gasto_liquidacion();

CREATE OR REPLACE FUNCTION public.proteger_gasto_producto_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.metodo_pago = 'producto' AND current_setting('monarca.liquidando', true) IS DISTINCT FROM 'si' THEN
    RAISE EXCEPTION 'Los pagos en producto se registran al liquidar retribuciones' USING ERRCODE = 'EQ006';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.proteger_gasto_producto_insert() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS gastos_proteger_producto ON public.gastos;
CREATE TRIGGER gastos_proteger_producto
  BEFORE INSERT ON public.gastos
  FOR EACH ROW EXECUTE FUNCTION public.proteger_gasto_producto_insert();

-- =============================================================================
-- 3) Liquidar
-- =============================================================================

CREATE OR REPLACE FUNCTION public.liquidar_retribucion(
  p_miembro_id uuid,
  p_periodo date,
  p_fecha date,
  p_dinero numeric,
  p_metodo_pago text,
  p_genetica_id uuid,
  p_gramos numeric,
  p_cantidad_enrolados integer,
  p_peso_por_enrolado numeric,
  p_nota text DEFAULT NULL
)
RETURNS SETOF public.liquidaciones_equipo
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_miembro public.equipo%ROWTYPE;
  v_gen public.geneticas%ROWTYPE;
  v_periodo date := date_trunc('month', p_periodo)::date;
  v_dinero numeric := round(COALESCE(p_dinero, 0), 2);
  v_gramos numeric := round(COALESCE(p_gramos, 0), 2);
  v_cant integer := COALESCE(p_cantidad_enrolados, 0);
  v_peso numeric := round(v_cant * COALESCE(p_peso_por_enrolado, 0), 2);
  v_valor_producto numeric := 0;
  v_total numeric;
  v_liquidado numeric;
  v_categoria text;
  v_nombre_usuario text;
  v_mes text;
  v_gasto_dinero uuid;
  v_gasto_producto uuid;
  v_detalle text;
  v_liq public.liquidaciones_equipo%ROWTYPE;
BEGIN
  IF public.rol_actual() IS DISTINCT FROM 'comision' THEN
    RAISE EXCEPTION 'Sólo la comisión directiva liquida retribuciones' USING ERRCODE = 'EQ004';
  END IF;

  SELECT * INTO v_miembro FROM public.equipo WHERE id = p_miembro_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La persona indicada no existe' USING ERRCODE = 'EQ005';
  END IF;

  IF p_periodo IS NULL OR p_fecha IS NULL THEN
    RAISE EXCEPTION 'Falta el mes o la fecha de la liquidación' USING ERRCODE = 'EQ001';
  END IF;
  IF v_periodo < date_trunc('month', v_miembro.desde)::date
     OR v_periodo > date_trunc('month', (now() AT TIME ZONE 'America/Argentina/Buenos_Aires'))::date THEN
    RAISE EXCEPTION 'El mes no corresponde a la retribución de %', v_miembro.nombre USING ERRCODE = 'EQ001';
  END IF;
  IF v_dinero < 0 OR v_gramos < 0 OR v_cant < 0 OR v_peso < 0 THEN
    RAISE EXCEPTION 'Los montos y cantidades no pueden ser negativos' USING ERRCODE = 'EQ001';
  END IF;
  IF v_dinero > 0 AND (p_metodo_pago IS NULL OR p_metodo_pago NOT IN ('efectivo', 'transferencia')) THEN
    RAISE EXCEPTION 'Elegí cómo se paga la plata' USING ERRCODE = 'EQ001';
  END IF;
  IF v_cant > 0 AND v_peso <= 0 THEN
    RAISE EXCEPTION 'Indicá cuánto pesa cada enrolado' USING ERRCODE = 'EQ001';
  END IF;

  IF v_gramos > 0 OR v_cant > 0 THEN
    SELECT * INTO v_gen FROM public.geneticas WHERE id = p_genetica_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Elegí la genética que se entrega' USING ERRCODE = 'EQ001';
    END IF;
    IF v_gramos > 0 AND COALESCE(v_gen.precio_gramo_staff, 0) <= 0 THEN
      RAISE EXCEPTION '% no tiene precio staff por gramo cargado (se carga en Stock)', v_gen.nombre USING ERRCODE = 'EQ001';
    END IF;
    IF v_cant > 0 AND COALESCE(v_gen.precio_enrolado_staff, 0) <= 0 THEN
      RAISE EXCEPTION '% no tiene precio staff por enrolado cargado (se carga en Stock)', v_gen.nombre USING ERRCODE = 'EQ001';
    END IF;
    IF v_gramos > v_gen.gramos_disponibles THEN
      RAISE EXCEPTION 'No alcanza el stock de sueltos de %: hay %', v_gen.nombre, public.fmt_gramos(v_gen.gramos_disponibles)
        USING ERRCODE = 'EQ002';
    END IF;
    IF v_peso > v_gen.gramos_enrolados THEN
      RAISE EXCEPTION 'No alcanza el stock de enrolados de %: hay %', v_gen.nombre, public.fmt_gramos(v_gen.gramos_enrolados)
        USING ERRCODE = 'EQ002';
    END IF;
    v_valor_producto := round(v_gramos * v_gen.precio_gramo_staff + v_cant * v_gen.precio_enrolado_staff, 2);
  END IF;

  v_total := v_dinero + v_valor_producto;
  IF v_total <= 0 THEN
    RAISE EXCEPTION 'Cargá la plata o el producto que se entrega' USING ERRCODE = 'EQ001';
  END IF;

  SELECT COALESCE(sum(total), 0) INTO v_liquidado
  FROM public.liquidaciones_equipo WHERE miembro_id = v_miembro.id AND periodo = v_periodo;

  IF v_liquidado + v_total > v_miembro.retribucion_mensual THEN
    RAISE EXCEPTION 'Supera la retribución del mes de %: quedan %', v_miembro.nombre,
      public.fmt_pesos(GREATEST(v_miembro.retribucion_mensual - v_liquidado, 0)) USING ERRCODE = 'EQ003';
  END IF;

  SELECT nombre INTO v_categoria FROM public.categorias_gasto WHERE nombre = 'Retribuciones del equipo';
  IF v_categoria IS NULL THEN
    RAISE EXCEPTION 'Falta la categoría de gastos "Retribuciones del equipo"' USING ERRCODE = 'EQ007';
  END IF;

  v_nombre_usuario := (SELECT nombre FROM public.perfiles WHERE user_id = auth.uid());
  v_mes := to_char(v_periodo, 'MM/YYYY');

  PERFORM set_config('monarca.liquidando', 'si', true);

  IF v_dinero > 0 THEN
    INSERT INTO public.gastos (descripcion, monto, metodo_pago, categoria, fecha)
    VALUES (format('Retribución %s (%s)', v_miembro.nombre, v_mes), v_dinero, p_metodo_pago, v_categoria, p_fecha)
    RETURNING id INTO v_gasto_dinero;
  END IF;

  IF v_valor_producto > 0 THEN
    v_detalle := concat_ws(' + ',
      CASE WHEN v_gramos > 0 THEN public.fmt_gramos(v_gramos) || ' sueltos' END,
      CASE WHEN v_cant > 0 THEN v_cant || ' enrolados' END);
    INSERT INTO public.gastos (descripcion, monto, metodo_pago, categoria, fecha)
    VALUES (format('Retribución %s (%s) en producto: %s de %s', v_miembro.nombre, v_mes, v_detalle, v_gen.nombre),
            v_valor_producto, 'producto', v_categoria, p_fecha)
    RETURNING id INTO v_gasto_producto;

    UPDATE public.geneticas
    SET gramos_disponibles = gramos_disponibles - v_gramos,
        gramos_enrolados = gramos_enrolados - v_peso,
        updated_at = now()
    WHERE id = v_gen.id;

    IF v_gramos > 0 THEN
      INSERT INTO public.movimientos_stock (genetica_id, tipo, destino, gramos, sueltos_antes, sueltos_despues,
        enrolados_antes, enrolados_despues, nota, usuario_id, usuario_nombre)
      VALUES (v_gen.id, 'retribucion', 'sueltos', v_gramos, v_gen.gramos_disponibles, v_gen.gramos_disponibles - v_gramos,
        v_gen.gramos_enrolados, v_gen.gramos_enrolados - v_peso, 'Retribución ' || v_miembro.nombre, auth.uid(), v_nombre_usuario);
    END IF;
    IF v_peso > 0 THEN
      INSERT INTO public.movimientos_stock (genetica_id, tipo, destino, gramos, sueltos_antes, sueltos_despues,
        enrolados_antes, enrolados_despues, nota, usuario_id, usuario_nombre)
      VALUES (v_gen.id, 'retribucion', 'enrolados', v_peso, v_gen.gramos_disponibles, v_gen.gramos_disponibles - v_gramos,
        v_gen.gramos_enrolados, v_gen.gramos_enrolados - v_peso, 'Retribución ' || v_miembro.nombre, auth.uid(), v_nombre_usuario);
    END IF;
  END IF;

  INSERT INTO public.liquidaciones_equipo (
    miembro_id, periodo, fecha, dinero, metodo_pago, genetica_id, gramos, cantidad_enrolados, peso_enrolados,
    precio_gramo, precio_enrolado, valor_producto, total, gasto_dinero_id, gasto_producto_id, nota,
    usuario_id, usuario_nombre
  ) VALUES (
    v_miembro.id, v_periodo, p_fecha, v_dinero, CASE WHEN v_dinero > 0 THEN p_metodo_pago END,
    CASE WHEN v_valor_producto > 0 THEN v_gen.id END, v_gramos, v_cant, v_peso,
    COALESCE(v_gen.precio_gramo_staff, 0), COALESCE(v_gen.precio_enrolado_staff, 0), v_valor_producto, v_total,
    v_gasto_dinero, v_gasto_producto, NULLIF(btrim(COALESCE(p_nota, '')), ''), auth.uid(), v_nombre_usuario
  ) RETURNING * INTO v_liq;

  PERFORM set_config('monarca.liquidando', '', true);
  RETURN NEXT v_liq;
END;
$$;

CREATE OR REPLACE FUNCTION public.anular_liquidacion(p_liquidacion_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_liq public.liquidaciones_equipo%ROWTYPE;
  v_gen public.geneticas%ROWTYPE;
  v_nombre text;
BEGIN
  IF public.rol_actual() IS DISTINCT FROM 'comision' THEN
    RAISE EXCEPTION 'Sólo la comisión directiva anula liquidaciones' USING ERRCODE = 'EQ004';
  END IF;

  SELECT * INTO v_liq FROM public.liquidaciones_equipo WHERE id = p_liquidacion_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La liquidación indicada no existe' USING ERRCODE = 'EQ005';
  END IF;

  IF v_liq.genetica_id IS NOT NULL AND (v_liq.gramos > 0 OR v_liq.peso_enrolados > 0) THEN
    SELECT * INTO v_gen FROM public.geneticas WHERE id = v_liq.genetica_id FOR UPDATE;
    UPDATE public.geneticas
    SET gramos_disponibles = gramos_disponibles + v_liq.gramos,
        gramos_enrolados = gramos_enrolados + v_liq.peso_enrolados,
        updated_at = now()
    WHERE id = v_liq.genetica_id;

    SELECT nombre INTO v_nombre FROM public.equipo WHERE id = v_liq.miembro_id;
    INSERT INTO public.movimientos_stock (genetica_id, tipo, destino, gramos, sueltos_antes, sueltos_despues,
      enrolados_antes, enrolados_despues, nota, usuario_id, usuario_nombre)
    SELECT v_gen.id, 'ingreso', x.destino, x.gramos, v_gen.gramos_disponibles, v_gen.gramos_disponibles + v_liq.gramos,
      v_gen.gramos_enrolados, v_gen.gramos_enrolados + v_liq.peso_enrolados,
      'Anulación de retribución ' || v_nombre, auth.uid(),
      (SELECT nombre FROM public.perfiles WHERE user_id = auth.uid())
    FROM (VALUES ('sueltos', v_liq.gramos), ('enrolados', v_liq.peso_enrolados)) AS x(destino, gramos)
    WHERE x.gramos > 0;
  END IF;

  PERFORM set_config('monarca.liquidando', 'si', true);
  DELETE FROM public.liquidaciones_equipo WHERE id = v_liq.id;
  DELETE FROM public.gastos WHERE id IN (v_liq.gasto_dinero_id, v_liq.gasto_producto_id);
  PERFORM set_config('monarca.liquidando', '', true);
END;
$$;

REVOKE ALL ON FUNCTION public.liquidar_retribucion(uuid, date, date, numeric, text, uuid, numeric, integer, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.liquidar_retribucion(uuid, date, date, numeric, text, uuid, numeric, integer, numeric, text) TO authenticated;
REVOKE ALL ON FUNCTION public.anular_liquidacion(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.anular_liquidacion(uuid) TO authenticated;

COMMIT;

-- =============================================================================
-- ROLLBACK (antes, anular todas las liquidaciones para devolver el stock)
-- =============================================================================
--   BEGIN;
--   DROP FUNCTION IF EXISTS public.anular_liquidacion(uuid);
--   DROP FUNCTION IF EXISTS public.liquidar_retribucion(uuid, date, date, numeric, text, uuid, numeric, integer, numeric, text);
--   DROP TRIGGER IF EXISTS gastos_proteger_liquidacion ON public.gastos;
--   DROP TRIGGER IF EXISTS gastos_proteger_producto ON public.gastos;
--   DROP FUNCTION IF EXISTS public.proteger_gasto_liquidacion();
--   DROP FUNCTION IF EXISTS public.proteger_gasto_producto_insert();
--   DROP TABLE IF EXISTS public.liquidaciones_equipo;
--   DROP TABLE IF EXISTS public.equipo;
--   COMMIT;
