-- Etapa 4A — Alta transaccional de ventas.
--
-- Por qué: hasta ahora components/ventas-manager.tsx registraba una venta con
-- 5 a 8 llamadas independientes a PostgREST (insert de ventas, insert de
-- pagos, insert de detalle_venta + update de stock por cada línea, update de
-- socios), y sólo el insert de ventas chequeaba su error. Si cualquiera de
-- los pasos siguientes fallaba, la venta quedaba a medias (sin pago
-- registrado, sin detalle, o con stock no descontado) y la UI igual la
-- mostraba como exitosa. El descuento de stock además se calculaba en el
-- cliente sobre un valor leído al abrir la página.
--
-- Esta etapa reemplaza esa secuencia por una única función SECURITY DEFINER
-- (registrar_venta) invocada con una sola llamada RPC. Al ser una única
-- función plpgsql, toda la ejecución corre en una sola transacción: si
-- cualquier RAISE EXCEPTION interrumpe la función, Postgres revierte
-- automáticamente todo lo que esa llamada ya haya escrito.
--
-- Fuera de alcance a propósito (Monarca es una app interna operada por una
-- sola persona a la vez, no hace falta a esta escala): idempotency_key,
-- columnas o índices nuevos, pg_advisory_xact_lock, y cualquier manejo de
-- solicitudes concurrentes. El frontend ya deshabilita el botón de submit
-- mientras la venta se está procesando (loading=true). El riesgo residual de
-- un doble envío accidental (doble click antes de que se aplique el
-- disabled, o un reintento manual tras una respuesta de red perdida) se
-- acepta a esta escala y queda documentado para reconsiderar si en el futuro
-- hay más de un operador o mayor concurrencia real.
--
-- tipo_venta: se confirmó contra la base real (no contra scripts/026, cuyo
-- contenido no coincide con el constraint vigente) que el CHECK actual es
--   CHECK (tipo_venta IN ('gramos', 'enrolados', 'mixto', 'producto'))
-- Esta función replica exactamente la lógica de getTipoVenta() del cliente
-- (ventas-manager.tsx:226-243), incluyendo sus casos "no intuitivos":
--   sólo gramos                    -> gramos
--   sólo enrolados                 -> enrolados
--   sólo producto                  -> producto
--   gramos + enrolados             -> mixto
--   gramos + producto (sin enrol.) -> producto   (NO "mixto")
--   enrolados + producto (sin gr.) -> enrolados  (NO "mixto")
--   gramos + enrolados + producto  -> mixto
--
-- socios.gramos_consumidos_mes: esta función NO la actualiza. Es una
-- columna INTEGER sin corte de mes (nada la resetea), y las dos pantallas
-- que muestran "consumo mensual" (app/ventas/page.tsx, app/socios/page.tsx)
-- ya la recalculan desde cero sumando ventas.gramos del mes en curso,
-- pisando lo que diga la columna. Dejar de escribirla no cambia nada visible
-- y evita seguir arrastrando redondeo de DECIMAL a INTEGER sin corte de mes.
--
-- Redondeos: replican paso a paso los de ventas-manager.tsx (no sólo el
-- resultado final) — peso de enrolados y gramos totales por línea a 1
-- decimal, subtotales y total acumulados a 2 decimales, redondeando en cada
-- paso de la suma igual que el reduce() del cliente.
--
-- Precios: precedencia miembro > VIP > regular para genéticas, precio plano
-- sin tier para productos (igual que hoy), con COALESCE(..., 0) replicando
-- el fallback `|| 0` del cliente ante precios nulos.
--
-- Campos legado en ventas: genetica_id (primera línea válida de tipo
-- genética, o NULL) y precio_unitario (el precio por gramo de la única línea,
-- sólo si la venta tiene exactamente UNA línea válida de tipo genética; 0 en
-- cualquier otro caso). El cliente hoy evalúa esta condición sobre el arreglo
-- de líneas SIN filtrar (que siempre puede traer filas en blanco del
-- formulario) — esta función la evalúa sobre la cantidad de líneas ya
-- filtradas y válidas que efectivamente llegaron en p_lineas, que es lo que
-- el frontend nuevo va a enviar (ver comentario en ventas-manager.tsx). Es
-- una pequeña corrección respecto del comportamiento anterior, no un cambio
-- de comportamiento visible: en el flujo viejo una fila en blanco adicional
-- ya rompía esta cuenta silenciosamente (dejaba precio_unitario en 0 aunque
-- la venta tuviera efectivamente una sola línea con cantidad).
--
-- Validación: p_lineas es un array JSON de objetos con la misma forma que
-- LineaVenta en el cliente (tipo, genetica_id, producto_id, gramos,
-- cantidad_enrolados, peso_por_enrolado, cantidad_producto). La función
-- nunca lee precio_unitario/subtotal/total del JSON aunque el cliente los
-- mande — todo precio y total se calcula server-side, contra los precios y
-- el stock vigentes en el momento de la llamada.
--
-- Errores: códigos SQLSTATE propios de 5 caracteres (VT001..VT008, mismo
-- esquema que MC001..MC008 de scripts/058), con mensaje pensado para
-- mostrarse tal cual en la UI. Cualquier otro error (interno/inesperado) el
-- cliente lo muestra como mensaje genérico, sin exponer el detalle interno.
--
-- Permisos: SECURITY DEFINER + SET search_path = '' (referencias siempre
-- calificadas public.<tabla>). REVOKE ALL FROM PUBLIC + GRANT EXECUTE sólo a
-- authenticated (NO anon: la pantalla de ventas siempre requiere sesión real
-- de Supabase Auth).
--
-- Script idempotente: CREATE OR REPLACE FUNCTION + su propio REVOKE/GRANT,
-- se puede re-correr sin error. No crea columnas, índices ni tablas nuevas.
-- Envuelto en una transacción (BEGIN/COMMIT).
--
-- Instrucciones de prueba y de rollback: ver el final de este archivo.

BEGIN;

CREATE OR REPLACE FUNCTION public.registrar_venta(
  p_socio_id uuid,
  p_lineas jsonb,
  p_pago_efectivo numeric,
  p_pago_transferencia numeric,
  p_notas text,
  p_fecha timestamptz
)
RETURNS SETOF public.ventas
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_socio public.socios%ROWTYPE;
  v_genetica public.geneticas%ROWTYPE;
  v_producto public.productos%ROWTYPE;

  v_elem jsonb;
  v_idx int := 0;
  v_tipo text;
  v_genetica_id uuid;
  v_producto_id uuid;
  v_gramos numeric;
  v_cant_enr numeric;
  v_peso_enr numeric;
  v_cant_prod numeric;

  -- Cantidad agregada a descontar por ítem distinto (una venta puede tener
  -- dos líneas de la misma genética/producto).
  v_gen_ids uuid[] := '{}';
  v_gen_qty numeric[] := '{}';
  v_gen_stock numeric[] := '{}';
  v_gen_nombre text[] := '{}';
  v_prod_ids uuid[] := '{}';
  v_prod_qty numeric[] := '{}';
  v_prod_stock numeric[] := '{}';
  v_prod_nombre text[] := '{}';
  v_pos int;

  -- Una entrada por línea válida, en orden, para insertar detalle_venta al
  -- final (los nombres coinciden 1 a 1 con columnas de detalle_venta).
  v_d_genetica_id uuid[] := '{}';
  v_d_producto_id uuid[] := '{}';
  v_d_gramos numeric[] := '{}';
  v_d_cantidad_enrolados numeric[] := '{}';
  v_d_peso_por_enrolado numeric[] := '{}';
  v_d_peso_enrolados numeric[] := '{}';
  v_d_precio_unitario numeric[] := '{}';
  v_d_precio_enrolado numeric[] := '{}';
  v_d_subtotal numeric[] := '{}';
  v_d_es_genetica boolean[] := '{}';

  v_cant_lineas_validas int := 0;
  v_tiene_gramos boolean := false;
  v_tiene_enrolados boolean := false;
  v_tiene_producto boolean := false;
  v_tipo_venta text;

  v_precio_gramo numeric;
  v_precio_enrolado numeric;
  v_precio_producto numeric;
  v_peso_enrolados_linea numeric;
  v_gramos_totales_linea numeric;
  v_subtotal_linea numeric;

  v_gramos_totales numeric := 0;
  v_total numeric := 0;
  v_monto_pagado numeric;
  v_saldo_pendiente numeric;
  v_metodo_pago text;

  v_genetica_legacy_id uuid := NULL;
  v_precio_unitario_legacy numeric := 0;
  v_primera_es_genetica boolean := false;

  v_new_venta_id uuid;
  i int;
BEGIN
  ----------------------------------------------------------------------
  -- 1) Validaciones generales
  ----------------------------------------------------------------------
  IF p_socio_id IS NULL THEN
    RAISE EXCEPTION 'Seleccioná un socio' USING ERRCODE = 'VT006';
  END IF;

  IF p_fecha IS NULL THEN
    RAISE EXCEPTION 'La fecha de la venta es obligatoria' USING ERRCODE = 'VT005';
  END IF;

  IF p_lineas IS NULL OR jsonb_typeof(p_lineas) <> 'array' OR jsonb_array_length(p_lineas) = 0 THEN
    RAISE EXCEPTION 'Agregá al menos un producto con cantidad válida' USING ERRCODE = 'VT005';
  END IF;

  IF p_pago_efectivo IS NULL OR p_pago_transferencia IS NULL
     OR p_pago_efectivo < 0 OR p_pago_transferencia < 0 THEN
    RAISE EXCEPTION 'Los montos de pago no pueden ser negativos' USING ERRCODE = 'VT007';
  END IF;

  SELECT * INTO v_socio FROM public.socios WHERE id = p_socio_id AND activo = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El socio seleccionado no existe o está inactivo' USING ERRCODE = 'VT006';
  END IF;

  ----------------------------------------------------------------------
  -- 2) Parseo, validación y cálculo por línea (sólo lecturas, nada se
  --    escribe todavía)
  ----------------------------------------------------------------------
  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_lineas)
  LOOP
    v_idx := v_idx + 1;
    v_tipo := v_elem->>'tipo';

    IF v_tipo IS NULL OR v_tipo NOT IN ('genetica', 'producto') THEN
      RAISE EXCEPTION 'Línea %: tipo de línea inválido', v_idx USING ERRCODE = 'VT001';
    END IF;

    BEGIN
      v_genetica_id := NULLIF(v_elem->>'genetica_id', '')::uuid;
      v_producto_id := NULLIF(v_elem->>'producto_id', '')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'Línea %: identificador inválido', v_idx USING ERRCODE = 'VT001';
    END;

    BEGIN
      v_gramos := COALESCE((v_elem->>'gramos')::numeric, 0);
      v_cant_enr := COALESCE((v_elem->>'cantidad_enrolados')::numeric, 0);
      v_peso_enr := COALESCE((v_elem->>'peso_por_enrolado')::numeric, 0);
      v_cant_prod := COALESCE((v_elem->>'cantidad_producto')::numeric, 0);
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION 'Línea %: cantidad inválida', v_idx USING ERRCODE = 'VT003';
    END;

    IF v_gramos < 0 OR v_cant_enr < 0 OR v_peso_enr < 0 OR v_cant_prod < 0 THEN
      RAISE EXCEPTION 'Línea %: las cantidades no pueden ser negativas', v_idx USING ERRCODE = 'VT003';
    END IF;

    IF v_cant_enr <> trunc(v_cant_enr) OR v_cant_prod <> trunc(v_cant_prod) THEN
      RAISE EXCEPTION 'Línea %: la cantidad de enrolados/productos debe ser un número entero', v_idx USING ERRCODE = 'VT003';
    END IF;

    IF v_tipo = 'genetica' THEN
      IF v_genetica_id IS NULL THEN
        RAISE EXCEPTION 'Línea %: falta la genética', v_idx USING ERRCODE = 'VT002';
      END IF;
      IF v_cant_enr > 0 AND v_peso_enr <= 0 THEN
        RAISE EXCEPTION 'Línea %: ingresá el peso por enrolado', v_idx USING ERRCODE = 'VT004';
      END IF;
      IF v_gramos <= 0 AND v_cant_enr <= 0 THEN
        CONTINUE; -- línea sin cantidad cargada: se ignora, igual que hoy
      END IF;

      SELECT * INTO v_genetica FROM public.geneticas WHERE id = v_genetica_id AND activo = true;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Línea %: la genética no existe o está inactiva', v_idx USING ERRCODE = 'VT002';
      END IF;

      v_precio_gramo := CASE
        WHEN v_socio.es_miembro THEN COALESCE(v_genetica.precio_gramo_miembro, 0)
        WHEN v_socio.es_vip THEN COALESCE(v_genetica.precio_gramo_vip, 0)
        ELSE COALESCE(v_genetica.precio_por_gramo, 0)
      END;
      v_precio_enrolado := CASE
        WHEN v_socio.es_miembro THEN COALESCE(v_genetica.precio_enrolado_miembro, 0)
        WHEN v_socio.es_vip THEN COALESCE(v_genetica.precio_enrolado_vip, 0)
        ELSE COALESCE(v_genetica.precio_por_enrolado, 0)
      END;

      v_peso_enrolados_linea := round(v_cant_enr * v_peso_enr, 1);
      v_gramos_totales_linea := round(v_gramos + v_peso_enrolados_linea, 1);
      v_subtotal_linea := round(round(v_gramos * v_precio_gramo, 2) + round(v_cant_enr * v_precio_enrolado, 2), 2);

      v_gramos_totales := round(v_gramos_totales + v_gramos_totales_linea, 1);
      v_total := round(v_total + v_subtotal_linea, 2);

      v_tiene_gramos := v_tiene_gramos OR (v_gramos > 0);
      v_tiene_enrolados := v_tiene_enrolados OR (v_cant_enr > 0);

      v_pos := array_position(v_gen_ids, v_genetica_id);
      IF v_pos IS NULL THEN
        v_gen_ids := array_append(v_gen_ids, v_genetica_id);
        v_gen_qty := array_append(v_gen_qty, v_gramos_totales_linea);
        v_gen_stock := array_append(v_gen_stock, v_genetica.gramos_disponibles);
        v_gen_nombre := array_append(v_gen_nombre, v_genetica.nombre);
      ELSE
        v_gen_qty[v_pos] := v_gen_qty[v_pos] + v_gramos_totales_linea;
      END IF;

      IF v_genetica_legacy_id IS NULL THEN
        v_genetica_legacy_id := v_genetica_id;
        v_primera_es_genetica := true;
      END IF;

      v_d_genetica_id := array_append(v_d_genetica_id, v_genetica_id);
      v_d_producto_id := array_append(v_d_producto_id, NULL::uuid);
      v_d_gramos := array_append(v_d_gramos, v_gramos);
      v_d_cantidad_enrolados := array_append(v_d_cantidad_enrolados, NULLIF(v_cant_enr, 0));
      v_d_peso_por_enrolado := array_append(v_d_peso_por_enrolado, NULLIF(v_peso_enr, 0));
      v_d_peso_enrolados := array_append(v_d_peso_enrolados, NULLIF(v_peso_enrolados_linea, 0));
      v_d_precio_unitario := array_append(v_d_precio_unitario, v_precio_gramo);
      v_d_precio_enrolado := array_append(v_d_precio_enrolado, NULLIF(v_precio_enrolado, 0));
      v_d_subtotal := array_append(v_d_subtotal, v_subtotal_linea);
      v_d_es_genetica := array_append(v_d_es_genetica, true);

    ELSE -- producto
      IF v_producto_id IS NULL THEN
        RAISE EXCEPTION 'Línea %: falta el producto', v_idx USING ERRCODE = 'VT002';
      END IF;
      IF v_cant_prod <= 0 THEN
        CONTINUE; -- línea sin cantidad cargada: se ignora, igual que hoy
      END IF;

      SELECT * INTO v_producto FROM public.productos WHERE id = v_producto_id AND activo = true;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Línea %: el producto no existe o está inactivo', v_idx USING ERRCODE = 'VT002';
      END IF;

      v_precio_producto := COALESCE(v_producto.precio, 0);
      v_subtotal_linea := round(v_cant_prod * v_precio_producto, 2);
      v_total := round(v_total + v_subtotal_linea, 2);
      v_tiene_producto := true;

      v_pos := array_position(v_prod_ids, v_producto_id);
      IF v_pos IS NULL THEN
        v_prod_ids := array_append(v_prod_ids, v_producto_id);
        v_prod_qty := array_append(v_prod_qty, v_cant_prod);
        v_prod_stock := array_append(v_prod_stock, v_producto.cantidad::numeric);
        v_prod_nombre := array_append(v_prod_nombre, v_producto.nombre);
      ELSE
        v_prod_qty[v_pos] := v_prod_qty[v_pos] + v_cant_prod;
      END IF;

      v_d_genetica_id := array_append(v_d_genetica_id, NULL::uuid);
      v_d_producto_id := array_append(v_d_producto_id, v_producto_id);
      v_d_gramos := array_append(v_d_gramos, 0);
      v_d_cantidad_enrolados := array_append(v_d_cantidad_enrolados, v_cant_prod); -- convención existente: reutiliza esta columna para la cantidad de producto
      v_d_peso_por_enrolado := array_append(v_d_peso_por_enrolado, NULL::numeric);
      v_d_peso_enrolados := array_append(v_d_peso_enrolados, NULL::numeric);
      v_d_precio_unitario := array_append(v_d_precio_unitario, v_precio_producto);
      v_d_precio_enrolado := array_append(v_d_precio_enrolado, NULL::numeric);
      v_d_subtotal := array_append(v_d_subtotal, v_subtotal_linea);
      v_d_es_genetica := array_append(v_d_es_genetica, false);
    END IF;

    v_cant_lineas_validas := v_cant_lineas_validas + 1;
  END LOOP;

  IF v_cant_lineas_validas = 0 THEN
    RAISE EXCEPTION 'Agregá al menos un producto con cantidad válida' USING ERRCODE = 'VT005';
  END IF;

  -- precio_unitario legado: sólo si la ÚNICA línea válida es de genética
  -- (replica `lineas.length === 1 && lineas[0].tipo === "genetica"` del
  -- cliente, evaluado acá sobre las líneas ya filtradas — ver comentario al
  -- principio del archivo).
  IF v_cant_lineas_validas = 1 AND v_primera_es_genetica THEN
    v_precio_unitario_legacy := v_d_precio_unitario[1];
  ELSE
    v_precio_unitario_legacy := 0;
  END IF;

  ----------------------------------------------------------------------
  -- 3) tipo_venta — replica exacta de getTipoVenta() (ventas-manager.tsx),
  --    valores confirmados contra el CHECK real de la base.
  ----------------------------------------------------------------------
  IF v_tiene_gramos AND v_tiene_enrolados AND v_tiene_producto THEN
    v_tipo_venta := 'mixto';
  ELSIF v_tiene_gramos AND v_tiene_enrolados THEN
    v_tipo_venta := 'mixto';
  ELSIF v_tiene_enrolados THEN
    v_tipo_venta := 'enrolados';
  ELSIF v_tiene_producto THEN
    v_tipo_venta := 'producto';
  ELSE
    v_tipo_venta := 'gramos';
  END IF;

  ----------------------------------------------------------------------
  -- 4) Validación de stock suficiente (sólo lectura de lo ya calculado en
  --    el paso 2 — todavía no se escribió nada)
  ----------------------------------------------------------------------
  FOR i IN 1..COALESCE(array_length(v_gen_ids, 1), 0) LOOP
    IF v_gen_qty[i] > v_gen_stock[i] THEN
      RAISE EXCEPTION 'Stock insuficiente de %. Disponible: %g', v_gen_nombre[i], v_gen_stock[i] USING ERRCODE = 'VT008';
    END IF;
  END LOOP;

  FOR i IN 1..COALESCE(array_length(v_prod_ids, 1), 0) LOOP
    IF v_prod_qty[i] > v_prod_stock[i] THEN
      RAISE EXCEPTION 'Stock insuficiente de %. Disponible: %', v_prod_nombre[i], v_prod_stock[i] USING ERRCODE = 'VT008';
    END IF;
  END LOOP;

  ----------------------------------------------------------------------
  -- 5) Validación de pago
  ----------------------------------------------------------------------
  IF p_pago_efectivo + p_pago_transferencia > v_total THEN
    RAISE EXCEPTION 'El pago excede el total de la venta' USING ERRCODE = 'VT007';
  END IF;

  v_monto_pagado := p_pago_efectivo + p_pago_transferencia;
  v_saldo_pendiente := GREATEST(0, v_total - v_monto_pagado);

  v_metodo_pago := 'efectivo';
  IF v_saldo_pendiente >= v_total THEN
    v_metodo_pago := 'pendiente';
  ELSIF p_pago_transferencia > p_pago_efectivo THEN
    v_metodo_pago := 'transferencia';
  ELSIF p_pago_efectivo > 0 THEN
    v_metodo_pago := 'efectivo';
  ELSIF v_saldo_pendiente > 0 THEN
    v_metodo_pago := 'pendiente';
  END IF;

  ----------------------------------------------------------------------
  -- 6) Escritura — recién acá se modifica algo. Todo dentro de esta misma
  --    función/transacción: si algo de acá en adelante fallara, Postgres
  --    revierte todo lo anterior automáticamente.
  ----------------------------------------------------------------------
  INSERT INTO public.ventas (
    socio_id, genetica_id, gramos, precio_unitario, total, notas, created_at,
    metodo_pago, tipo_venta, saldo_pendiente, monto_pagado
  ) VALUES (
    p_socio_id, v_genetica_legacy_id, v_gramos_totales, v_precio_unitario_legacy, v_total, p_notas, p_fecha,
    v_metodo_pago, v_tipo_venta, v_saldo_pendiente, v_monto_pagado
  )
  RETURNING id INTO v_new_venta_id;

  FOR i IN 1..v_cant_lineas_validas LOOP
    INSERT INTO public.detalle_venta (
      venta_id, genetica_id, producto_id, gramos, cantidad_enrolados,
      peso_por_enrolado, peso_enrolados, precio_unitario, precio_enrolado, subtotal
    ) VALUES (
      v_new_venta_id, v_d_genetica_id[i], v_d_producto_id[i], v_d_gramos[i], v_d_cantidad_enrolados[i],
      v_d_peso_por_enrolado[i], v_d_peso_enrolados[i], v_d_precio_unitario[i], v_d_precio_enrolado[i], v_d_subtotal[i]
    );
  END LOOP;

  IF p_pago_efectivo > 0 THEN
    INSERT INTO public.pagos (venta_id, monto, metodo_pago, fecha)
    VALUES (v_new_venta_id, p_pago_efectivo, 'efectivo', p_fecha);
  END IF;

  IF p_pago_transferencia > 0 THEN
    INSERT INTO public.pagos (venta_id, monto, metodo_pago, fecha)
    VALUES (v_new_venta_id, p_pago_transferencia, 'transferencia', p_fecha);
  END IF;

  FOR i IN 1..COALESCE(array_length(v_gen_ids, 1), 0) LOOP
    UPDATE public.geneticas
    SET gramos_disponibles = gramos_disponibles - v_gen_qty[i],
        updated_at = now()
    WHERE id = v_gen_ids[i];
  END LOOP;

  FOR i IN 1..COALESCE(array_length(v_prod_ids, 1), 0) LOOP
    UPDATE public.productos
    SET cantidad = cantidad - v_prod_qty[i],
        updated_at = now()
    WHERE id = v_prod_ids[i];
  END LOOP;

  -- socios.gramos_consumidos_mes: a propósito NO se actualiza (ver
  -- comentario al principio del archivo).

  RETURN QUERY SELECT * FROM public.ventas WHERE id = v_new_venta_id;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_venta(uuid, jsonb, numeric, numeric, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_venta(uuid, jsonb, numeric, numeric, text, timestamptz) TO authenticated;

COMMIT;

-- =============================================================================
-- PRUEBAS MANUALES (correr en el SQL Editor de Supabase, logueado como
-- postgres/owner; reemplazar los UUID de ejemplo por ids reales de tu base
-- de QA antes de correr).
-- =============================================================================
--
-- Todo lo que sigue puede probarse dentro de BEGIN; ... ROLLBACK; para no
-- dejar ningún rastro en datos reales (ventas, pagos, detalle_venta ni
-- cambios de stock), salvo que quieras confirmar visualmente el resultado en
-- la UI, en cuyo caso conviene usar un socio/genética/producto de prueba
-- claramente identificable (ej. nombre "TEST-QA") y borrar manualmente lo
-- creado después.
--
-- 1) Venta simple de genética, socio regular/miembro/VIP — confirmar que el
--    precio coincide con lo que mostraba la UI antes del cambio:
--
--   BEGIN;
--   SELECT * FROM public.registrar_venta(
--     '<socio_id>'::uuid,
--     '[{"tipo":"genetica","genetica_id":"<genetica_id>","producto_id":"","gramos":5,"cantidad_enrolados":0,"peso_por_enrolado":0,"cantidad_producto":0}]'::jsonb,
--     100, 0, 'prueba', now()
--   );
--   ROLLBACK;
--
-- 2) Venta mixta con la MISMA genética repetida en dos líneas (para validar
--    que la cantidad a descontar se agrega antes de chequear stock):
--
--   BEGIN;
--   SELECT * FROM public.registrar_venta(
--     '<socio_id>'::uuid,
--     '[
--       {"tipo":"genetica","genetica_id":"<genetica_id>","producto_id":"","gramos":2,"cantidad_enrolados":0,"peso_por_enrolado":0,"cantidad_producto":0},
--       {"tipo":"genetica","genetica_id":"<genetica_id>","producto_id":"","gramos":3,"cantidad_enrolados":0,"peso_por_enrolado":0,"cantidad_producto":0}
--     ]'::jsonb,
--     0, 0, NULL, now()
--   );
--   ROLLBACK;
--
-- 3) Stock insuficiente — pedir más de lo disponible, confirmar VT008 y que
--    no queda nada escrito (no hace falta ROLLBACK explícito porque la
--    excepción ya revierte todo, pero se puede envolver en BEGIN/ROLLBACK
--    igual):
--
--   SELECT * FROM public.registrar_venta(
--     '<socio_id>'::uuid,
--     '[{"tipo":"genetica","genetica_id":"<genetica_id>","producto_id":"","gramos":999999,"cantidad_enrolados":0,"peso_por_enrolado":0,"cantidad_producto":0}]'::jsonb,
--     0, 0, NULL, now()
--   );
--   -- Esperado: ERROR con código VT008 y mensaje "Stock insuficiente de ...".
--
-- 4) Pago que excede el total — confirmar VT007:
--
--   SELECT * FROM public.registrar_venta(
--     '<socio_id>'::uuid,
--     '[{"tipo":"producto","genetica_id":"","producto_id":"<producto_id>","gramos":0,"cantidad_enrolados":0,"peso_por_enrolado":0,"cantidad_producto":1}]'::jsonb,
--     999999, 0, NULL, now()
--   );
--   -- Esperado: ERROR VT007.
--
-- 5) Identificador con formato inválido — confirmar que no se filtra un
--    error crudo de Postgres, sino VT001:
--
--   SELECT * FROM public.registrar_venta(
--     '<socio_id>'::uuid,
--     '[{"tipo":"genetica","genetica_id":"no-es-un-uuid","producto_id":"","gramos":1,"cantidad_enrolados":0,"peso_por_enrolado":0,"cantidad_producto":0}]'::jsonb,
--     0, 0, NULL, now()
--   );
--   -- Esperado: ERROR VT001.
--
-- 6) p_lineas vacío — confirmar VT005:
--
--   SELECT * FROM public.registrar_venta('<socio_id>'::uuid, '[]'::jsonb, 0, 0, NULL, now());
--
-- 7) tipo_venta — probar las 7 combinaciones del comentario del encabezado
--    (sólo gramos, sólo enrolados, sólo producto, gramos+enrolados,
--    gramos+producto, enrolados+producto, las tres juntas) y confirmar que
--    el valor insertado en ventas.tipo_venta es el esperado en cada caso.
--
-- 8) Permisos — confirmar que sólo `authenticated` puede ejecutar la
--    función:
--    a) Desde la aplicación logueada: registrar una venta real y confirmar
--       que se registra igual que con el flujo viejo.
--    b) Con SÓLO la anon key pública (sin cookie de sesión), hacer
--       POST /rest/v1/rpc/registrar_venta con cualquier body y confirmar que
--       devuelve un error de permiso (403 / 42501), no que ejecuta la
--       función.
--
-- =============================================================================
-- ROLLBACK
-- =============================================================================
--
-- Esta función no crea columnas, índices ni tablas nuevas — sólo se agrega
-- a sí misma. Para deshacer sólo este script (sin tocar el frontend, o
-- después de haberlo revertido):
--
--   DROP FUNCTION IF EXISTS public.registrar_venta(uuid, jsonb, numeric, numeric, text, timestamptz);
--
-- El flujo viejo de components/ventas-manager.tsx (si se revierte ese commit)
-- sigue funcionando sin cambios, porque este script no modificó ninguna
-- tabla ni policy existente.
