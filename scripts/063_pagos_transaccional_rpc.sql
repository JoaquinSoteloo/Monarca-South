-- Etapa 4B2 — Registro transaccional de pagos.
--
-- Por qué: hasta ahora components/deudas-manager.tsx (handleRegistrarPago,
-- handleRegistrarPagoSocio) y components/historial-ventas.tsx
-- (handleUpdateMetodoPago, handleSubirComprobante) registraban un pago con
-- 2 llamadas independientes a PostgREST (insert en pagos + update de saldos
-- en ventas), o incluso un loop de esas 2 llamadas por cada deuda cubierta
-- en el caso del pago de socio (FIFO). Si la segunda llamada de cualquier
-- iteración fallaba, quedaba un pago insertado sin reflejarse en el saldo, o
-- un socio "parcialmente pagado" sin ninguna forma de revertir lo ya
-- aplicado. El pago de socio además calculaba el orden FIFO sobre un
-- snapshot de saldos ya cargado en memoria al abrir la pantalla, no contra
-- el valor vigente en la base al momento del click.
--
-- Esta etapa reemplaza esos flujos por dos funciones SECURITY DEFINER
-- (registrar_pago_venta, registrar_pago_socio), cada una invocada con una
-- sola llamada RPC. Al ser una única función plpgsql, toda la ejecución de
-- cada llamada corre en una sola transacción: si cualquier RAISE EXCEPTION
-- la interrumpe, Postgres revierte automáticamente todo lo que esa llamada
-- ya haya escrito (incluyendo iteraciones previas del loop FIFO).
--
-- Alcance de esta etapa (4B2): sólo pagos. La edición y eliminación de
-- ventas (4B1) queda para una etapa posterior — no se toca stock,
-- detalle_venta, ni la función registrar_venta.
--
-- Fuera de alcance a propósito (misma razón que en 062 — Monarca es una app
-- interna operada por una sola persona a la vez): idempotency_key,
-- pg_advisory_xact_lock, y cualquier manejo de solicitudes concurrentes.
--
-- Normalización del monto: ambas funciones redondean el monto recibido a 2
-- decimales una sola vez, al principio (`v_monto := round(p_monto, 2)`), y
-- usan exclusivamente esa variable ya normalizada para validar, insertar en
-- pagos, descontar saldo y sumar monto_pagado — nunca vuelven a leer
-- p_monto en la aritmética, para evitar que un redondeo tardío o repetido
-- desincronice el pago insertado del saldo descontado.
--
-- COALESCE en saldos: `ventas.saldo_pendiente` y `ventas.monto_pagado` son
-- DEFAULT 0 pero nullable — filas antiguas podrían tener NULL. Toda
-- referencia a estas columnas en ambas funciones pasa por
-- COALESCE(..., 0).
--
-- FIFO: registrar_pago_socio ordena las deudas por
-- `created_at ASC, id ASC` (no sólo created_at), para tener un desempate
-- estable si dos ventas del mismo socio comparten el mismo timestamp.
--
-- Ambigüedad de columnas en registrar_pago_socio: al declarar
-- `RETURNS TABLE(venta_id uuid, monto_aplicado numeric, saldo_restante
-- numeric)`, esos tres nombres quedan como variables implícitas visibles en
-- toda la función. Para no arriesgar una referencia ambigua entre esas
-- variables de salida y columnas reales de `ventas`/`pagos` del mismo
-- nombre, la función nunca usa esos identificadores sueltos: la variable de
-- loop se llama `v_venta_actual_id` (no `venta_id`), todas las
-- consultas/updates califican la tabla con alias (`public.ventas AS vt`,
-- `vt.id`, `vt.saldo_pendiente`), y el resultado se arma acumulando arrays
-- durante el loop (`v_out_venta_ids`, `v_out_montos`, `v_out_saldos`),
-- devueltos al final con `RETURN QUERY SELECT unnest(...), unnest(...),
-- unnest(...)` — mismo patrón de arrays que ya usa 062 para detalle_venta.
--
-- Errores: códigos SQLSTATE propios de 5 caracteres, prefijo VP0xx (distinto
-- del VT0xx de registrar_venta), con mensaje pensado para mostrarse tal cual
-- en la UI:
--   VP001 — la venta indicada no existe (registrar_pago_venta)
--   VP002 — el monto es nulo, cero o negativo (ambas)
--   VP003 — el monto excede el saldo pendiente / la deuda total (ambas)
--   VP004 — método de pago inválido: sólo 'efectivo' o 'transferencia'
--           (igual que el CHECK real de pagos.metodo_pago, que no admite
--           'pendiente') (ambas)
--   VP005 — el socio indicado no existe (registrar_pago_socio)
--   VP006 — el socio no tiene deudas pendientes (registrar_pago_socio)
--   VP007 — la fecha del pago es nula o inválida (ambas)
-- Cualquier otro error (interno/inesperado) el cliente lo muestra como
-- mensaje genérico, sin exponer el detalle interno.
--
-- registrar_pago_socio NO exige socios.activo = true: un socio dado de baja
-- puede seguir teniendo saldo pendiente de cuando estaba activo y debe poder
-- pagarlo. Esto es intencional, a diferencia de registrar_venta/editar_venta
-- (que sí generan deuda/venta nueva y por eso exigen socio activo).
--
-- Permisos: SECURITY DEFINER + SET search_path = '' (referencias siempre
-- calificadas public.<tabla>). REVOKE ALL FROM PUBLIC + GRANT EXECUTE sólo a
-- authenticated (NO anon).
--
-- Script idempotente: CREATE OR REPLACE FUNCTION + su propio REVOKE/GRANT,
-- se puede re-correr sin error. No crea columnas, índices ni tablas nuevas.
-- Envuelto en una transacción (BEGIN/COMMIT).
--
-- Instrucciones de prueba y de rollback: ver el final de este archivo.

BEGIN;

CREATE OR REPLACE FUNCTION public.registrar_pago_venta(
  p_venta_id        uuid,
  p_monto           numeric,
  p_metodo_pago     text,
  p_notas           text,
  p_comprobante_url text,
  p_fecha           timestamptz
)
RETURNS SETOF public.ventas
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_venta public.ventas%ROWTYPE;
  v_monto numeric;
BEGIN
  ----------------------------------------------------------------------
  -- 1) Validaciones (sólo lecturas, nada se escribe todavía)
  ----------------------------------------------------------------------
  IF p_venta_id IS NULL THEN
    RAISE EXCEPTION 'Falta indicar la venta a pagar' USING ERRCODE = 'VP001';
  END IF;

  SELECT * INTO v_venta FROM public.ventas WHERE id = p_venta_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La venta indicada no existe' USING ERRCODE = 'VP001';
  END IF;

  IF p_monto IS NULL THEN
    RAISE EXCEPTION 'El monto debe ser mayor a cero' USING ERRCODE = 'VP002';
  END IF;

  IF p_metodo_pago IS NULL OR p_metodo_pago NOT IN ('efectivo', 'transferencia') THEN
    RAISE EXCEPTION 'El método de pago debe ser efectivo o transferencia' USING ERRCODE = 'VP004';
  END IF;

  IF p_fecha IS NULL THEN
    RAISE EXCEPTION 'La fecha del pago es obligatoria' USING ERRCODE = 'VP007';
  END IF;

  -- Normalización: todo el resto de la función usa v_monto, nunca p_monto.
  -- El chequeo de "mayor a cero" se hace RECIÉN DESPUÉS de redondear: un
  -- valor como 0.004 pasaría p_monto > 0 sin problema, pero redondea a 0.00
  -- e insertaría un pago de monto cero si se validara antes.
  v_monto := round(p_monto, 2);

  IF v_monto <= 0 THEN
    RAISE EXCEPTION 'El monto debe ser mayor a cero' USING ERRCODE = 'VP002';
  END IF;

  IF v_monto > COALESCE(v_venta.saldo_pendiente, 0) THEN
    RAISE EXCEPTION 'El monto no puede ser mayor al saldo pendiente ($%)', COALESCE(v_venta.saldo_pendiente, 0)
      USING ERRCODE = 'VP003';
  END IF;

  ----------------------------------------------------------------------
  -- 2) Escritura — recién acá se modifica algo. Si algo de acá en adelante
  --    fallara, Postgres revierte todo lo anterior automáticamente.
  ----------------------------------------------------------------------
  INSERT INTO public.pagos (venta_id, monto, metodo_pago, comprobante_url, notas, fecha)
  VALUES (p_venta_id, v_monto, p_metodo_pago, p_comprobante_url, p_notas, p_fecha);

  UPDATE public.ventas AS vt
  SET saldo_pendiente = COALESCE(vt.saldo_pendiente, 0) - v_monto,
      monto_pagado    = COALESCE(vt.monto_pagado, 0) + v_monto,
      metodo_pago     = CASE
                           WHEN COALESCE(vt.saldo_pendiente, 0) - v_monto <= 0 THEN p_metodo_pago
                           ELSE 'pendiente'
                         END
  WHERE vt.id = p_venta_id;

  RETURN QUERY SELECT * FROM public.ventas WHERE id = p_venta_id;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_pago_venta(uuid, numeric, text, text, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_pago_venta(uuid, numeric, text, text, text, timestamptz) TO authenticated;


CREATE OR REPLACE FUNCTION public.registrar_pago_socio(
  p_socio_id        uuid,
  p_monto           numeric,
  p_metodo_pago     text,
  p_notas           text,
  p_comprobante_url text,
  p_fecha           timestamptz
)
RETURNS TABLE(venta_id uuid, monto_aplicado numeric, saldo_restante numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_socio public.socios%ROWTYPE;
  v_monto numeric;
  v_restante numeric;

  v_deuda_ids uuid[];
  v_deuda_saldos numeric[];
  v_deuda_total numeric := 0;

  v_out_venta_ids uuid[] := '{}';
  v_out_montos numeric[] := '{}';
  v_out_saldos numeric[] := '{}';

  v_venta_actual_id uuid;
  v_aplicar numeric;
  i int;
BEGIN
  ----------------------------------------------------------------------
  -- 1) Validaciones (sólo lecturas, nada se escribe todavía)
  ----------------------------------------------------------------------
  IF p_socio_id IS NULL THEN
    RAISE EXCEPTION 'Falta indicar el socio' USING ERRCODE = 'VP005';
  END IF;

  SELECT * INTO v_socio FROM public.socios WHERE id = p_socio_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El socio indicado no existe' USING ERRCODE = 'VP005';
  END IF;

  IF p_monto IS NULL THEN
    RAISE EXCEPTION 'El monto debe ser mayor a cero' USING ERRCODE = 'VP002';
  END IF;

  IF p_metodo_pago IS NULL OR p_metodo_pago NOT IN ('efectivo', 'transferencia') THEN
    RAISE EXCEPTION 'El método de pago debe ser efectivo o transferencia' USING ERRCODE = 'VP004';
  END IF;

  IF p_fecha IS NULL THEN
    RAISE EXCEPTION 'La fecha del pago es obligatoria' USING ERRCODE = 'VP007';
  END IF;

  -- Normalización: todo el resto de la función usa v_monto, nunca p_monto.
  -- El chequeo de "mayor a cero" se hace RECIÉN DESPUÉS de redondear (ver
  -- mismo comentario en registrar_pago_venta).
  v_monto := round(p_monto, 2);

  IF v_monto <= 0 THEN
    RAISE EXCEPTION 'El monto debe ser mayor a cero' USING ERRCODE = 'VP002';
  END IF;

  -- Lectura fresca y ordenada de las deudas del socio (no un snapshot de
  -- cliente): FIFO por created_at, con id como desempate estable.
  SELECT array_agg(vt.id ORDER BY vt.created_at ASC, vt.id ASC),
         array_agg(COALESCE(vt.saldo_pendiente, 0) ORDER BY vt.created_at ASC, vt.id ASC)
    INTO v_deuda_ids, v_deuda_saldos
  FROM public.ventas AS vt
  WHERE vt.socio_id = p_socio_id
    AND COALESCE(vt.saldo_pendiente, 0) > 0;

  IF v_deuda_ids IS NULL OR array_length(v_deuda_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'El socio no tiene deudas pendientes' USING ERRCODE = 'VP006';
  END IF;

  SELECT sum(s) INTO v_deuda_total FROM unnest(v_deuda_saldos) AS s;

  IF v_monto > v_deuda_total THEN
    RAISE EXCEPTION 'El monto no puede ser mayor a la deuda total del socio ($%)', v_deuda_total
      USING ERRCODE = 'VP003';
  END IF;

  ----------------------------------------------------------------------
  -- 2) Escritura — loop FIFO. Recién acá se modifica algo; si cualquier
  --    iteración fallara, Postgres revierte TODAS las iteraciones previas
  --    de este mismo loop (una sola transacción de principio a fin).
  ----------------------------------------------------------------------
  v_restante := v_monto;

  FOR i IN 1..array_length(v_deuda_ids, 1) LOOP
    EXIT WHEN v_restante <= 0;

    v_venta_actual_id := v_deuda_ids[i];
    v_aplicar := LEAST(v_restante, v_deuda_saldos[i]);

    INSERT INTO public.pagos (venta_id, monto, metodo_pago, comprobante_url, notas, fecha)
    VALUES (
      v_venta_actual_id, v_aplicar, p_metodo_pago, p_comprobante_url,
      COALESCE(p_notas, 'Pago aplicado a cuenta del socio'), p_fecha
    );

    UPDATE public.ventas AS vt
    SET saldo_pendiente = COALESCE(vt.saldo_pendiente, 0) - v_aplicar,
        monto_pagado    = COALESCE(vt.monto_pagado, 0) + v_aplicar,
        metodo_pago     = CASE
                             WHEN COALESCE(vt.saldo_pendiente, 0) - v_aplicar <= 0 THEN p_metodo_pago
                             ELSE 'pendiente'
                           END
    WHERE vt.id = v_venta_actual_id;

    v_out_venta_ids := array_append(v_out_venta_ids, v_venta_actual_id);
    v_out_montos := array_append(v_out_montos, v_aplicar);
    v_out_saldos := array_append(v_out_saldos, v_deuda_saldos[i] - v_aplicar);

    v_restante := v_restante - v_aplicar;
  END LOOP;

  RETURN QUERY SELECT unnest(v_out_venta_ids), unnest(v_out_montos), unnest(v_out_saldos);
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_pago_socio(uuid, numeric, text, text, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_pago_socio(uuid, numeric, text, text, text, timestamptz) TO authenticated;

COMMIT;

-- =============================================================================
-- PRUEBAS MANUALES (correr en el SQL Editor de Supabase, logueado como
-- postgres/owner; reemplazar los UUID de ejemplo por ids reales de tu base
-- de QA antes de correr). Todo puede probarse dentro de
-- BEGIN; ... ROLLBACK; para no dejar ningún rastro en datos reales.
--
-- Importante: registrar_venta calcula el total desde los precios reales de
-- la genética/producto elegidos, así que NO asumas un total fijo (ej. no
-- asumas que una venta "cierra en $1000"). Encadená la creación de la venta
-- con una lectura de su total antes de calcular los montos parciales:
--
--   BEGIN;
--   WITH nueva AS (
--     SELECT * FROM public.registrar_venta(
--       '<socio_id>'::uuid,
--       '[{"tipo":"genetica","genetica_id":"<genetica_id>","producto_id":"","gramos":10,"cantidad_enrolados":0,"peso_por_enrolado":0,"cantidad_producto":0}]'::jsonb,
--       0, 0, 'prueba 4B2', now()
--     )
--   )
--   SELECT id, total FROM nueva;
--   -- Anotar el id y el total reales devueltos, y usarlos en los pasos siguientes
--   -- (todavía dentro de la misma transacción).
--
-- 1) Pago parcial: con el total real de la venta creada arriba, pagar un
--    40% y confirmar saldo_pendiente/monto_pagado/metodo_pago; pagar el
--    resto y confirmar saldo_pendiente = 0:
--
--   SELECT * FROM public.registrar_pago_venta(
--     '<venta_id>'::uuid, <total * 0.4>, 'efectivo', NULL, NULL, now()
--   );
--   -- Verificar: saldo_pendiente = total - (total*0.4), monto_pagado = total*0.4,
--   -- metodo_pago = 'pendiente'.
--
--   SELECT * FROM public.registrar_pago_venta(
--     '<venta_id>'::uuid, <saldo_pendiente_restante>, 'transferencia', NULL, NULL, now()
--   );
--   -- Verificar: saldo_pendiente = 0, metodo_pago = 'transferencia'.
--
--   ROLLBACK;
--
-- 2) Pago que excede el saldo — confirmar VP003 y que no queda nada escrito:
--
--   SELECT * FROM public.registrar_pago_venta(
--     '<venta_id>'::uuid, <total_venta + 1>, 'efectivo', NULL, NULL, now()
--   );
--   -- Esperado: ERROR VP003.
--
-- 2 bis) Monto que redondea a cero — confirmar VP002 en ambas funciones (no
--        VP003 ni un pago de $0.00 insertado). Este es el caso que motivó
--        separar la validación de "> 0" del redondeo: 0.004 pasa cualquier
--        chequeo de "p_monto > 0" hecho ANTES de redondear, pero
--        round(0.004, 2) = 0.00.
--
--   SELECT * FROM public.registrar_pago_venta(
--     '<venta_id>'::uuid, 0.004, 'efectivo', NULL, NULL, now()
--   );
--   -- Esperado: ERROR VP002. Confirmar además que no quedó ninguna fila
--   -- nueva en pagos ni cambios en ventas.saldo_pendiente/monto_pagado.
--
--   SELECT * FROM public.registrar_pago_socio(
--     '<socio_id>'::uuid, 0.004, 'efectivo', NULL, NULL, now()
--   );
--   -- Esperado: ERROR VP002. La validación de monto corre antes que la
--   -- búsqueda de deudas del socio, así que da VP002 tenga o no deudas
--   -- pendientes.
--
-- 3) Método de pago inválido — confirmar VP004:
--
--   SELECT * FROM public.registrar_pago_venta(
--     '<venta_id>'::uuid, 100, 'pendiente', NULL, NULL, now()
--   );
--   -- Esperado: ERROR VP004 ('pendiente' no es un método de pago válido para
--   -- un registro de pagos, sólo para el campo agregado de ventas).
--
-- 4) Pago de socio distribuido en 3+ deudas — crear 3 ventas del mismo socio
--    (con registrar_venta, en momentos ligeramente distintos o con
--    p_fecha explícita para controlar el orden FIFO), tomar sus totales
--    reales, y pagar un monto que cubra la primera completa, parte de la
--    segunda, nada de la tercera:
--
--   SELECT * FROM public.registrar_pago_socio(
--     '<socio_id>'::uuid, <total_venta_1 + total_venta_2 * 0.5>, 'efectivo', NULL, NULL, now()
--   );
--   -- Verificar en el resultado que el orden de venta_id coincide con el
--   -- orden de creación (created_at ASC, id ASC) y que venta_1 queda con
--   -- saldo_restante = 0 y venta_2 con saldo_restante = total_venta_2 * 0.5.
--
-- 5) Monto que excede la deuda total del socio — confirmar VP003 y que
--    ninguna de las ventas del socio cambió:
--
--   SELECT * FROM public.registrar_pago_socio(
--     '<socio_id>'::uuid, <deuda_total_del_socio + 1>, 'efectivo', NULL, NULL, now()
--   );
--   -- Esperado: ERROR VP003.
--
-- 6) Socio sin deudas pendientes — confirmar VP006:
--
--   SELECT * FROM public.registrar_pago_socio(
--     '<socio_id_sin_deudas>'::uuid, 100, 'efectivo', NULL, NULL, now()
--   );
--   -- Esperado: ERROR VP006.
--
-- 7) Fecha nula — confirmar VP007 en ambas funciones:
--
--   SELECT * FROM public.registrar_pago_venta('<venta_id>'::uuid, 100, 'efectivo', NULL, NULL, NULL);
--   SELECT * FROM public.registrar_pago_socio('<socio_id>'::uuid, 100, 'efectivo', NULL, NULL, NULL);
--   -- Esperado: ERROR VP007 en ambos casos.
--
-- 8) Permisos — confirmar que sólo `authenticated` puede ejecutar ambas
--    funciones:
--    a) Desde la aplicación logueada: registrar un pago real y confirmar
--       que se registra igual que con el flujo viejo.
--    b) Con SÓLO la anon key pública (sin cookie de sesión), hacer
--       POST /rest/v1/rpc/registrar_pago_venta (y lo mismo para
--       registrar_pago_socio) con cualquier body y confirmar que devuelve
--       un error de permiso (403 / 42501), no que ejecuta la función.
--
-- =============================================================================
-- ROLLBACK
-- =============================================================================
--
-- Estas funciones no crean columnas, índices ni tablas nuevas — sólo se
-- agregan a sí mismas. Para deshacer sólo este script (sin tocar el
-- frontend, o después de haberlo revertido):
--
--   DROP FUNCTION IF EXISTS public.registrar_pago_venta(uuid, numeric, text, text, text, timestamptz);
--   DROP FUNCTION IF EXISTS public.registrar_pago_socio(uuid, numeric, text, text, text, timestamptz);
--
-- Los flujos viejos de components/deudas-manager.tsx y
-- components/historial-ventas.tsx (si se revierten esos commits) siguen
-- funcionando sin cambios, porque este script no modificó ninguna tabla ni
-- policy existente.
