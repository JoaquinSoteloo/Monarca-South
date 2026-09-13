-- Etapa 4B1 — Edición y eliminación transaccional de ventas.
--
-- Por qué: components/historial-ventas.tsx editaba y borraba ventas con
-- varias llamadas independientes a PostgREST (devolver/descontar stock,
-- update de ventas, delete+insert de detalle_venta, delete de ventas). Si
-- cualquier paso fallaba a mitad de camino, stock/venta/detalle quedaban
-- inconsistentes. Esta etapa reemplaza ambos flujos por dos funciones
-- SECURITY DEFINER (editar_venta, eliminar_venta), cada una invocada con una
-- sola llamada RPC y ejecutada de punta a punta en una única transacción.
--
-- Alcance: sólo edición y eliminación de ventas ya existentes. No se toca
-- registrar_venta/registrar_pago_venta/registrar_pago_socio/
-- corregir_metodo_pago (scripts/062-064), ni Caja, ni limpieza de pagos
-- históricos duplicados.
--
-- =============================================================================
-- DECISIÓN CLAVE 1 — no se recalcula toda la venta con precios actuales.
-- =============================================================================
--
-- Cada línea de p_lineas ahora puede traer `detalle_id` (uuid de la fila
-- detalle_venta que representa), además de los campos que ya usa
-- registrar_venta (tipo, genetica_id, producto_id, gramos,
-- cantidad_enrolados, peso_por_enrolado, cantidad_producto).
--
-- Cada línea entrante se clasifica en tres clases, comparando contra el
-- estado de detalle_venta ANTES de cualquier escritura:
--
--   Clase A  ("sin cambios"): trae un detalle_id que pertenece a esta venta,
--             el mismo genetica_id/producto_id que esa fila, y la misma
--             cantidad. Qué cuenta como "misma cantidad" depende del tipo de
--             la línea (comparación type-aware, ver más abajo). Se copian
--             tal cual precio_unitario, precio_enrolado, peso_enrolados y
--             subtotal ya guardados — no se relee ni recalcula ningún precio
--             para esta línea.
--
--   Clase A2 ("cambia sólo la cantidad"): mismo detalle_id y mismo ítem que
--             una fila existente, pero cambia la cantidad. Se usa el precio
--             HISTÓRICO guardado en esa fila (precio_unitario,
--             precio_enrolado) y se recalcula subtotal (y peso_enrolados
--             para genéticas) con la cantidad nueva. Único caso especial: si
--             la fila histórica no tiene precio_enrolado guardado (ventas
--             legacy pre-detalle_venta, que nunca tuvieron ese dato) y la
--             edición agrega enrolados donde antes no había, se usa el
--             precio de enrolado ACTUAL para esa porción — no existe otro
--             valor posible. Limitación documentada, no evitable con el
--             esquema actual.
--
--   Clase B  ("nueva"): sin detalle_id, o con un detalle_id cuyo
--             genetica_id/producto_id no coincide con el de la fila original
--             (se interpreta como "cambiaron el ítem de esa línea": la fila
--             vieja se descarta, no se reinserta). Usa precio ACTUAL con la
--             misma jerarquía de 062 (miembro > VIP > regular para
--             genéticas, precio plano para productos).
--
-- Comparación "sin cambios" — DEPENDE DEL TIPO, para evitar comparar campos
-- que no le corresponden a la línea:
--   - genética: se comparan gramos, cantidad_enrolados y peso_por_enrolado
--     contra los mismos campos de la fila detalle_venta.
--   - producto: se compara cantidad_producto (entrante) contra
--     detalle_venta.cantidad_enrolados — el esquema reutiliza esa columna
--     para guardar históricamente la cantidad de producto (mismo criterio
--     que ya usa registrar_venta/062 al insertar). NUNCA se comparan
--     gramos/cantidad_enrolados/peso_por_enrolado en una línea de producto,
--     ni cantidad_producto en una línea de genética.
-- Una cantidad de producto sin cambios clasifica A y puede formar parte del
-- fast path igual que una línea de genética sin cambios.
--
-- Forma de línea: cada línea declara tipo = 'genetica' | 'producto'.
-- 'genetica' exige genetica_id y prohíbe producto_id; 'producto' exige
-- producto_id y prohíbe genetica_id (VE004 si no se cumple). Los campos de
-- cantidad que no corresponden al tipo declarado ni siquiera se leen del
-- JSON entrante — no participan de la clasificación, del cálculo de precios
-- ni de la agregación de stock.
--
-- Todo esto vive inline dentro de editar_venta — no se crea ninguna función
-- separada de "recalcular precios".
--
-- Ventas legacy sin detalle_venta: como no hay detalle_id posible, la
-- ÚNICA línea que puede clasificar como A/A2 es la primera línea de tipo
-- genética cuyo genetica_id coincide con ventas.genetica_id (sin detalle_id,
-- sin cantidad_enrolados nuevo). Usa como precio histórico
-- ventas.precio_unitario. Cualquier otra línea es clase B.
--
-- Fast path — "no cambiaron las líneas": si TODAS las líneas entrantes son
-- clase A y cubren exactamente el mismo conjunto de filas originales (mismo
-- recuento, sin duplicados — ya garantizado por la validación de
-- detalle_id), la función sólo hace
--   UPDATE ventas SET socio_id = ..., notas = ..., created_at = ...
-- y termina ahí: no toca total, monto_pagado, saldo_pendiente, metodo_pago,
-- tipo_venta, detalle_venta ni stock. Esto es lo que garantiza que editar
-- sólo fecha/notas/socio (con socio destino activo si cambia) no altera
-- importes ni stock. El fast path se detecta DESPUÉS de bloquear la venta
-- (ver decisión 3) y sigue disponible aunque cambie el socio, siempre que el
-- socio destino esté activo.
--
-- =============================================================================
-- DECISIÓN CLAVE 2 — ventas.metodo_pago no se toca arbitrariamente.
-- =============================================================================
--
--   nuevo_saldo > 0                                  -> 'pendiente'
--   saldo_pendiente ANTES = 0 Y nuevo_saldo = 0       -> se conserva tal cual
--                                                        estaba (no se lee
--                                                        ni se toca pagos)
--   saldo_pendiente ANTES > 0 Y nuevo_saldo = 0       -> método del último
--                                                        pago real de esta
--                                                        venta (fecha DESC
--                                                        NULLS LAST,
--                                                        created_at DESC
--                                                        NULLS LAST, id DESC
--                                                        — mismo criterio que
--                                                        scripts/064)
--   (mismo caso anterior, pero sin ninguna fila en pagos) -> se conserva el
--                                                        metodo_pago anterior
--                                                        tal cual, sin
--                                                        inventar un valor
--
-- ventas.monto_pagado NUNCA se recalcula desde SUM(pagos): existen pagos
-- históricos duplicados detectados y ventas.monto_pagado es el valor
-- operativo vigente. editar_venta lo deja completamente afuera de todo
-- UPDATE (no aparece en ningún SET), así que conserva el valor que ya tenía
-- pase lo que pase.
--
-- =============================================================================
-- DECISIÓN CLAVE 3 — orden de lectura y de locks.
-- =============================================================================
--
-- editar_venta:
--   1) SELECT ... FROM ventas WHERE id = p_venta_id FOR UPDATE (primero que
--      nada, antes de leer detalle_venta o decidir el fast path — si se
--      comparara el estado "antes" con datos leídos sin el lock de la venta
--      ya tomado, otra sesión podría modificar esos datos entre la
--      comparación y el UPDATE final).
--   2) Recién con la venta bloqueada, se lee detalle_venta, se detecta el
--      fast path y se clasifican las líneas.
--   3) Una vez calculada la unión de ids de genéticas/productos involucrados
--      (originales ∪ nuevos), se bloquean esas filas con
--      SELECT ... FOR UPDATE ORDER BY id (geneticas primero, luego
--      productos, cada grupo ordenado por id ascendente) ANTES de leer sus
--      precios actuales, `activo` o stock disponible para validar nada.
--
-- eliminar_venta sigue el mismo orden (ventas primero, luego geneticas
-- ordenadas por id, luego productos ordenados por id) por consistencia, pero
-- no depende de validaciones sobre esos datos.
--
-- Nota: no se afirma que registrar_venta (062) use este mismo orden de
-- locks — 062 no hace ningún SELECT ... FOR UPDATE sobre geneticas/productos,
-- sólo UPDATE directo. Este orden es propio de editar_venta/eliminar_venta,
-- documentado acá porque ambas SÍ necesitan bloquear antes de decidir si
-- rechazan la operación.
--
-- El truco de "SELECT ... FOR UPDATE ORDER BY id" para lockear en orden
-- determinista funciona porque en el plan de Postgres el nodo LockRows queda
-- por encima del Sort: las filas se ordenan primero y se bloquean una por
-- una a medida que se emiten en ese orden ya ordenado.
--
-- =============================================================================
-- DECISIÓN CLAVE 4 — socios inactivos.
-- =============================================================================
--
--   - Mismo socio (no cambia) y está inactivo: se permite editar fecha,
--     notas, o reducir/mantener cantidades (diff <= 0 en todo ítem). Se
--     rechaza (VE013) cualquier línea que implique diff > 0 en algún ítem
--     (agregar una línea nueva o aumentar una cantidad existente).
--   - Cambia a otro socio: ese socio destino debe estar activo (VE003), sin
--     excepción, incluso si no cambian las líneas (fast path incluido).
--
-- =============================================================================
-- DECISIÓN CLAVE 5 — ítems inactivos.
-- =============================================================================
--
-- Por cada ítem (genética/producto) en la unión de original ∪ nuevo:
--   diff = cantidad_nueva - cantidad_original
--   diff <= 0 -> siempre permitido (se puede conservar o reducir un ítem
--                inactivo).
--   diff > 0  -> VE013 si el socio actual (sin cambiar) está inactivo;
--                si no, VE012 si el ítem está inactivo; si no, VE011 si no
--                alcanza el stock.
--
-- =============================================================================
-- DECISIÓN CLAVE 6 — eliminar_venta no depende de ON DELETE CASCADE.
-- =============================================================================
--
-- Aunque detalle_venta.venta_id y pagos.venta_id tienen ON DELETE CASCADE
-- en el historial de migraciones (017, 027), eliminar_venta NO depende de
-- eso ni lo verifica en tiempo de ejecución: borra explícitamente, en este
-- orden, dentro de la misma función/transacción:
--   1) public.pagos
--   2) public.detalle_venta
--   3) public.ventas
-- Si cualquier paso falla, Postgres revierte todo lo anterior.
--
-- =============================================================================
-- DECISIÓN CLAVE 7 — las columnas `activo` son nullable: sólo `true` cuenta.
-- =============================================================================
--
-- socios.activo, geneticas.activo y productos.activo son BOOLEAN nullable
-- (sin NOT NULL en el esquema). `NOT activo` con `activo = NULL` da NULL, y
-- un `IF NULL THEN` en plpgsql se trata como falso — es decir, `IF NOT
-- v_fila.activo THEN ... END IF;` NUNCA dispara cuando `activo` es NULL,
-- dejando pasar un socio/ítem con `activo` desconocido como si estuviera
-- activo. Por eso:
--   - Socio DESTINO (al cambiar de socio): se exige `v_socio_nuevo.activo IS
--     NOT TRUE` para rechazar (cubre `false` y `NULL` por igual).
--   - Socio ACTUAL (sin cambiar), genéticas y productos: se guarda
--     `COALESCE(activo, false)` en una variable/array ya no nullable, y
--     recién sobre esa variable se hacen los `IF NOT ...` — nunca se evalúa
--     `NOT` directamente sobre una columna `activo` que pueda ser NULL.
--
-- =============================================================================
-- Errores: códigos SQLSTATE propios de 5 caracteres, prefijo VE0xx para
-- editar_venta (independiente de VT0xx/VP0xx/MP0xx de 062-064) y VD0xx para
-- eliminar_venta:
--   VE001 — la venta no existe (o falta p_venta_id)
--   VE002 — el socio indicado no existe (o falta p_socio_id)
--   VE003 — se intenta reasignar la venta a un socio inactivo
--   VE004 — línea con tipo/uuid inválido
--   VE005 — falta genética/producto en una línea
--   VE006 — cantidad inválida (negativa o no entera)
--   VE007 — falta el peso por enrolado
--   VE008 — no queda ninguna línea válida
--   VE009 — detalle_id no pertenece a esta venta, no existe, o está duplicado
--   VE010 — la genética/producto referenciado no existe
--   VE011 — stock insuficiente
--   VE012 — se intenta agregar/aumentar un ítem inactivo
--   VE013 — se intenta agregar/aumentar consumo con el socio actual inactivo
--   VE014 — el nuevo total queda por debajo de monto_pagado
--   VE015 — falta la fecha de la venta
--   VD001 — la venta no existe (eliminar_venta)
--
-- Permisos: SECURITY DEFINER + SET search_path = '' (referencias siempre
-- calificadas public.<tabla>). REVOKE ALL FROM PUBLIC + GRANT EXECUTE sólo a
-- authenticated (NO anon).
--
-- Script idempotente: CREATE OR REPLACE FUNCTION + su propio REVOKE/GRANT.
-- No crea columnas, índices ni tablas nuevas. Envuelto en BEGIN/COMMIT.
--
-- Instrucciones de prueba y de rollback: ver el final de este archivo.
-- Este script NO se ejecuta como parte de esta entrega.

BEGIN;

CREATE OR REPLACE FUNCTION public.editar_venta(
  p_venta_id uuid,
  p_socio_id uuid,
  p_lineas   jsonb,
  p_notas    text,
  p_fecha    timestamptz
)
RETURNS SETOF public.ventas
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_venta public.ventas%ROWTYPE;
  v_socio_nuevo public.socios%ROWTYPE;
  v_cambia_socio boolean;
  v_socio_actual_inactivo boolean := false;

  -- Estado ANTES de la edición (filas reales de detalle_venta, o una fila
  -- sintética única si la venta es legacy sin detalle_venta).
  v_es_legacy boolean;
  n_orig int := 0;
  v_orig_id uuid[] := '{}';
  v_orig_genetica_id uuid[] := '{}';
  v_orig_producto_id uuid[] := '{}';
  v_orig_gramos numeric[] := '{}';
  v_orig_cant_enr numeric[] := '{}';       -- para producto: cantidad (columna reutilizada)
  v_orig_peso_enr numeric[] := '{}';
  v_orig_peso_enrolados numeric[] := '{}';
  v_orig_precio_unitario numeric[] := '{}';
  v_orig_precio_enrolado numeric[] := '{}';
  v_orig_subtotal numeric[] := '{}';

  -- Líneas entrantes ya parseadas y filtradas (sin las líneas en blanco).
  v_elem jsonb;
  v_idx int := 0;
  n_lineas int := 0;
  v_l_detalle_id uuid[] := '{}';
  v_l_tipo text[] := '{}';
  v_l_genetica_id uuid[] := '{}';
  v_l_producto_id uuid[] := '{}';
  v_l_gramos numeric[] := '{}';
  v_l_cant_enr numeric[] := '{}';
  v_l_peso_enr numeric[] := '{}';
  v_l_cant_prod numeric[] := '{}';
  v_l_orig_idx int[] := '{}';   -- índice en v_orig_* si matchea, NULL si no
  v_l_clase text[] := '{}';     -- 'A' | 'A2' | 'B'

  v_gramos numeric;
  v_cant_enr numeric;
  v_peso_enr numeric;
  v_cant_prod numeric;
  v_genetica_id uuid;
  v_producto_id uuid;
  v_detalle_id uuid;
  v_tipo text;
  v_pos int;
  v_orig_idx int;
  v_legacy_matched boolean := false;
  v_sin_cambios boolean;

  -- Unión de ítems (original ∪ nuevo), en orden de primera aparición — el
  -- orden de LOCK real se hace aparte, ordenado por id (ver más abajo).
  v_gen_ids uuid[] := '{}';
  v_gen_orig_qty numeric[] := '{}';
  v_gen_nuevo_qty numeric[] := '{}';
  v_gen_activo boolean[] := '{}';
  v_gen_stock numeric[] := '{}';
  v_gen_nombre text[] := '{}';
  v_gen_precio_gramo numeric[] := '{}';
  v_gen_precio_enrolado numeric[] := '{}';

  v_prod_ids uuid[] := '{}';
  v_prod_orig_qty numeric[] := '{}';
  v_prod_nuevo_qty numeric[] := '{}';
  v_prod_activo boolean[] := '{}';
  v_prod_stock numeric[] := '{}';
  v_prod_nombre text[] := '{}';
  v_prod_precio numeric[] := '{}';

  v_genetica_row public.geneticas%ROWTYPE;
  v_producto_row public.productos%ROWTYPE;
  v_found_count int;

  v_qty numeric;
  v_diff numeric;
  v_peso_calc numeric;
  v_precio_gr numeric;
  v_precio_en numeric;
  v_precio_pr numeric;

  -- Resultado final por línea, para insertar detalle_venta.
  v_l_precio_unitario numeric[] := '{}';
  v_l_precio_enrolado numeric[] := '{}';
  v_l_peso_enrolados numeric[] := '{}';
  v_l_subtotal numeric[] := '{}';

  v_tiene_gramos boolean := false;
  v_tiene_enrolados boolean := false;
  v_tiene_producto boolean := false;
  v_tipo_venta text;

  v_genetica_legacy_id uuid := NULL;
  v_precio_unitario_legacy numeric := 0;
  v_primera_es_genetica boolean := false;
  v_cant_lineas_validas int := 0;

  v_nuevo_total numeric := 0;
  v_nuevo_gramos_totales numeric := 0;
  v_saldo_antes numeric;
  v_saldo_nuevo numeric;
  v_metodo_pago_nuevo text;

  v_es_fast_path boolean;

  i int;
BEGIN
  ----------------------------------------------------------------------
  -- 1) Bloquear la venta ANTES de leer/comparar nada más.
  ----------------------------------------------------------------------
  IF p_venta_id IS NULL THEN
    RAISE EXCEPTION 'Falta indicar la venta a editar' USING ERRCODE = 'VE001';
  END IF;

  SELECT * INTO v_venta FROM public.ventas WHERE id = p_venta_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La venta indicada no existe' USING ERRCODE = 'VE001';
  END IF;

  IF p_fecha IS NULL THEN
    RAISE EXCEPTION 'La fecha de la venta es obligatoria' USING ERRCODE = 'VE015';
  END IF;

  IF p_lineas IS NULL OR jsonb_typeof(p_lineas) <> 'array' OR jsonb_array_length(p_lineas) = 0 THEN
    RAISE EXCEPTION 'Agregá al menos un producto con cantidad válida' USING ERRCODE = 'VE008';
  END IF;

  ----------------------------------------------------------------------
  -- 2) Socio destino.
  ----------------------------------------------------------------------
  IF p_socio_id IS NULL THEN
    RAISE EXCEPTION 'Seleccioná un socio' USING ERRCODE = 'VE002';
  END IF;

  SELECT * INTO v_socio_nuevo FROM public.socios WHERE id = p_socio_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El socio seleccionado no existe' USING ERRCODE = 'VE002';
  END IF;

  v_cambia_socio := p_socio_id IS DISTINCT FROM v_venta.socio_id;

  -- socios.activo es nullable: sólo `true` cuenta como activo. `activo IS
  -- NOT TRUE` cubre tanto `false` como `NULL` (a diferencia de `NOT activo`,
  -- que con NULL da NULL y la condición nunca dispara).
  IF v_cambia_socio THEN
    IF v_socio_nuevo.activo IS NOT TRUE THEN
      RAISE EXCEPTION 'No se puede reasignar la venta a un socio inactivo' USING ERRCODE = 'VE003';
    END IF;
  ELSE
    v_socio_actual_inactivo := NOT COALESCE(v_socio_nuevo.activo, false);
  END IF;

  ----------------------------------------------------------------------
  -- 3) Estado ANTES de la edición (después de bloquear la venta).
  ----------------------------------------------------------------------
  SELECT COUNT(*) INTO n_orig FROM public.detalle_venta WHERE venta_id = p_venta_id;
  v_es_legacy := (n_orig = 0);

  IF NOT v_es_legacy THEN
    SELECT
      array_agg(dv.id ORDER BY dv.id),
      array_agg(dv.genetica_id ORDER BY dv.id),
      array_agg(dv.producto_id ORDER BY dv.id),
      array_agg(COALESCE(dv.gramos, 0) ORDER BY dv.id),
      array_agg(COALESCE(dv.cantidad_enrolados, 0) ORDER BY dv.id),
      array_agg(COALESCE(dv.peso_por_enrolado, 0) ORDER BY dv.id),
      array_agg(dv.peso_enrolados ORDER BY dv.id),
      array_agg(dv.precio_unitario ORDER BY dv.id),
      array_agg(dv.precio_enrolado ORDER BY dv.id),
      array_agg(dv.subtotal ORDER BY dv.id)
    INTO
      v_orig_id, v_orig_genetica_id, v_orig_producto_id, v_orig_gramos,
      v_orig_cant_enr, v_orig_peso_enr, v_orig_peso_enrolados,
      v_orig_precio_unitario, v_orig_precio_enrolado, v_orig_subtotal
    FROM public.detalle_venta AS dv
    WHERE dv.venta_id = p_venta_id;
  ELSIF v_venta.genetica_id IS NOT NULL THEN
    -- Fila sintética legacy: único "renglón" que representaba la venta.
    n_orig := 1;
    v_orig_id := ARRAY[NULL]::uuid[];
    v_orig_genetica_id := ARRAY[v_venta.genetica_id];
    v_orig_producto_id := ARRAY[NULL]::uuid[];
    v_orig_gramos := ARRAY[COALESCE(v_venta.gramos, 0)];
    v_orig_cant_enr := ARRAY[0::numeric];
    v_orig_peso_enr := ARRAY[0::numeric];
    v_orig_peso_enrolados := ARRAY[NULL::numeric];
    v_orig_precio_unitario := ARRAY[v_venta.precio_unitario];
    v_orig_precio_enrolado := ARRAY[NULL::numeric];
    v_orig_subtotal := ARRAY[v_venta.total];
  END IF;

  ----------------------------------------------------------------------
  -- 4) Parsear p_lineas (mismas validaciones de forma que 062), resolver
  --    detalle_id -> índice en v_orig_*, y filtrar líneas en blanco.
  ----------------------------------------------------------------------
  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_lineas)
  LOOP
    v_idx := v_idx + 1;
    v_tipo := v_elem->>'tipo';

    IF v_tipo IS NULL OR v_tipo NOT IN ('genetica', 'producto') THEN
      RAISE EXCEPTION 'Línea %: tipo de línea inválido', v_idx USING ERRCODE = 'VE004';
    END IF;

    BEGIN
      v_detalle_id := NULLIF(v_elem->>'detalle_id', '')::uuid;
      v_genetica_id := NULLIF(v_elem->>'genetica_id', '')::uuid;
      v_producto_id := NULLIF(v_elem->>'producto_id', '')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'Línea %: identificador inválido', v_idx USING ERRCODE = 'VE004';
    END;

    -- Forma de la línea: cada tipo exige su propio id y prohíbe el otro. No
    -- se permite una línea "híbrida" con ambos ids ni con ninguno.
    IF v_tipo = 'genetica' AND v_producto_id IS NOT NULL THEN
      RAISE EXCEPTION 'Línea %: una línea de genética no puede tener producto_id', v_idx USING ERRCODE = 'VE004';
    END IF;
    IF v_tipo = 'producto' AND v_genetica_id IS NOT NULL THEN
      RAISE EXCEPTION 'Línea %: una línea de producto no puede tener genetica_id', v_idx USING ERRCODE = 'VE004';
    END IF;

    -- Sólo se parsean y validan las cantidades que corresponden al tipo
    -- declarado: los campos del otro tipo no deben intervenir en
    -- clasificación, precios ni stock, así que ni siquiera se leen.
    v_gramos := 0;
    v_cant_enr := 0;
    v_peso_enr := 0;
    v_cant_prod := 0;

    BEGIN
      IF v_tipo = 'genetica' THEN
        v_gramos := COALESCE((v_elem->>'gramos')::numeric, 0);
        v_cant_enr := COALESCE((v_elem->>'cantidad_enrolados')::numeric, 0);
        v_peso_enr := COALESCE((v_elem->>'peso_por_enrolado')::numeric, 0);
      ELSE
        v_cant_prod := COALESCE((v_elem->>'cantidad_producto')::numeric, 0);
      END IF;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION 'Línea %: cantidad inválida', v_idx USING ERRCODE = 'VE006';
    END;

    IF v_gramos < 0 OR v_cant_enr < 0 OR v_peso_enr < 0 OR v_cant_prod < 0 THEN
      RAISE EXCEPTION 'Línea %: las cantidades no pueden ser negativas', v_idx USING ERRCODE = 'VE006';
    END IF;

    IF v_cant_enr <> trunc(v_cant_enr) OR v_cant_prod <> trunc(v_cant_prod) THEN
      RAISE EXCEPTION 'Línea %: la cantidad de enrolados/productos debe ser un número entero', v_idx USING ERRCODE = 'VE006';
    END IF;

    IF v_tipo = 'genetica' THEN
      IF v_genetica_id IS NULL THEN
        RAISE EXCEPTION 'Línea %: falta la genética', v_idx USING ERRCODE = 'VE005';
      END IF;
      IF v_cant_enr > 0 AND v_peso_enr <= 0 THEN
        RAISE EXCEPTION 'Línea %: ingresá el peso por enrolado', v_idx USING ERRCODE = 'VE007';
      END IF;
      IF v_gramos <= 0 AND v_cant_enr <= 0 THEN
        CONTINUE; -- línea sin cantidad cargada: se ignora, igual que 062
      END IF;
    ELSE
      IF v_producto_id IS NULL THEN
        RAISE EXCEPTION 'Línea %: falta el producto', v_idx USING ERRCODE = 'VE005';
      END IF;
      IF v_cant_prod <= 0 THEN
        CONTINUE;
      END IF;
    END IF;

    -- Resolver detalle_id -> índice en v_orig_* (si corresponde). Se valida
    -- ANTES de clasificar la línea: si no pertenece a esta venta, o está
    -- duplicado dentro del mismo payload, se rechaza.
    v_orig_idx := NULL;
    IF v_detalle_id IS NOT NULL THEN
      IF NOT v_es_legacy THEN
        v_orig_idx := array_position(v_orig_id, v_detalle_id);
      END IF;
      IF v_orig_idx IS NULL THEN
        RAISE EXCEPTION 'Línea %: el detalle indicado no pertenece a esta venta', v_idx USING ERRCODE = 'VE009';
      END IF;
      IF v_orig_idx = ANY(v_l_orig_idx) THEN
        RAISE EXCEPTION 'Línea %: el detalle indicado está duplicado en la edición', v_idx USING ERRCODE = 'VE009';
      END IF;
    END IF;

    n_lineas := n_lineas + 1;
    v_l_detalle_id := array_append(v_l_detalle_id, v_detalle_id);
    v_l_tipo := array_append(v_l_tipo, v_tipo);
    v_l_genetica_id := array_append(v_l_genetica_id, v_genetica_id);
    v_l_producto_id := array_append(v_l_producto_id, v_producto_id);
    v_l_gramos := array_append(v_l_gramos, v_gramos);
    v_l_cant_enr := array_append(v_l_cant_enr, v_cant_enr);
    v_l_peso_enr := array_append(v_l_peso_enr, v_peso_enr);
    v_l_cant_prod := array_append(v_l_cant_prod, v_cant_prod);
    v_l_orig_idx := array_append(v_l_orig_idx, v_orig_idx);
  END LOOP;

  IF n_lineas = 0 THEN
    RAISE EXCEPTION 'Agregá al menos un producto con cantidad válida' USING ERRCODE = 'VE008';
  END IF;

  ----------------------------------------------------------------------
  -- 5) Clasificar cada línea en A / A2 / B.
  ----------------------------------------------------------------------
  FOR i IN 1..n_lineas LOOP
    v_orig_idx := v_l_orig_idx[i];

    IF v_orig_idx IS NOT NULL THEN
      IF v_l_genetica_id[i] IS NOT DISTINCT FROM v_orig_genetica_id[v_orig_idx]
         AND v_l_producto_id[i] IS NOT DISTINCT FROM v_orig_producto_id[v_orig_idx] THEN
        -- La comparación de "sin cambios" depende del tipo: para genética se
        -- compara gramos/cantidad_enrolados/peso_por_enrolado; para producto
        -- se compara cantidad_producto contra detalle_venta.cantidad_enrolados
        -- (columna reutilizada para guardar la cantidad de producto). Los
        -- campos del otro tipo no participan de esta comparación.
        IF v_l_tipo[i] = 'genetica' THEN
          v_sin_cambios := v_l_gramos[i] = v_orig_gramos[v_orig_idx]
            AND v_l_cant_enr[i] = v_orig_cant_enr[v_orig_idx]
            AND v_l_peso_enr[i] = v_orig_peso_enr[v_orig_idx];
        ELSE
          v_sin_cambios := v_l_cant_prod[i] = v_orig_cant_enr[v_orig_idx];
        END IF;

        IF v_sin_cambios THEN
          v_l_clase := array_append(v_l_clase, 'A');
        ELSE
          v_l_clase := array_append(v_l_clase, 'A2');
        END IF;
      ELSE
        -- Cambió el ítem de esa línea: se trata como alta nueva. La fila
        -- original igual se cuenta en la agregación de stock "original"
        -- (paso 6), que recorre v_orig_* completo, no v_l_orig_idx.
        v_l_clase := array_append(v_l_clase, 'B');
        v_l_orig_idx[i] := NULL;
      END IF;
    ELSIF v_es_legacy AND NOT v_legacy_matched AND n_orig = 1
          AND v_l_tipo[i] = 'genetica'
          AND v_l_genetica_id[i] IS NOT DISTINCT FROM v_orig_genetica_id[1] THEN
      v_legacy_matched := true;
      v_l_orig_idx[i] := 1;
      IF v_l_gramos[i] = v_orig_gramos[1] AND v_l_cant_enr[i] = 0 THEN
        v_l_clase := array_append(v_l_clase, 'A');
      ELSE
        v_l_clase := array_append(v_l_clase, 'A2');
      END IF;
    ELSE
      v_l_clase := array_append(v_l_clase, 'B');
    END IF;
  END LOOP;

  ----------------------------------------------------------------------
  -- 6) Fast path: todas las líneas son clase A y cubren 1 a 1 el mismo
  --    conjunto original (n_lineas = n_orig ya implica bijección, porque la
  --    validación de detalle_id del paso 4 no permite duplicados).
  ----------------------------------------------------------------------
  v_es_fast_path := (n_orig > 0) AND (n_lineas = n_orig)
    AND NOT EXISTS (SELECT 1 FROM unnest(v_l_clase) AS c WHERE c <> 'A');

  IF v_es_fast_path THEN
    UPDATE public.ventas AS vt
    SET socio_id = p_socio_id,
        notas = p_notas,
        created_at = p_fecha
    WHERE vt.id = p_venta_id;

    RETURN QUERY SELECT * FROM public.ventas WHERE id = p_venta_id;
    RETURN;
  END IF;

  ----------------------------------------------------------------------
  -- 7) Agregación de consumo ORIGINAL por ítem (independiente de la
  --    clasificación de líneas: recorre TODAS las filas que existían antes).
  ----------------------------------------------------------------------
  FOR i IN 1..n_orig LOOP
    IF v_orig_genetica_id[i] IS NOT NULL THEN
      v_peso_calc := COALESCE(v_orig_peso_enrolados[i], round(v_orig_cant_enr[i] * v_orig_peso_enr[i], 1));
      v_qty := COALESCE(v_orig_gramos[i], 0) + COALESCE(v_peso_calc, 0);
      v_pos := array_position(v_gen_ids, v_orig_genetica_id[i]);
      IF v_pos IS NULL THEN
        v_gen_ids := array_append(v_gen_ids, v_orig_genetica_id[i]);
        v_gen_orig_qty := array_append(v_gen_orig_qty, v_qty);
        v_gen_nuevo_qty := array_append(v_gen_nuevo_qty, 0::numeric);
      ELSE
        v_gen_orig_qty[v_pos] := v_gen_orig_qty[v_pos] + v_qty;
      END IF;
    ELSIF v_orig_producto_id[i] IS NOT NULL THEN
      v_qty := COALESCE(v_orig_cant_enr[i], 0);
      v_pos := array_position(v_prod_ids, v_orig_producto_id[i]);
      IF v_pos IS NULL THEN
        v_prod_ids := array_append(v_prod_ids, v_orig_producto_id[i]);
        v_prod_orig_qty := array_append(v_prod_orig_qty, v_qty);
        v_prod_nuevo_qty := array_append(v_prod_nuevo_qty, 0::numeric);
      ELSE
        v_prod_orig_qty[v_pos] := v_prod_orig_qty[v_pos] + v_qty;
      END IF;
    END IF;
  END LOOP;

  ----------------------------------------------------------------------
  -- 8) Agregación de consumo NUEVO por ítem, desde las líneas finales.
  ----------------------------------------------------------------------
  FOR i IN 1..n_lineas LOOP
    IF v_l_tipo[i] = 'genetica' THEN
      v_peso_calc := round(v_l_cant_enr[i] * v_l_peso_enr[i], 1);
      v_qty := v_l_gramos[i] + v_peso_calc;
      v_pos := array_position(v_gen_ids, v_l_genetica_id[i]);
      IF v_pos IS NULL THEN
        v_gen_ids := array_append(v_gen_ids, v_l_genetica_id[i]);
        v_gen_orig_qty := array_append(v_gen_orig_qty, 0::numeric);
        v_gen_nuevo_qty := array_append(v_gen_nuevo_qty, v_qty);
      ELSE
        v_gen_nuevo_qty[v_pos] := v_gen_nuevo_qty[v_pos] + v_qty;
      END IF;
    ELSE
      v_pos := array_position(v_prod_ids, v_l_producto_id[i]);
      IF v_pos IS NULL THEN
        v_prod_ids := array_append(v_prod_ids, v_l_producto_id[i]);
        v_prod_orig_qty := array_append(v_prod_orig_qty, 0::numeric);
        v_prod_nuevo_qty := array_append(v_prod_nuevo_qty, v_l_cant_prod[i]);
      ELSE
        v_prod_nuevo_qty[v_pos] := v_prod_nuevo_qty[v_pos] + v_l_cant_prod[i];
      END IF;
    END IF;
  END LOOP;

  ----------------------------------------------------------------------
  -- 9) Bloquear geneticas/productos involucrados, ordenado por id, y recién
  --    ahí leer activo/stock/precio actual.
  ----------------------------------------------------------------------
  IF COALESCE(array_length(v_gen_ids, 1), 0) > 0 THEN
    v_gen_activo := array_fill(false, ARRAY[array_length(v_gen_ids, 1)]);
    v_gen_stock := array_fill(0::numeric, ARRAY[array_length(v_gen_ids, 1)]);
    v_gen_nombre := array_fill(''::text, ARRAY[array_length(v_gen_ids, 1)]);
    v_gen_precio_gramo := array_fill(0::numeric, ARRAY[array_length(v_gen_ids, 1)]);
    v_gen_precio_enrolado := array_fill(0::numeric, ARRAY[array_length(v_gen_ids, 1)]);
    v_found_count := 0;

    FOR v_genetica_row IN
      SELECT * FROM public.geneticas WHERE id = ANY(v_gen_ids) ORDER BY id FOR UPDATE
    LOOP
      v_found_count := v_found_count + 1;
      v_pos := array_position(v_gen_ids, v_genetica_row.id);
      -- geneticas.activo es nullable: NULL se trata como inactivo.
      v_gen_activo[v_pos] := COALESCE(v_genetica_row.activo, false);
      v_gen_stock[v_pos] := v_genetica_row.gramos_disponibles;
      v_gen_nombre[v_pos] := v_genetica_row.nombre;
      v_gen_precio_gramo[v_pos] := CASE
        WHEN v_socio_nuevo.es_miembro THEN COALESCE(v_genetica_row.precio_gramo_miembro, 0)
        WHEN v_socio_nuevo.es_vip THEN COALESCE(v_genetica_row.precio_gramo_vip, 0)
        ELSE COALESCE(v_genetica_row.precio_por_gramo, 0)
      END;
      v_gen_precio_enrolado[v_pos] := CASE
        WHEN v_socio_nuevo.es_miembro THEN COALESCE(v_genetica_row.precio_enrolado_miembro, 0)
        WHEN v_socio_nuevo.es_vip THEN COALESCE(v_genetica_row.precio_enrolado_vip, 0)
        ELSE COALESCE(v_genetica_row.precio_por_enrolado, 0)
      END;
    END LOOP;

    IF v_found_count <> array_length(v_gen_ids, 1) THEN
      RAISE EXCEPTION 'Una de las genéticas indicadas no existe' USING ERRCODE = 'VE010';
    END IF;
  END IF;

  IF COALESCE(array_length(v_prod_ids, 1), 0) > 0 THEN
    v_prod_activo := array_fill(false, ARRAY[array_length(v_prod_ids, 1)]);
    v_prod_stock := array_fill(0::numeric, ARRAY[array_length(v_prod_ids, 1)]);
    v_prod_nombre := array_fill(''::text, ARRAY[array_length(v_prod_ids, 1)]);
    v_prod_precio := array_fill(0::numeric, ARRAY[array_length(v_prod_ids, 1)]);
    v_found_count := 0;

    FOR v_producto_row IN
      SELECT * FROM public.productos WHERE id = ANY(v_prod_ids) ORDER BY id FOR UPDATE
    LOOP
      v_found_count := v_found_count + 1;
      v_pos := array_position(v_prod_ids, v_producto_row.id);
      -- productos.activo es nullable: NULL se trata como inactivo.
      v_prod_activo[v_pos] := COALESCE(v_producto_row.activo, false);
      v_prod_stock[v_pos] := v_producto_row.cantidad::numeric;
      v_prod_nombre[v_pos] := v_producto_row.nombre;
      v_prod_precio[v_pos] := COALESCE(v_producto_row.precio, 0);
    END LOOP;

    IF v_found_count <> array_length(v_prod_ids, 1) THEN
      RAISE EXCEPTION 'Uno de los productos indicados no existe' USING ERRCODE = 'VE010';
    END IF;
  END IF;

  ----------------------------------------------------------------------
  -- 10) Validar diff por ítem: socio inactivo / ítem inactivo / stock.
  ----------------------------------------------------------------------
  FOR i IN 1..COALESCE(array_length(v_gen_ids, 1), 0) LOOP
    v_diff := v_gen_nuevo_qty[i] - v_gen_orig_qty[i];
    IF v_diff > 0 THEN
      IF v_socio_actual_inactivo THEN
        RAISE EXCEPTION 'No se puede agregar ni aumentar cantidades: el socio de esta venta está inactivo' USING ERRCODE = 'VE013';
      END IF;
      IF NOT v_gen_activo[i] THEN
        RAISE EXCEPTION 'No se puede agregar ni aumentar la cantidad de %, que está inactiva', v_gen_nombre[i] USING ERRCODE = 'VE012';
      END IF;
      IF v_diff > v_gen_stock[i] THEN
        RAISE EXCEPTION 'Stock insuficiente de %. Disponible: %g', v_gen_nombre[i], v_gen_stock[i] USING ERRCODE = 'VE011';
      END IF;
    END IF;
  END LOOP;

  FOR i IN 1..COALESCE(array_length(v_prod_ids, 1), 0) LOOP
    v_diff := v_prod_nuevo_qty[i] - v_prod_orig_qty[i];
    IF v_diff > 0 THEN
      IF v_socio_actual_inactivo THEN
        RAISE EXCEPTION 'No se puede agregar ni aumentar cantidades: el socio de esta venta está inactivo' USING ERRCODE = 'VE013';
      END IF;
      IF NOT v_prod_activo[i] THEN
        RAISE EXCEPTION 'No se puede agregar ni aumentar la cantidad de %, que está inactivo', v_prod_nombre[i] USING ERRCODE = 'VE012';
      END IF;
      IF v_diff > v_prod_stock[i] THEN
        RAISE EXCEPTION 'Stock insuficiente de %. Disponible: %', v_prod_nombre[i], v_prod_stock[i] USING ERRCODE = 'VE011';
      END IF;
    END IF;
  END LOOP;

  ----------------------------------------------------------------------
  -- 11) Precio/subtotal final por línea (A: verbatim: A2/B: calculado) y
  --     totales de la venta.
  ----------------------------------------------------------------------
  FOR i IN 1..n_lineas LOOP
    IF v_l_clase[i] = 'A' THEN
      v_orig_idx := v_l_orig_idx[i];
      v_l_precio_unitario := array_append(v_l_precio_unitario, v_orig_precio_unitario[v_orig_idx]);
      v_l_precio_enrolado := array_append(v_l_precio_enrolado, v_orig_precio_enrolado[v_orig_idx]);
      v_l_peso_enrolados := array_append(v_l_peso_enrolados, v_orig_peso_enrolados[v_orig_idx]);
      v_l_subtotal := array_append(v_l_subtotal, v_orig_subtotal[v_orig_idx]);
    ELSIF v_l_tipo[i] = 'genetica' THEN
      v_pos := array_position(v_gen_ids, v_l_genetica_id[i]);
      v_peso_calc := round(v_l_cant_enr[i] * v_l_peso_enr[i], 1);
      IF v_l_clase[i] = 'A2' THEN
        v_orig_idx := v_l_orig_idx[i];
        v_precio_gr := v_orig_precio_unitario[v_orig_idx];
        v_precio_en := COALESCE(v_orig_precio_enrolado[v_orig_idx], v_gen_precio_enrolado[v_pos]);
      ELSE
        v_precio_gr := v_gen_precio_gramo[v_pos];
        v_precio_en := v_gen_precio_enrolado[v_pos];
      END IF;
      v_l_precio_unitario := array_append(v_l_precio_unitario, v_precio_gr);
      v_l_precio_enrolado := array_append(v_l_precio_enrolado, NULLIF(v_precio_en, 0));
      v_l_peso_enrolados := array_append(v_l_peso_enrolados, NULLIF(v_peso_calc, 0));
      v_l_subtotal := array_append(
        v_l_subtotal,
        round(round(v_l_gramos[i] * v_precio_gr, 2) + round(v_l_cant_enr[i] * v_precio_en, 2), 2)
      );
    ELSE
      v_pos := array_position(v_prod_ids, v_l_producto_id[i]);
      IF v_l_clase[i] = 'A2' THEN
        v_orig_idx := v_l_orig_idx[i];
        v_precio_pr := v_orig_precio_unitario[v_orig_idx];
      ELSE
        v_precio_pr := v_prod_precio[v_pos];
      END IF;
      v_l_precio_unitario := array_append(v_l_precio_unitario, v_precio_pr);
      v_l_precio_enrolado := array_append(v_l_precio_enrolado, NULL::numeric);
      v_l_peso_enrolados := array_append(v_l_peso_enrolados, NULL::numeric);
      v_l_subtotal := array_append(v_l_subtotal, round(v_l_cant_prod[i] * v_precio_pr, 2));
    END IF;

    v_nuevo_total := round(v_nuevo_total + v_l_subtotal[i], 2);
    v_cant_lineas_validas := v_cant_lineas_validas + 1;

    IF v_l_tipo[i] = 'genetica' THEN
      v_nuevo_gramos_totales := round(v_nuevo_gramos_totales + v_l_gramos[i] + COALESCE(v_l_peso_enrolados[i], 0), 1);
      v_tiene_gramos := v_tiene_gramos OR (v_l_gramos[i] > 0);
      v_tiene_enrolados := v_tiene_enrolados OR (v_l_cant_enr[i] > 0);
      IF v_genetica_legacy_id IS NULL THEN
        v_genetica_legacy_id := v_l_genetica_id[i];
        v_primera_es_genetica := true;
      END IF;
    ELSE
      v_tiene_producto := true;
    END IF;
  END LOOP;

  IF v_cant_lineas_validas = 1 AND v_primera_es_genetica THEN
    v_precio_unitario_legacy := v_l_precio_unitario[1];
  ELSE
    v_precio_unitario_legacy := 0;
  END IF;

  ----------------------------------------------------------------------
  -- 12) tipo_venta — misma regla exacta que 062/getTipoVenta().
  ----------------------------------------------------------------------
  IF v_tiene_gramos AND v_tiene_enrolados THEN
    v_tipo_venta := 'mixto';
  ELSIF v_tiene_enrolados THEN
    v_tipo_venta := 'enrolados';
  ELSIF v_tiene_producto THEN
    v_tipo_venta := 'producto';
  ELSE
    v_tipo_venta := 'gramos';
  END IF;

  ----------------------------------------------------------------------
  -- 13) monto_pagado se lee pero NUNCA se recalcula desde pagos ni se
  --     escribe: se usa tal cual está en v_venta.
  ----------------------------------------------------------------------
  IF v_nuevo_total < COALESCE(v_venta.monto_pagado, 0) THEN
    RAISE EXCEPTION 'El nuevo total ($%) no puede ser menor a lo ya pagado ($%)', v_nuevo_total, COALESCE(v_venta.monto_pagado, 0)
      USING ERRCODE = 'VE014';
  END IF;

  v_saldo_antes := COALESCE(v_venta.saldo_pendiente, 0);
  v_saldo_nuevo := v_nuevo_total - COALESCE(v_venta.monto_pagado, 0);

  IF v_saldo_nuevo > 0 THEN
    v_metodo_pago_nuevo := 'pendiente';
  ELSIF v_saldo_antes = 0 THEN
    v_metodo_pago_nuevo := v_venta.metodo_pago;
  ELSE
    SELECT pg.metodo_pago INTO v_metodo_pago_nuevo
    FROM public.pagos AS pg
    WHERE pg.venta_id = p_venta_id
    ORDER BY pg.fecha DESC NULLS LAST, pg.created_at DESC NULLS LAST, pg.id DESC
    LIMIT 1;

    IF NOT FOUND THEN
      v_metodo_pago_nuevo := v_venta.metodo_pago;
    END IF;
  END IF;

  ----------------------------------------------------------------------
  -- 14) Escritura — recién acá se modifica algo.
  ----------------------------------------------------------------------
  UPDATE public.ventas AS vt
  SET socio_id = p_socio_id,
      genetica_id = v_genetica_legacy_id,
      gramos = v_nuevo_gramos_totales,
      precio_unitario = v_precio_unitario_legacy,
      total = v_nuevo_total,
      notas = p_notas,
      created_at = p_fecha,
      metodo_pago = v_metodo_pago_nuevo,
      tipo_venta = v_tipo_venta,
      saldo_pendiente = v_saldo_nuevo
  WHERE vt.id = p_venta_id;

  DELETE FROM public.detalle_venta WHERE venta_id = p_venta_id;

  FOR i IN 1..n_lineas LOOP
    IF v_l_tipo[i] = 'genetica' THEN
      INSERT INTO public.detalle_venta (
        venta_id, genetica_id, producto_id, gramos, cantidad_enrolados,
        peso_por_enrolado, peso_enrolados, precio_unitario, precio_enrolado, subtotal
      ) VALUES (
        p_venta_id, v_l_genetica_id[i], NULL, v_l_gramos[i], NULLIF(v_l_cant_enr[i], 0),
        NULLIF(v_l_peso_enr[i], 0), v_l_peso_enrolados[i], v_l_precio_unitario[i], v_l_precio_enrolado[i], v_l_subtotal[i]
      );
    ELSE
      INSERT INTO public.detalle_venta (
        venta_id, genetica_id, producto_id, gramos, cantidad_enrolados,
        peso_por_enrolado, peso_enrolados, precio_unitario, precio_enrolado, subtotal
      ) VALUES (
        p_venta_id, NULL, v_l_producto_id[i], 0, v_l_cant_prod[i],
        NULL, NULL, v_l_precio_unitario[i], NULL, v_l_subtotal[i]
      );
    END IF;
  END LOOP;

  FOR i IN 1..COALESCE(array_length(v_gen_ids, 1), 0) LOOP
    v_diff := v_gen_nuevo_qty[i] - v_gen_orig_qty[i];
    IF v_diff <> 0 THEN
      UPDATE public.geneticas
      SET gramos_disponibles = gramos_disponibles - v_diff,
          updated_at = now()
      WHERE id = v_gen_ids[i];
    END IF;
  END LOOP;

  FOR i IN 1..COALESCE(array_length(v_prod_ids, 1), 0) LOOP
    v_diff := v_prod_nuevo_qty[i] - v_prod_orig_qty[i];
    IF v_diff <> 0 THEN
      UPDATE public.productos
      SET cantidad = cantidad - v_diff,
          updated_at = now()
      WHERE id = v_prod_ids[i];
    END IF;
  END LOOP;

  RETURN QUERY SELECT * FROM public.ventas WHERE id = p_venta_id;
END;
$$;

REVOKE ALL ON FUNCTION public.editar_venta(uuid, uuid, jsonb, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.editar_venta(uuid, uuid, jsonb, text, timestamptz) TO authenticated;


CREATE OR REPLACE FUNCTION public.eliminar_venta(
  p_venta_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_venta public.ventas%ROWTYPE;
  v_detalle_row public.detalle_venta%ROWTYPE;
  v_genetica_row public.geneticas%ROWTYPE;
  v_producto_row public.productos%ROWTYPE;

  v_gen_ids uuid[] := '{}';
  v_gen_qty numeric[] := '{}';
  v_prod_ids uuid[] := '{}';
  v_prod_qty numeric[] := '{}';

  v_pos int;
  v_qty numeric;
  v_peso_calc numeric;
BEGIN
  ----------------------------------------------------------------------
  -- 1) Bloquear la venta primero, igual que editar_venta.
  ----------------------------------------------------------------------
  IF p_venta_id IS NULL THEN
    RAISE EXCEPTION 'Falta indicar la venta a eliminar' USING ERRCODE = 'VD001';
  END IF;

  SELECT * INTO v_venta FROM public.ventas WHERE id = p_venta_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La venta indicada no existe' USING ERRCODE = 'VD001';
  END IF;

  ----------------------------------------------------------------------
  -- 2) Consumo a devolver: detalle_venta si existe, si no sólo
  --    ventas.gramos (fallback legacy, sin asumir peso_enrolados en ventas).
  ----------------------------------------------------------------------
  FOR v_detalle_row IN SELECT * FROM public.detalle_venta WHERE venta_id = p_venta_id LOOP
    IF v_detalle_row.genetica_id IS NOT NULL THEN
      v_peso_calc := COALESCE(
        v_detalle_row.peso_enrolados,
        round(COALESCE(v_detalle_row.cantidad_enrolados, 0) * COALESCE(v_detalle_row.peso_por_enrolado, 0), 1)
      );
      v_qty := COALESCE(v_detalle_row.gramos, 0) + COALESCE(v_peso_calc, 0);
      v_pos := array_position(v_gen_ids, v_detalle_row.genetica_id);
      IF v_pos IS NULL THEN
        v_gen_ids := array_append(v_gen_ids, v_detalle_row.genetica_id);
        v_gen_qty := array_append(v_gen_qty, v_qty);
      ELSE
        v_gen_qty[v_pos] := v_gen_qty[v_pos] + v_qty;
      END IF;
    ELSIF v_detalle_row.producto_id IS NOT NULL THEN
      v_qty := COALESCE(v_detalle_row.cantidad_enrolados, 0);
      v_pos := array_position(v_prod_ids, v_detalle_row.producto_id);
      IF v_pos IS NULL THEN
        v_prod_ids := array_append(v_prod_ids, v_detalle_row.producto_id);
        v_prod_qty := array_append(v_prod_qty, v_qty);
      ELSE
        v_prod_qty[v_pos] := v_prod_qty[v_pos] + v_qty;
      END IF;
    END IF;
  END LOOP;

  IF COALESCE(array_length(v_gen_ids, 1), 0) = 0
     AND COALESCE(array_length(v_prod_ids, 1), 0) = 0
     AND v_venta.genetica_id IS NOT NULL THEN
    v_gen_ids := ARRAY[v_venta.genetica_id];
    v_gen_qty := ARRAY[COALESCE(v_venta.gramos, 0)];
  END IF;

  ----------------------------------------------------------------------
  -- 3) Bloquear geneticas/productos en orden por id y devolver stock.
  ----------------------------------------------------------------------
  IF COALESCE(array_length(v_gen_ids, 1), 0) > 0 THEN
    FOR v_genetica_row IN
      SELECT * FROM public.geneticas WHERE id = ANY(v_gen_ids) ORDER BY id FOR UPDATE
    LOOP
      v_pos := array_position(v_gen_ids, v_genetica_row.id);
      UPDATE public.geneticas
      SET gramos_disponibles = gramos_disponibles + v_gen_qty[v_pos],
          updated_at = now()
      WHERE id = v_genetica_row.id;
    END LOOP;
  END IF;

  IF COALESCE(array_length(v_prod_ids, 1), 0) > 0 THEN
    FOR v_producto_row IN
      SELECT * FROM public.productos WHERE id = ANY(v_prod_ids) ORDER BY id FOR UPDATE
    LOOP
      v_pos := array_position(v_prod_ids, v_producto_row.id);
      UPDATE public.productos
      SET cantidad = cantidad + v_prod_qty[v_pos],
          updated_at = now()
      WHERE id = v_producto_row.id;
    END LOOP;
  END IF;

  ----------------------------------------------------------------------
  -- 4) Eliminación explícita, sin depender de ON DELETE CASCADE.
  ----------------------------------------------------------------------
  DELETE FROM public.pagos WHERE venta_id = p_venta_id;
  DELETE FROM public.detalle_venta WHERE venta_id = p_venta_id;
  DELETE FROM public.ventas WHERE id = p_venta_id;
END;
$$;

REVOKE ALL ON FUNCTION public.eliminar_venta(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.eliminar_venta(uuid) TO authenticated;

COMMIT;

-- =============================================================================
-- PRUEBAS MANUALES (correr en el SQL Editor de Supabase, logueado como
-- postgres/owner; reemplazar los UUID de ejemplo por ids reales de tu base
-- de QA antes de correr). Todo puede probarse dentro de BEGIN;...ROLLBACK;
-- para no dejar ningún rastro en datos reales.
-- =============================================================================
--
-- Preparación sugerida: crear una venta de prueba con registrar_venta (062),
-- anotar su id y el/los id(s) de detalle_venta que generó:
--
--   BEGIN;
--   SELECT * FROM public.registrar_venta(
--     '<socio_id>'::uuid,
--     '[{"tipo":"genetica","genetica_id":"<genetica_id>","producto_id":"","gramos":10,"cantidad_enrolados":0,"peso_por_enrolado":0,"cantidad_producto":0}]'::jsonb,
--     0, 0, 'prueba 4B1', now()
--   );
--   SELECT id, venta_id, genetica_id, gramos, precio_unitario, subtotal FROM public.detalle_venta WHERE venta_id = '<id devuelto arriba>';
--   -- (seguir dentro de la misma transacción para los pasos siguientes)
--
-- 1) Editar sólo notas, líneas idénticas (mismo detalle_id, mismas
--    cantidades) -> fast path:
--
--   SELECT * FROM public.editar_venta(
--     '<venta_id>'::uuid, '<socio_id>'::uuid,
--     '[{"detalle_id":"<detalle_id>","tipo":"genetica","genetica_id":"<genetica_id>","producto_id":"","gramos":10,"cantidad_enrolados":0,"peso_por_enrolado":0,"cantidad_producto":0}]'::jsonb,
--     'nota nueva', now()
--   );
--   -- Verificar: total/monto_pagado/saldo_pendiente/metodo_pago/tipo_venta
--   -- IDÉNTICOS a antes de la llamada; notas cambió.
--   SELECT id FROM public.detalle_venta WHERE venta_id = '<venta_id>'::uuid;
--   -- Verificar: el id de detalle_venta es EL MISMO que antes (no se borró
--   -- ni reinsertó).
--   SELECT gramos_disponibles, updated_at FROM public.geneticas WHERE id = '<genetica_id>'::uuid;
--   -- Verificar: updated_at NO cambió (no se tocó el stock).
--
-- 2) Editar sólo fecha, mismas líneas -> fast path (igual que 1, created_at
--    debe cambiar y nada más).
--
-- 3) Editar sólo socio_id a otro socio ACTIVO, mismas líneas -> fast path:
--    socio_id cambia, total/stock/detalle no.
--
-- 4) Cambiar sólo la cantidad de la línea existente (gramos: 10 -> 15) ->
--    clase A2: confirmar que detalle_venta.precio_unitario sigue siendo el
--    mismo valor histórico, y que subtotal/total reflejan 15g a ese precio
--    (no al precio actual de geneticas si se cambió mientras tanto).
--
-- 5) Agregar una línea nueva (sin detalle_id) a la venta de (4) -> clase B:
--    confirmar que usa precio actual con la jerarquía miembro/VIP/regular,
--    y que la línea original conserva su precio histórico.
--
-- 6) Cambiar el genetica_id de la línea existente (mismo detalle_id, otro
--    genetica_id) -> se trata como B: confirmar que se devuelve el stock
--    completo de la genética vieja y se descuenta el de la nueva al precio
--    actual.
--
-- 6b) Venta con una línea de PRODUCTO sin cambios (mismo detalle_id, mismo
--     producto_id, cantidad_producto igual a detalle_venta.cantidad_enrolados
--     guardado) combinada con líneas de genética también sin cambios ->
--     fast path: confirmar que la línea de producto entra en el fast path
--     (no queda mal clasificada como A2 por comparar contra gramos/
--     cantidad_enrolados de una fila de genética) y que el id de su fila en
--     detalle_venta no cambia.
--
-- 6c) Cambiar sólo cantidad_producto de una línea de producto existente (ej.
--     3 -> 5) -> clase A2: confirmar que detalle_venta.precio_unitario sigue
--     siendo el histórico, que el subtotal/total reflejan la cantidad nueva
--     a ese precio, y que geneticas/productos.cantidad se descuenta sólo por
--     la diferencia (2 unidades más), no por la cantidad total.
--
-- 6d) Agregar una línea de producto NUEVA (sin detalle_id) a una venta
--     existente -> clase B: confirmar que usa productos.precio ACTUAL (no
--     ningún precio histórico) y que descuenta stock por la cantidad
--     completa de la línea nueva.
--
-- 6e) Cambiar una línea de GENÉTICA existente a PRODUCTO (mismo detalle_id,
--     ahora con producto_id en vez de genetica_id) y, en otra prueba, el
--     caso inverso (línea de producto -> genética) -> ambas se tratan como
--     B: confirmar que el tipo y el id final quedan correctos en
--     detalle_venta, que se devuelve el stock completo del ítem viejo
--     (genética o producto) y se descuenta el del ítem nuevo al precio
--     actual.
--
-- 7) detalle_id de otra venta, o inexistente, o duplicado dentro del mismo
--    payload -> VE009 en los tres casos.
--
-- 8) Venta legacy sin detalle_venta (buscar o generar una con
--    detalle_venta vacío para esa venta): editar manteniendo la misma
--    genética pero cambiando gramos -> confirmar que usa
--    ventas.precio_unitario histórico, no el precio actual.
--
-- 9) Venta COMPLETAMENTE PAGADA (saldo_pendiente = 0, con pagos): cambiar
--    cantidades de forma que el total nuevo siga siendo >= monto_pagado y
--    el saldo nuevo siga dando 0 -> confirmar que ventas.metodo_pago NO
--    cambia (se conserva el que tenía), aunque el total varíe.
--
-- 10) Venta con saldo pendiente (> 0) cuya edición hace que el nuevo saldo
--     dé exactamente 0 -> confirmar que metodo_pago pasa a ser el del
--     ÚLTIMO pago real (fecha DESC NULLS LAST, created_at DESC NULLS LAST,
--     id DESC), no un promedio ni el primero.
--
-- 11) Venta con pagos HISTÓRICOS DUPLICADOS conocidos (monto_pagado no
--     coincide con SUM(pagos.monto)): editar cantidades sin tocar el pago
--     -> confirmar que ventas.monto_pagado queda exactamente igual a como
--     estaba antes de la edición (no se recalculó desde SUM(pagos)).
--
-- 12) Socio actual inactivo: reducir una línea (diff <= 0 en todo ítem) ->
--     permitido. Agregar una línea o aumentar una cantidad -> VE013.
--
-- 13) Reasignar la venta a otro socio inactivo -> VE003 (con y sin cambios
--     de líneas).
--
-- 14) Ítem inactivo ya presente en la venta: reducir o mantener -> permitido.
--     Aumentar su cantidad, o agregarlo como línea nueva -> VE012.
--
-- 14b) `activo` en NULL (no false): con
--      UPDATE public.socios SET activo = NULL WHERE id = '<socio_id>'::uuid;
--      (revertir después de la prueba) confirmar que reasignar la venta a
--      ese socio da VE003, y que si es el socio actual sin cambiar, agregar
--      una línea o aumentar una cantidad da VE013 (no se cuela como
--      "activo" por tener NULL en vez de false). Repetir el mismo chequeo
--      con
--      UPDATE public.geneticas SET activo = NULL WHERE id = '<genetica_id>'::uuid;
--      y con productos: agregar/aumentar esa genética/producto debe dar
--      VE012, no pasar de largo.
--
-- 15) Pedir un diff de stock mayor al disponible -> VE011, confirmar
--     rollback total (ventas/detalle_venta/geneticas/productos sin cambios).
--
-- 16) Reducir cantidades hasta que el nuevo total quede por debajo de
--     monto_pagado -> VE014, rollback total.
--
-- 17) eliminar_venta sobre una venta sin pagos -> confirmar stock devuelto y
--     que ventas/detalle_venta desaparecen.
--
-- 18) eliminar_venta sobre una venta CON pagos -> confirmar que
--     public.pagos también se eliminó explícitamente (no por cascada) y que
--     el resto del comportamiento es igual a (17).
--
-- 19) Permisos: con sólo la anon key (sin sesión), POST a
--     /rest/v1/rpc/editar_venta y /rest/v1/rpc/eliminar_venta deben devolver
--     403/42501; con sesión real de un usuario `authenticated`, ambas
--     funcionan.
--
-- =============================================================================
-- ROLLBACK
-- =============================================================================
--
-- Estas funciones no crean columnas, índices ni tablas nuevas — sólo se
-- agregan a sí mismas. Para deshacer sólo este script (sin tocar el
-- frontend, o después de haberlo revertido):
--
--   DROP FUNCTION IF EXISTS public.editar_venta(uuid, uuid, jsonb, text, timestamptz);
--   DROP FUNCTION IF EXISTS public.eliminar_venta(uuid);
--
-- El flujo viejo de components/historial-ventas.tsx (si se revierte ese
-- commit) sigue funcionando sin cambios, porque este script no modificó
-- ninguna tabla ni policy existente.
