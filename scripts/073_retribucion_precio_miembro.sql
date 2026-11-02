-- Las retribuciones en producto se valoran al precio de Miembro (el precio
-- "staff" son los miembros). Reemplaza liquidar_retribucion de 072 para usar
-- precio_gramo_miembro / precio_enrolado_miembro.
--
-- Las columnas precio_*_staff que agregó 072 se borran en 074, después de
-- publicar el frontend que ya no las manda.

BEGIN;

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
    IF v_gramos > 0 AND COALESCE(v_gen.precio_gramo_miembro, 0) <= 0 THEN
      RAISE EXCEPTION '% no tiene precio de miembro por gramo cargado (se carga en Stock)', v_gen.nombre USING ERRCODE = 'EQ001';
    END IF;
    IF v_cant > 0 AND COALESCE(v_gen.precio_enrolado_miembro, 0) <= 0 THEN
      RAISE EXCEPTION '% no tiene precio de miembro por enrolado cargado (se carga en Stock)', v_gen.nombre USING ERRCODE = 'EQ001';
    END IF;
    IF v_gramos > v_gen.gramos_disponibles THEN
      RAISE EXCEPTION 'No alcanza el stock de sueltos de %: hay %', v_gen.nombre, public.fmt_gramos(v_gen.gramos_disponibles)
        USING ERRCODE = 'EQ002';
    END IF;
    IF v_peso > v_gen.gramos_enrolados THEN
      RAISE EXCEPTION 'No alcanza el stock de enrolados de %: hay %', v_gen.nombre, public.fmt_gramos(v_gen.gramos_enrolados)
        USING ERRCODE = 'EQ002';
    END IF;
    v_valor_producto := round(v_gramos * v_gen.precio_gramo_miembro + v_cant * v_gen.precio_enrolado_miembro, 2);
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
    COALESCE(v_gen.precio_gramo_miembro, 0), COALESCE(v_gen.precio_enrolado_miembro, 0), v_valor_producto, v_total,
    v_gasto_dinero, v_gasto_producto, NULLIF(btrim(COALESCE(p_nota, '')), ''), auth.uid(), v_nombre_usuario
  ) RETURNING * INTO v_liq;

  PERFORM set_config('monarca.liquidando', '', true);
  RETURN NEXT v_liq;
END;
$$;

REVOKE ALL ON FUNCTION public.liquidar_retribucion(uuid, date, date, numeric, text, uuid, numeric, integer, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.liquidar_retribucion(uuid, date, date, numeric, text, uuid, numeric, integer, numeric, text) TO authenticated;

COMMIT;
