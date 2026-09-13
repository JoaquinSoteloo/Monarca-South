-- Etapa 4B2 (fix) — Corrección explícita del método de un pago existente.
--
-- Por qué: el diálogo "Editar venta" de components/historial-ventas.tsx
-- escribía ventas.metodo_pago directamente (sin pasar por ninguna RPC ni
-- tocar pagos/saldo_pendiente/monto_pagado), lo que permitía que
-- ventas.metodo_pago quedara diciendo una cosa mientras pagos.metodo_pago
-- (la fuente real del cobro) decía otra, o que "pendiente" quedara escrito
-- en ventas.metodo_pago aunque saldo_pendiente ya fuera 0. Ese bug se separa
-- en dos correcciones:
--
--   1. components/historial-ventas.tsx ya no deja que "Editar venta" toque
--      metodo_pago (ver handleSaveEdit).
--   2. Esta función da la única forma soportada de corregir el método de un
--      pago puntual ya registrado, re-sincronizando ventas.metodo_pago con
--      pagos en el mismo movimiento.
--
-- Alcance: sólo corrige metodo_pago. No crea pagos, no anula pagos, no
-- cambia monto/fecha/comprobante_url/notas de pagos, no toca
-- saldo_pendiente ni monto_pagado, no permite volver una venta pagada a
-- pendiente (rechaza 'pendiente' como valor de entrada). Convertir una venta
-- pagada de nuevo en pendiente requeriría anular un pago — fuera de alcance
-- de esta etapa.
--
-- Separado de scripts/063_pagos_transaccional_rpc.sql (no se lo modifica)
-- porque 063 puede ya haber sido ejecutado contra la base real.
--
-- "Pendiente" como campo derivado: ventas.metodo_pago = 'pendiente' ya NO se
-- interpreta como un método de pago real, sino como "esta venta tiene
-- saldo_pendiente > 0". Por eso esta función:
--   - Nunca acepta 'pendiente' como valor de p_metodo_pago (ver MP002) — el
--     CHECK real de pagos.metodo_pago tampoco lo permite.
--   - Recalcula ventas.metodo_pago según saldo_pendiente, no lo copia del
--     pago corregido.
--
-- Pago final: cuando la venta queda totalmente pagada (saldo_pendiente <= 0)
-- después de la corrección, ventas.metodo_pago se fija según el método del
-- pago más reciente de esa venta (mismo criterio que usan
-- registrar_pago_venta/registrar_pago_socio en 063 para decidir el
-- metodo_pago agregado al completar el saldo). El orden usa
-- fecha DESC NULLS LAST, created_at DESC NULLS LAST, id DESC porque
-- pagos.fecha y pagos.created_at son nullable en el esquema versionado
-- (DEFAULT NOW() sin NOT NULL, scripts/027_create_pagos_deudas.sql) — id
-- nunca es null y desempata de forma estable.
--
-- Si la venta tiene pagos con métodos distintos, no se agrega ningún valor
-- "mixto" al esquema en esta etapa: se mantiene la misma convención que 063
-- (el método del pago final).
--
-- Ambigüedad de columnas: al declarar
-- RETURNS TABLE(pago_id uuid, pago_metodo_pago text, venta_id uuid,
-- venta_metodo_pago text), esos cuatro nombres quedan como variables
-- implícitas visibles en toda la función. Para no arriesgar una referencia
-- ambigua entre esas variables de salida y columnas reales de
-- pagos/ventas del mismo nombre, la función nunca usa esos identificadores
-- sueltos: las variables locales se llaman v_pago_id/v_venta_id (no
-- pago_id/venta_id), y toda columna de pagos/ventas se califica con alias
-- de tabla (pg./vt.), nunca "id"/"venta_id" sueltos.
--
-- Errores: códigos SQLSTATE propios de 5 caracteres, prefijo MP0xx (no
-- reutiliza VP0xx de registrar_pago_venta/registrar_pago_socio en 063, para
-- no asumir nada sobre ese espacio de códigos):
--   MP001 — el pago indicado no existe
--   MP002 — método de pago inválido (sólo se acepta 'efectivo' o
--           'transferencia'; 'pendiente' se rechaza explícitamente)
--
-- Permisos: SECURITY DEFINER + SET search_path = '' (referencias siempre
-- calificadas public.<tabla>). REVOKE ALL FROM PUBLIC + GRANT EXECUTE sólo a
-- authenticated (NO anon).
--
-- Script idempotente: CREATE OR REPLACE FUNCTION + su propio REVOKE/GRANT,
-- se puede re-correr sin error. No crea columnas, índices ni tablas nuevas.
-- Envuelto en una transacción (BEGIN/COMMIT).
--
-- Este script NO se ejecuta como parte de esta corrección — sólo se deja
-- escrito y revisado. Instrucciones de prueba, diagnóstico de datos
-- históricos y rollback: ver el final de este archivo.

BEGIN;

CREATE OR REPLACE FUNCTION public.corregir_metodo_pago(
  p_pago_id     uuid,
  p_metodo_pago text
)
RETURNS TABLE (
  pago_id           uuid,
  pago_metodo_pago  text,
  venta_id          uuid,
  venta_metodo_pago text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_pago_id uuid;
  v_venta_id uuid;
  v_saldo_pendiente numeric;
  v_metodo_agregado text;
BEGIN
  ----------------------------------------------------------------------
  -- 1) Validaciones (sólo lecturas, nada se escribe todavía)
  ----------------------------------------------------------------------
  IF p_metodo_pago IS NULL OR p_metodo_pago NOT IN ('efectivo', 'transferencia') THEN
    RAISE EXCEPTION 'El método de pago debe ser efectivo o transferencia' USING ERRCODE = 'MP002';
  END IF;

  v_pago_id := p_pago_id;

  SELECT pg.venta_id INTO v_venta_id
  FROM public.pagos AS pg
  WHERE pg.id = v_pago_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El pago indicado no existe' USING ERRCODE = 'MP001';
  END IF;

  ----------------------------------------------------------------------
  -- 2) Escritura — recién acá se modifica algo. Si algo de acá en adelante
  --    fallara, Postgres revierte todo lo anterior automáticamente.
  ----------------------------------------------------------------------
  UPDATE public.pagos AS pg
  SET metodo_pago = p_metodo_pago
  WHERE pg.id = v_pago_id;

  SELECT vt.saldo_pendiente INTO v_saldo_pendiente
  FROM public.ventas AS vt
  WHERE vt.id = v_venta_id
  FOR UPDATE;

  IF COALESCE(v_saldo_pendiente, 0) > 0 THEN
    -- Todavía queda deuda: el campo agregado de la venta sigue siendo
    -- "pendiente", sin importar qué método tenga cada pago individual.
    v_metodo_agregado := 'pendiente';
  ELSE
    -- Venta totalmente pagada: el campo agregado toma el método del pago
    -- más reciente (mismo criterio que 063 al completar el saldo).
    SELECT pg.metodo_pago INTO v_metodo_agregado
    FROM public.pagos AS pg
    WHERE pg.venta_id = v_venta_id
    ORDER BY pg.fecha DESC NULLS LAST, pg.created_at DESC NULLS LAST, pg.id DESC
    LIMIT 1;
  END IF;

  UPDATE public.ventas AS vt
  SET metodo_pago = v_metodo_agregado
  WHERE vt.id = v_venta_id;

  RETURN QUERY SELECT v_pago_id, p_metodo_pago, v_venta_id, v_metodo_agregado;
END;
$$;

REVOKE ALL ON FUNCTION public.corregir_metodo_pago(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.corregir_metodo_pago(uuid, text) TO authenticated;

COMMIT;

-- =============================================================================
-- DIAGNÓSTICO DE DATOS HISTÓRICOS INCONSISTENTES
-- =============================================================================
--
-- Sólo lectura. No corrige nada automáticamente — primero hay que ver qué
-- inconsistencias existen y decidir manualmente cómo corregir cada caso
-- (algunas pueden necesitar corregir un pago con la función de arriba;
-- otras pueden ser datos legacy que conviene dejar como están).
--
-- 1) ventas marcadas "pendiente" que en realidad ya no tienen saldo:
SELECT vt.id, vt.socio_id, vt.metodo_pago, vt.saldo_pendiente, vt.monto_pagado, vt.total
FROM public.ventas AS vt
WHERE vt.metodo_pago = 'pendiente'
  AND COALESCE(vt.saldo_pendiente, 0) <= 0;

-- 2) ventas con saldo pendiente real que no están marcadas "pendiente":
SELECT vt.id, vt.socio_id, vt.metodo_pago, vt.saldo_pendiente, vt.monto_pagado, vt.total
FROM public.ventas AS vt
WHERE COALESCE(vt.saldo_pendiente, 0) > 0
  AND vt.metodo_pago <> 'pendiente';

-- 3) ventas totalmente pagadas cuyo metodo_pago agregado no coincide con el
--    método de su pago final (mismo criterio de orden que la función):
WITH pago_final AS (
  SELECT DISTINCT ON (pg.venta_id)
    pg.venta_id,
    pg.metodo_pago AS metodo_pago_final
  FROM public.pagos AS pg
  ORDER BY pg.venta_id, pg.fecha DESC NULLS LAST, pg.created_at DESC NULLS LAST, pg.id DESC
)
SELECT vt.id, vt.metodo_pago AS metodo_pago_venta, pf.metodo_pago_final
FROM public.ventas AS vt
JOIN pago_final AS pf ON pf.venta_id = vt.id
WHERE COALESCE(vt.saldo_pendiente, 0) <= 0
  AND vt.metodo_pago IS DISTINCT FROM pf.metodo_pago_final;

-- 4) ventas cuyo monto_pagado no coincide con la suma real de sus pagos,
--    separando las que no tienen ninguna fila en pagos (legacy) de las que
--    sí tienen pagos pero no cuadran:
WITH suma_pagos AS (
  SELECT pg.venta_id, SUM(pg.monto) AS total_pagos
  FROM public.pagos AS pg
  GROUP BY pg.venta_id
)
SELECT
  vt.id,
  vt.monto_pagado,
  sp.total_pagos,
  (sp.venta_id IS NULL) AS sin_filas_en_pagos
FROM public.ventas AS vt
LEFT JOIN suma_pagos AS sp ON sp.venta_id = vt.id
WHERE COALESCE(vt.monto_pagado, 0) IS DISTINCT FROM COALESCE(sp.total_pagos, 0);

-- =============================================================================
-- PRUEBAS MANUALES (correr en el SQL Editor de Supabase, logueado como
-- postgres/owner; reemplazar los UUID de ejemplo por ids reales de tu base
-- de QA antes de correr). Todo puede probarse dentro de
-- BEGIN; ... ROLLBACK; para no dejar ningún rastro en datos reales.
--
-- 1) Pago único, venta totalmente pagada: efectivo -> transferencia.
--
--   BEGIN;
--   SELECT * FROM public.corregir_metodo_pago('<pago_id_efectivo>'::uuid, 'transferencia');
--   -- Verificar: pagos.metodo_pago = 'transferencia' para ese pago,
--   -- ventas.metodo_pago = 'transferencia', y que ventas.monto_pagado y
--   -- ventas.saldo_pendiente NO cambiaron.
--   ROLLBACK;
--
-- 2) Revertir transferencia -> efectivo sobre el mismo pago:
--
--   BEGIN;
--   SELECT * FROM public.corregir_metodo_pago('<pago_id>'::uuid, 'efectivo');
--   -- Verificar el mismo sincronismo que en el caso 1, en sentido inverso.
--   ROLLBACK;
--
-- 3) Intentar "pendiente" — confirmar que se rechaza:
--
--   SELECT * FROM public.corregir_metodo_pago('<pago_id>'::uuid, 'pendiente');
--   -- Esperado: ERROR MP002.
--
-- 3 bis) pago_id inexistente — confirmar MP001:
--
--   SELECT * FROM public.corregir_metodo_pago('00000000-0000-0000-0000-000000000000'::uuid, 'efectivo');
--   -- Esperado: ERROR MP001.
--
-- 4) Venta con saldo pendiente y uno o más pagos parciales: corregir el
--    método de un pago existente y confirmar que la venta sigue "pendiente":
--
--   BEGIN;
--   SELECT * FROM public.corregir_metodo_pago('<pago_id_de_venta_con_deuda>'::uuid, 'transferencia');
--   -- Verificar: venta_metodo_pago devuelto = 'pendiente' (porque
--   -- saldo_pendiente de esa venta sigue > 0), sin importar el método
--   -- recién asignado al pago. saldo_pendiente/monto_pagado sin cambios.
--   ROLLBACK;
--
-- 5) Venta pagada con varios pagos de métodos distintos:
--
--   BEGIN;
--   -- 5a) Corregir un pago que NO es el más reciente (por fecha/created_at/id):
--   SELECT * FROM public.corregir_metodo_pago('<pago_no_mas_reciente>'::uuid, 'efectivo');
--   -- Verificar: venta_metodo_pago sigue reflejando el método del pago MÁS
--   -- RECIENTE de la venta (no el que se acaba de corregir).
--
--   -- 5b) Corregir el pago más reciente:
--   SELECT * FROM public.corregir_metodo_pago('<pago_mas_reciente>'::uuid, 'transferencia');
--   -- Verificar: ahora sí, venta_metodo_pago = 'transferencia'.
--   ROLLBACK;
--
-- 6) Confirmar en cualquiera de los casos anteriores, antes y después:
--
--   SELECT id, metodo_pago, saldo_pendiente, monto_pagado FROM public.ventas WHERE id = '<venta_id>'::uuid;
--   -- monto_pagado y saldo_pendiente deben ser idénticos antes y después.
--
-- 7) Permisos — confirmar que sólo `authenticated` puede ejecutar la
--    función (con SÓLO la anon key pública, sin cookie de sesión, un POST a
--    /rest/v1/rpc/corregir_metodo_pago debe devolver error de permiso, no
--    ejecutar la función).
--
-- =============================================================================
-- ROLLBACK
-- =============================================================================
--
-- Esta función no crea columnas, índices ni tablas nuevas — sólo se agrega
-- a sí misma. Para deshacer sólo este script (sin tocar el frontend, o
-- después de haberlo revertido):
--
--   DROP FUNCTION IF EXISTS public.corregir_metodo_pago(uuid, text);
--
-- El botón "Corregir método" de components/historial-ventas.tsx (si se
-- revierte ese commit) deja de tener función que llamar, pero el resto del
-- Historial de Ventas sigue funcionando sin cambios, porque este script no
-- modificó ninguna tabla ni policy existente.
