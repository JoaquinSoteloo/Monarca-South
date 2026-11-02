-- Fase D — aportes de capital.
--
-- 1) aportes_capital: una ficha por aporte (aportante, monto, moneda, fecha,
--    cantidad de cuotas). La comisión los carga y edita; todos los ven.
--
-- 2) Cada devolución es un gasto de la categoría "Devolución de aportes"
--    (en_resultado = 'aparte', scripts/069) vinculado a su aporte con
--    gastos.aporte_id. La devolución va en la moneda del aporte: si se prestó
--    en dólares, se devuelve en dólares (gastos.moneda). El resto de los gastos
--    es siempre en pesos.
--
-- 3) aportes_capital_resumen: devuelto, cuotas pagadas y saldo de cada aporte,
--    calculados a partir de sus devoluciones.
--
-- Reglas (trigger en gastos):
--   GA001  una devolución tiene que indicar a qué aporte corresponde
--   GA002  sólo los gastos de devolución se vinculan a un aporte
--   GA003  la devolución no puede superar el saldo del aporte
-- Reglas (trigger en aportes_capital):
--   GA004  el monto no puede quedar por debajo de lo ya devuelto
--   GA005  no se cambia la moneda de un aporte con devoluciones

BEGIN;

-- =============================================================================
-- 1) Aportes
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.aportes_capital (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aportante text NOT NULL CHECK (btrim(aportante) <> ''),
  monto numeric(14,2) NOT NULL CHECK (monto > 0),
  moneda text NOT NULL DEFAULT 'ARS' CHECK (moneda IN ('ARS', 'USD')),
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  cuotas integer NOT NULL DEFAULT 1 CHECK (cuotas >= 1),
  nota text,
  creado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.aportes_capital ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS aportes_capital_select ON public.aportes_capital;
CREATE POLICY aportes_capital_select ON public.aportes_capital
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS aportes_capital_comision ON public.aportes_capital;
CREATE POLICY aportes_capital_comision ON public.aportes_capital
  FOR ALL TO authenticated
  USING (public.rol_actual() = 'comision')
  WITH CHECK (public.rol_actual() = 'comision');

REVOKE ALL ON public.aportes_capital FROM anon;

-- =============================================================================
-- 2) Gastos: vínculo con el aporte y moneda
-- =============================================================================

ALTER TABLE public.gastos
  ADD COLUMN IF NOT EXISTS aporte_id uuid REFERENCES public.aportes_capital(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS moneda text NOT NULL DEFAULT 'ARS';

ALTER TABLE public.gastos DROP CONSTRAINT IF EXISTS gastos_moneda_check;
ALTER TABLE public.gastos ADD CONSTRAINT gastos_moneda_check CHECK (moneda IN ('ARS', 'USD'));

CREATE INDEX IF NOT EXISTS gastos_aporte_idx ON public.gastos (aporte_id) WHERE aporte_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.validar_gasto_aporte()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_es_devolucion boolean;
  v_aporte public.aportes_capital%ROWTYPE;
  v_devuelto numeric;
BEGIN
  SELECT en_resultado = 'aparte' INTO v_es_devolucion
  FROM public.categorias_gasto WHERE nombre = NEW.categoria;

  IF COALESCE(v_es_devolucion, false) THEN
    IF NEW.aporte_id IS NULL THEN
      RAISE EXCEPTION 'Elegí a qué aporte corresponde la devolución' USING ERRCODE = 'GA001';
    END IF;

    -- Bloquea el aporte para que dos devoluciones simultáneas no pasen el saldo.
    SELECT * INTO v_aporte FROM public.aportes_capital WHERE id = NEW.aporte_id FOR UPDATE;

    SELECT COALESCE(sum(monto), 0) INTO v_devuelto
    FROM public.gastos
    WHERE aporte_id = NEW.aporte_id AND id IS DISTINCT FROM NEW.id;

    IF v_devuelto + NEW.monto > v_aporte.monto THEN
      RAISE EXCEPTION 'La devolución supera el saldo del aporte de %: quedan %',
        v_aporte.aportante,
        CASE v_aporte.moneda WHEN 'USD' THEN 'US' ELSE '' END || public.fmt_pesos(v_aporte.monto - v_devuelto)
        USING ERRCODE = 'GA003';
    END IF;

    NEW.moneda := v_aporte.moneda;
  ELSE
    IF NEW.aporte_id IS NOT NULL THEN
      RAISE EXCEPTION 'Sólo las devoluciones de aportes se vinculan a un aporte' USING ERRCODE = 'GA002';
    END IF;
    NEW.moneda := 'ARS';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validar_gasto_aporte() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS gastos_validar_aporte ON public.gastos;
CREATE TRIGGER gastos_validar_aporte
  BEFORE INSERT OR UPDATE OF categoria, aporte_id, monto, moneda ON public.gastos
  FOR EACH ROW EXECUTE FUNCTION public.validar_gasto_aporte();

CREATE OR REPLACE FUNCTION public.validar_aporte_capital()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_devuelto numeric;
  v_cantidad integer;
BEGIN
  SELECT COALESCE(sum(monto), 0), count(*) INTO v_devuelto, v_cantidad
  FROM public.gastos WHERE aporte_id = NEW.id;

  IF NEW.monto < v_devuelto THEN
    RAISE EXCEPTION 'El monto no puede ser menor a lo ya devuelto (%)',
      CASE NEW.moneda WHEN 'USD' THEN 'US' ELSE '' END || public.fmt_pesos(v_devuelto) USING ERRCODE = 'GA004';
  END IF;
  IF NEW.moneda IS DISTINCT FROM OLD.moneda AND v_cantidad > 0 THEN
    RAISE EXCEPTION 'No se puede cambiar la moneda de un aporte que ya tiene devoluciones' USING ERRCODE = 'GA005';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validar_aporte_capital() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS aportes_capital_validar ON public.aportes_capital;
CREATE TRIGGER aportes_capital_validar
  BEFORE UPDATE ON public.aportes_capital
  FOR EACH ROW EXECUTE FUNCTION public.validar_aporte_capital();

-- =============================================================================
-- 3) Resumen por aporte
-- =============================================================================

CREATE OR REPLACE VIEW public.aportes_capital_resumen
WITH (security_invoker = true) AS
SELECT
  a.*,
  COALESCE(d.devuelto, 0)::numeric(14,2) AS devuelto,
  COALESCE(d.cuotas_pagadas, 0)::integer AS cuotas_pagadas,
  (a.monto - COALESCE(d.devuelto, 0))::numeric(14,2) AS saldo,
  d.ultima_devolucion
FROM public.aportes_capital a
LEFT JOIN (
  SELECT aporte_id, sum(monto) AS devuelto, count(*) AS cuotas_pagadas, max(fecha) AS ultima_devolucion
  FROM public.gastos
  WHERE aporte_id IS NOT NULL
  GROUP BY aporte_id
) d ON d.aporte_id = a.id;

REVOKE ALL ON public.aportes_capital_resumen FROM anon;
GRANT SELECT ON public.aportes_capital_resumen TO authenticated;

COMMIT;

-- =============================================================================
-- ROLLBACK
-- =============================================================================
--   BEGIN;
--   DROP VIEW IF EXISTS public.aportes_capital_resumen;
--   DROP TRIGGER IF EXISTS gastos_validar_aporte ON public.gastos;
--   DROP FUNCTION IF EXISTS public.validar_gasto_aporte();
--   ALTER TABLE public.gastos DROP COLUMN IF EXISTS aporte_id;
--   ALTER TABLE public.gastos DROP COLUMN IF EXISTS moneda;
--   DROP TABLE IF EXISTS public.aportes_capital;
--   DROP FUNCTION IF EXISTS public.validar_aporte_capital();
--   COMMIT;
