-- Retribuciones: descontar la deuda del sueldo (pedido de Facu, 03/11/2026).
--
-- NO SE EJECUTÓ TODAVÍA. Correr a mano en el SQL Editor de Supabase, después
-- de 090. Se puede correr antes de publicar la app nueva: la versión publicada
-- sigue liquidando igual que antes (el parámetro nuevo vale 0 si no se manda).
--
-- Hasta ahora, si a un miembro se le pagaba "en flor", Liquidar lo tomaba como
-- un retiro nuevo: la flor salía otra vez del stock y la deuda de lo que ya se
-- había llevado seguía igual. Ahora el sueldo cancela esa deuda y en plata (o
-- flor nueva) va solo la diferencia.
--
-- 1) liquidaciones_equipo.monto_deuda: la parte del sueldo que canceló deuda
--    (total = dinero + valor_producto + monto_deuda) y gasto_deuda_id, su gasto.
--
-- 2) Pagos con el método 'retribucion' (pagos.liquidacion_id dice de qué
--    liquidación salieron). Cada entrega que se cancela recibe uno, igual que
--    un pago en efectivo, pero no es plata que entra a la caja. La entrega
--    pagada toda así queda con metodo_pago 'retribucion'; si además tuvo pagos
--    en plata, 'mixto'.
--
-- 3) liquidar_retribucion(..., p_monto_deuda): cancela deuda del socio
--    vinculado a la persona, de la entrega más vieja a la más nueva, solo de
--    entregas anteriores al día 5 del mes siguiente al liquidado (el consumo
--    de un mes va del 5 al 4: el sueldo de octubre descuenta hasta el 4/11).
--    En Gastos queda como retribución pagada en producto (cuenta en el
--    resultado, no en la caja), igual que pagar en flor: es la flor que ya se
--    llevó.
--
-- 4) anular_liquidacion: además devuelve la deuda a cada entrega.
--
-- 5) Protecciones: un pago con la retribución no se borra ni se cambia a mano,
--    tampoco borrando la entrega: se anula desde Retribuciones. Y si una
--    entrega pagada en parte con el sueldo se termina de pagar en plata, queda
--    'mixto' y no como si toda hubiera entrado en efectivo.
--
-- Script idempotente, envuelto en una transacción.

BEGIN;

-- 1. Liquidaciones: la parte del sueldo que cancela deuda ---------------------
ALTER TABLE public.liquidaciones_equipo
  ADD COLUMN IF NOT EXISTS monto_deuda numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gasto_deuda_id uuid REFERENCES public.gastos(id) ON DELETE RESTRICT;

ALTER TABLE public.liquidaciones_equipo DROP CONSTRAINT IF EXISTS liquidaciones_equipo_monto_deuda_check;
ALTER TABLE public.liquidaciones_equipo
  ADD CONSTRAINT liquidaciones_equipo_monto_deuda_check CHECK (monto_deuda >= 0);

-- 2. Pagos con la retribución -------------------------------------------------
ALTER TABLE public.pagos
  ADD COLUMN IF NOT EXISTS liquidacion_id uuid REFERENCES public.liquidaciones_equipo(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS pagos_liquidacion_id_idx ON public.pagos (liquidacion_id) WHERE liquidacion_id IS NOT NULL;

ALTER TABLE public.pagos DROP CONSTRAINT IF EXISTS pagos_metodo_pago_check;
ALTER TABLE public.pagos
  ADD CONSTRAINT pagos_metodo_pago_check CHECK (metodo_pago IN ('efectivo', 'transferencia', 'retribucion'));

ALTER TABLE public.pagos DROP CONSTRAINT IF EXISTS pagos_retribucion_check;
ALTER TABLE public.pagos
  ADD CONSTRAINT pagos_retribucion_check CHECK ((metodo_pago = 'retribucion') = (liquidacion_id IS NOT NULL));

ALTER TABLE public.ventas DROP CONSTRAINT IF EXISTS metodo_pago_check;
ALTER TABLE public.ventas
  ADD CONSTRAINT metodo_pago_check
  CHECK (metodo_pago IN ('efectivo', 'transferencia', 'pendiente', 'mixto', 'retribucion'));

-- 3. Liquidar descontando la deuda --------------------------------------------
-- La firma cambia (un parámetro más al final, con valor por defecto): se borra
-- la anterior para que no queden dos versiones.
DROP FUNCTION IF EXISTS public.liquidar_retribucion(uuid, date, date, numeric, text, uuid, numeric, integer, numeric, text);

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
  p_nota text DEFAULT NULL,
  p_monto_deuda numeric DEFAULT 0
)
RETURNS SETOF public.liquidaciones_equipo
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_miembro public.retribuciones_equipo%ROWTYPE;
  v_gen public.geneticas%ROWTYPE;
  v_periodo date := date_trunc('month', p_periodo)::date;
  v_dinero numeric := round(COALESCE(p_dinero, 0), 2);
  v_deuda numeric := round(COALESCE(p_monto_deuda, 0), 2);
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
  v_gasto_deuda uuid;
  v_detalle text;
  v_liq public.liquidaciones_equipo%ROWTYPE;
  -- Hasta cuándo cuentan las entregas cuya deuda se descuenta (sin incluirlo).
  v_corte timestamptz;
  v_deuda_disponible numeric := 0;
  v_entrega record;
  v_restante numeric;
  v_aplicar numeric;
  v_fecha_pago timestamptz;
BEGIN
  IF NOT public.tiene_permiso('retribuciones.liquidar') THEN
    RAISE EXCEPTION 'Tu usuario no tiene permiso para liquidar retribuciones' USING ERRCODE = 'EQ004';
  END IF;

  SELECT * INTO v_miembro FROM public.retribuciones_equipo WHERE id = p_miembro_id FOR UPDATE;
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
  IF v_dinero < 0 OR v_gramos < 0 OR v_cant < 0 OR v_peso < 0 OR v_deuda < 0 THEN
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

  -- La deuda que se descuenta: entregas del socio con saldo, anteriores al día
  -- 5 del mes siguiente (hora argentina). Se bloquean primero, para que nadie
  -- las pague mientras tanto.
  IF v_deuda > 0 THEN
    IF v_miembro.socio_id IS NULL THEN
      RAISE EXCEPTION '% no está vinculado a un socio: editalo para descontar su deuda', v_miembro.nombre
        USING ERRCODE = 'EQ008';
    END IF;
    v_corte := (v_periodo + interval '1 month 4 days') AT TIME ZONE 'America/Argentina/Buenos_Aires';
    PERFORM 1 FROM public.ventas
    WHERE socio_id = v_miembro.socio_id AND COALESCE(saldo_pendiente, 0) > 0 AND created_at < v_corte
    ORDER BY created_at, id
    FOR UPDATE;
    SELECT COALESCE(sum(saldo_pendiente), 0) INTO v_deuda_disponible
    FROM public.ventas
    WHERE socio_id = v_miembro.socio_id AND COALESCE(saldo_pendiente, 0) > 0 AND created_at < v_corte;
    IF v_deuda > v_deuda_disponible THEN
      RAISE EXCEPTION 'La deuda de % hasta el % es de %', v_miembro.nombre,
        to_char(v_periodo + interval '1 month 3 days', 'FMDD/FMMM'), public.fmt_pesos(v_deuda_disponible)
        USING ERRCODE = 'EQ008';
    END IF;
  END IF;

  v_total := v_dinero + v_valor_producto + v_deuda;
  IF v_total <= 0 THEN
    RAISE EXCEPTION 'Cargá la plata o el producto que se entrega, o la deuda que se descuenta' USING ERRCODE = 'EQ001';
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

  -- La parte que cancela deuda: no mueve caja, igual que pagar en flor (es la
  -- flor que ya se llevó).
  IF v_deuda > 0 THEN
    INSERT INTO public.gastos (descripcion, monto, metodo_pago, categoria, fecha)
    VALUES (format('Retribución %s (%s): se descontó de su deuda', v_miembro.nombre, v_mes),
            v_deuda, 'producto', v_categoria, p_fecha)
    RETURNING id INTO v_gasto_deuda;
  END IF;

  INSERT INTO public.liquidaciones_equipo (
    miembro_id, periodo, fecha, dinero, metodo_pago, genetica_id, gramos, cantidad_enrolados, peso_enrolados,
    precio_gramo, precio_enrolado, valor_producto, monto_deuda, total, gasto_dinero_id, gasto_producto_id,
    gasto_deuda_id, nota, usuario_id, usuario_nombre
  ) VALUES (
    v_miembro.id, v_periodo, p_fecha, v_dinero, CASE WHEN v_dinero > 0 THEN p_metodo_pago END,
    CASE WHEN v_valor_producto > 0 THEN v_gen.id END, v_gramos, v_cant, v_peso,
    COALESCE(v_gen.precio_gramo_miembro, 0), COALESCE(v_gen.precio_enrolado_miembro, 0), v_valor_producto, v_deuda,
    v_total, v_gasto_dinero, v_gasto_producto, v_gasto_deuda, NULLIF(btrim(COALESCE(p_nota, '')), ''),
    auth.uid(), v_nombre_usuario
  ) RETURNING * INTO v_liq;

  -- Cancela la deuda de la entrega más vieja a la más nueva. Cada entrega
  -- recibe un pago 'retribucion' con la fecha de la liquidación (la hora de
  -- ahora si es de hoy).
  IF v_deuda > 0 THEN
    v_fecha_pago := CASE
      WHEN p_fecha = (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date THEN now()
      ELSE (p_fecha + time '12:00') AT TIME ZONE 'America/Argentina/Buenos_Aires'
    END;
    v_restante := v_deuda;
    FOR v_entrega IN
      SELECT id, saldo_pendiente FROM public.ventas
      WHERE socio_id = v_miembro.socio_id AND COALESCE(saldo_pendiente, 0) > 0 AND created_at < v_corte
      ORDER BY created_at, id
    LOOP
      EXIT WHEN v_restante <= 0;
      v_aplicar := LEAST(v_restante, v_entrega.saldo_pendiente);

      INSERT INTO public.pagos (venta_id, monto, metodo_pago, notas, fecha, liquidacion_id)
      VALUES (v_entrega.id, v_aplicar, 'retribucion',
              format('Descontado de la retribución de %s (%s)', v_miembro.nombre, v_mes), v_fecha_pago, v_liq.id);

      UPDATE public.ventas AS vt
      SET saldo_pendiente = vt.saldo_pendiente - v_aplicar,
          monto_pagado = COALESCE(vt.monto_pagado, 0) + v_aplicar,
          metodo_pago = CASE
            WHEN vt.saldo_pendiente - v_aplicar > 0 THEN 'pendiente'
            WHEN EXISTS (SELECT 1 FROM public.pagos AS pg WHERE pg.venta_id = vt.id AND pg.metodo_pago <> 'retribucion') THEN 'mixto'
            ELSE 'retribucion'
          END
      WHERE vt.id = v_entrega.id;

      v_restante := v_restante - v_aplicar;
    END LOOP;

    IF v_restante > 0 THEN
      RAISE EXCEPTION 'La deuda de % cambió mientras se liquidaba: probá de nuevo', v_miembro.nombre USING ERRCODE = 'EQ008';
    END IF;
  END IF;

  PERFORM set_config('monarca.liquidando', '', true);
  RETURN NEXT v_liq;
END;
$$;

REVOKE ALL ON FUNCTION public.liquidar_retribucion(uuid, date, date, numeric, text, uuid, numeric, integer, numeric, text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.liquidar_retribucion(uuid, date, date, numeric, text, uuid, numeric, integer, numeric, text, numeric) TO authenticated;

-- 4. Anular: también devuelve la deuda a cada entrega -------------------------
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
  v_pago record;
BEGIN
  IF NOT public.tiene_permiso('retribuciones.liquidar') THEN
    RAISE EXCEPTION 'Tu usuario no tiene permiso para anular liquidaciones' USING ERRCODE = 'EQ004';
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

    SELECT nombre INTO v_nombre FROM public.retribuciones_equipo WHERE id = v_liq.miembro_id;
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

  -- La deuda que se había cancelado con el sueldo vuelve a cada entrega.
  FOR v_pago IN
    SELECT pg.id, pg.venta_id, pg.monto FROM public.pagos AS pg
    WHERE pg.liquidacion_id = v_liq.id
    ORDER BY pg.venta_id
  LOOP
    DELETE FROM public.pagos WHERE id = v_pago.id;
    UPDATE public.ventas AS vt
    SET saldo_pendiente = COALESCE(vt.saldo_pendiente, 0) + v_pago.monto,
        monto_pagado = GREATEST(COALESCE(vt.monto_pagado, 0) - v_pago.monto, 0),
        metodo_pago = 'pendiente'
    WHERE vt.id = v_pago.venta_id;
  END LOOP;

  DELETE FROM public.liquidaciones_equipo WHERE id = v_liq.id;
  DELETE FROM public.gastos WHERE id IN (v_liq.gasto_dinero_id, v_liq.gasto_producto_id, v_liq.gasto_deuda_id);
  PERFORM set_config('monarca.liquidando', '', true);
END;
$$;

-- 5. Protecciones -------------------------------------------------------------
-- 5a. El gasto de la parte descontada se protege igual que los otros gastos de
--     una liquidación (se anula desde Retribuciones).
CREATE OR REPLACE FUNCTION public.proteger_gasto_liquidacion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF current_setting('monarca.liquidando', true) = 'si' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.liquidaciones_equipo
    WHERE gasto_dinero_id = OLD.id OR gasto_producto_id = OLD.id OR gasto_deuda_id = OLD.id
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

  IF TG_OP <> 'DELETE' AND NEW.metodo_pago = 'producto' AND OLD.metodo_pago IS DISTINCT FROM 'producto' THEN
    RAISE EXCEPTION 'Los pagos en producto se registran al liquidar retribuciones' USING ERRCODE = 'EQ006';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- 5b. Un pago con la retribución solo lo crean y lo borran las funciones de
--     Retribuciones: ni a mano, ni corrigiendo su método, ni borrando la
--     entrega. Las notas, la fecha y el comprobante se pueden cambiar.
CREATE OR REPLACE FUNCTION public.proteger_pago_retribucion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_bloquear boolean := false;
  v_quien text;
BEGIN
  IF current_setting('monarca.liquidando', true) = 'si' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.metodo_pago = 'retribucion' OR NEW.liquidacion_id IS NOT NULL THEN
      RAISE EXCEPTION 'Los pagos con la retribución se registran al liquidar retribuciones' USING ERRCODE = 'EQ006';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.metodo_pago = 'retribucion' OR OLD.liquidacion_id IS NOT NULL THEN
    IF TG_OP = 'DELETE' THEN
      v_bloquear := true;
    ELSE
      v_bloquear := NEW.venta_id IS DISTINCT FROM OLD.venta_id
        OR NEW.monto IS DISTINCT FROM OLD.monto
        OR NEW.metodo_pago IS DISTINCT FROM OLD.metodo_pago
        OR NEW.liquidacion_id IS DISTINCT FROM OLD.liquidacion_id;
    END IF;
    IF v_bloquear THEN
      SELECT format('%s (%s)', r.nombre, to_char(l.periodo, 'MM/YYYY')) INTO v_quien
      FROM public.liquidaciones_equipo AS l
      JOIN public.retribuciones_equipo AS r ON r.id = l.miembro_id
      WHERE l.id = OLD.liquidacion_id;
      RAISE EXCEPTION 'Esta entrega se pagó con la retribución de %. Para cambiarla o borrarla, primero anulá esa liquidación en Retribuciones del equipo.',
        COALESCE(v_quien, 'alguien del equipo') USING ERRCODE = 'EQ006';
    END IF;
  ELSIF TG_OP = 'UPDATE' AND (NEW.metodo_pago = 'retribucion' OR NEW.liquidacion_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Los pagos con la retribución se registran al liquidar retribuciones' USING ERRCODE = 'EQ006';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION public.proteger_pago_retribucion() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS pagos_proteger_retribucion ON public.pagos;
CREATE TRIGGER pagos_proteger_retribucion
  BEFORE INSERT OR UPDATE OR DELETE ON public.pagos
  FOR EACH ROW EXECUTE FUNCTION public.proteger_pago_retribucion();

-- 5c. Una entrega que se terminó de pagar y tiene pagos con la retribución no
--     queda como "efectivo" o "transferencia" (sería plata que no entró):
--     queda 'retribucion' si se pagó toda así, o 'mixto' si también hubo plata.
--     Cubre a registrar_pago_venta, registrar_pago_socio, corregir_metodo_pago
--     y editar_venta sin tocarlas.
CREATE OR REPLACE FUNCTION public.ventas_metodo_con_retribucion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF COALESCE(NEW.saldo_pendiente, 0) <= 0
     AND NEW.metodo_pago IN ('efectivo', 'transferencia', 'mixto', 'retribucion')
     AND EXISTS (SELECT 1 FROM public.pagos WHERE venta_id = NEW.id AND metodo_pago = 'retribucion') THEN
    NEW.metodo_pago := CASE
      WHEN EXISTS (SELECT 1 FROM public.pagos WHERE venta_id = NEW.id AND metodo_pago <> 'retribucion') THEN 'mixto'
      ELSE 'retribucion'
    END;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.ventas_metodo_con_retribucion() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS ventas_metodo_con_retribucion ON public.ventas;
CREATE TRIGGER ventas_metodo_con_retribucion
  BEFORE UPDATE OF metodo_pago, saldo_pendiente ON public.ventas
  FOR EACH ROW EXECUTE FUNCTION public.ventas_metodo_con_retribucion();

COMMIT;

-- =============================================================================
-- VERIFICACIÓN Y ROLLBACK
-- =============================================================================
--   Liquidaciones con deuda descontada y los pagos que generaron:
--   SELECT l.periodo, r.nombre, l.monto_deuda, count(p.id) AS entregas, sum(p.monto) AS pagado
--   FROM public.liquidaciones_equipo l
--   JOIN public.retribuciones_equipo r ON r.id = l.miembro_id
--   LEFT JOIN public.pagos p ON p.liquidacion_id = l.id
--   WHERE l.monto_deuda > 0
--   GROUP BY 1, 2, 3 ORDER BY 1 DESC;
--
--   Volver atrás: con p_monto_deuda en 0 (lo que manda la versión anterior de
--   la app) liquidar_retribucion hace exactamente lo mismo que antes, así que
--   alcanza con volver a publicar esa versión. Para sacar también lo que ya se
--   descontó: anular desde Retribuciones esas liquidaciones (la deuda vuelve a
--   las entregas) y después
--   DROP TRIGGER pagos_proteger_retribucion ON public.pagos;
--   DROP TRIGGER ventas_metodo_con_retribucion ON public.ventas;
