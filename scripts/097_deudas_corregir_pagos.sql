-- 095 — Deudas: corregir o anular un pago cargado por error.
--
-- Pedido de Facundo (12/11/2026): en Deudas se puede ver el historial de las
-- deudas saldadas y corregir un pago mal cargado (monto, método, fecha, notas)
-- o anularlo. Hasta ahora un error no tenía arreglo desde la app.
--
-- Dos funciones SECURITY DEFINER, cada una en una sola transacción:
--   corregir_pago(p_pago_id, p_monto, p_metodo_pago, p_fecha, p_notas)
--   anular_pago(p_pago_id)
-- Las dos ajustan la entrega con la diferencia (no recalculan desde cero, para
-- no tocar entregas viejas pagadas sin filas en pagos):
--   saldo_pendiente := saldo_pendiente + monto_viejo − monto_nuevo
--   monto_pagado    := monto_pagado    − monto_viejo + monto_nuevo
-- y dejan metodo_pago en 'pendiente' si queda saldo, o en el método de los
-- pagos ('mixto' si hay más de uno) si queda saldada.
--
-- Permiso: acción nueva "deudas.corregir" (la comisión la tiene siempre).
-- Los pagos con la retribución siguen protegidos por el trigger de 091: para
-- cambiarlos hay que anular la liquidación en Retribuciones.
--
-- Errores (se muestran tal cual): VP002 monto, VP003 deja saldo negativo,
-- VP004 método, VP007 fecha, VP008 pago inexistente, VP009 sin permiso.
-- Script idempotente.

BEGIN;

CREATE OR REPLACE FUNCTION public.corregir_pago(
  p_pago_id     uuid,
  p_monto       numeric,
  p_metodo_pago text,
  p_fecha       timestamptz,
  p_notas       text
)
RETURNS SETOF public.ventas
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_pago  public.pagos%ROWTYPE;
  v_venta public.ventas%ROWTYPE;
  v_monto numeric;
  v_saldo numeric;
BEGIN
  IF NOT public.tiene_permiso('deudas.corregir') THEN
    RAISE EXCEPTION 'No tenés permiso para corregir pagos' USING ERRCODE = 'VP009';
  END IF;

  SELECT * INTO v_pago FROM public.pagos WHERE id = p_pago_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El pago indicado no existe' USING ERRCODE = 'VP008';
  END IF;

  IF p_metodo_pago IS NULL OR p_metodo_pago NOT IN ('efectivo', 'transferencia') THEN
    RAISE EXCEPTION 'El método de pago debe ser efectivo o transferencia' USING ERRCODE = 'VP004';
  END IF;
  IF p_fecha IS NULL THEN
    RAISE EXCEPTION 'La fecha del pago es obligatoria' USING ERRCODE = 'VP007';
  END IF;

  v_monto := round(COALESCE(p_monto, 0), 2);
  IF v_monto <= 0 THEN
    RAISE EXCEPTION 'El monto debe ser mayor a cero' USING ERRCODE = 'VP002';
  END IF;

  SELECT * INTO v_venta FROM public.ventas WHERE id = v_pago.venta_id;
  v_saldo := COALESCE(v_venta.saldo_pendiente, 0) + v_pago.monto - v_monto;
  IF v_saldo < 0 THEN
    RAISE EXCEPTION 'Con ese monto la entrega quedaría pagada de más (sobran $%)', -v_saldo USING ERRCODE = 'VP003';
  END IF;

  UPDATE public.pagos
  SET monto = v_monto, metodo_pago = p_metodo_pago, fecha = p_fecha, notas = p_notas
  WHERE id = p_pago_id;

  UPDATE public.ventas AS vt
  SET saldo_pendiente = v_saldo,
      monto_pagado    = COALESCE(vt.monto_pagado, 0) - v_pago.monto + v_monto,
      metodo_pago     = CASE
        WHEN v_saldo > 0 THEN 'pendiente'
        ELSE (SELECT CASE WHEN count(DISTINCT p.metodo_pago) = 1 THEN min(p.metodo_pago) ELSE 'mixto' END
              FROM public.pagos AS p WHERE p.venta_id = vt.id)
      END
  WHERE vt.id = v_pago.venta_id;

  RETURN QUERY SELECT * FROM public.ventas WHERE id = v_pago.venta_id;
END;
$$;

REVOKE ALL ON FUNCTION public.corregir_pago(uuid, numeric, text, timestamptz, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.corregir_pago(uuid, numeric, text, timestamptz, text) TO authenticated;


CREATE OR REPLACE FUNCTION public.anular_pago(p_pago_id uuid)
RETURNS SETOF public.ventas
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_pago public.pagos%ROWTYPE;
BEGIN
  IF NOT public.tiene_permiso('deudas.corregir') THEN
    RAISE EXCEPTION 'No tenés permiso para anular pagos' USING ERRCODE = 'VP009';
  END IF;

  SELECT * INTO v_pago FROM public.pagos WHERE id = p_pago_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El pago indicado no existe' USING ERRCODE = 'VP008';
  END IF;

  DELETE FROM public.pagos WHERE id = p_pago_id;

  UPDATE public.ventas AS vt
  SET saldo_pendiente = COALESCE(vt.saldo_pendiente, 0) + v_pago.monto,
      monto_pagado    = GREATEST(COALESCE(vt.monto_pagado, 0) - v_pago.monto, 0),
      metodo_pago     = 'pendiente'
  WHERE vt.id = v_pago.venta_id;

  RETURN QUERY SELECT * FROM public.ventas WHERE id = v_pago.venta_id;
END;
$$;

REVOKE ALL ON FUNCTION public.anular_pago(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.anular_pago(uuid) TO authenticated;

COMMIT;

-- Prueba (con un pago de prueba):
--   SELECT * FROM public.corregir_pago('<pago_id>', 1000, 'efectivo', now(), 'corrección');
--   SELECT * FROM public.anular_pago('<pago_id>');
-- Volver atrás:
--   DROP FUNCTION public.corregir_pago(uuid, numeric, text, timestamptz, text);
--   DROP FUNCTION public.anular_pago(uuid);
