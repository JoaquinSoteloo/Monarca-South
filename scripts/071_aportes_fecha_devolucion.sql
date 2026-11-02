-- Fecha de devolución opcional en los aportes de capital.
--
-- No es obligatoria: muchas veces se devuelve cuando hay plata, no en una
-- fecha. Si está cargada y pasó con saldo pendiente, la pantalla lo marca
-- como vencido.
--
-- La vista aportes_capital_resumen (070) usa a.*, que se expande al crearla:
-- hay que recrearla para que incluya la columna nueva.

BEGIN;

ALTER TABLE public.aportes_capital ADD COLUMN IF NOT EXISTS fecha_devolucion date;

ALTER TABLE public.aportes_capital DROP CONSTRAINT IF EXISTS aportes_capital_fecha_devolucion_check;
ALTER TABLE public.aportes_capital
  ADD CONSTRAINT aportes_capital_fecha_devolucion_check CHECK (fecha_devolucion IS NULL OR fecha_devolucion >= fecha);

DROP VIEW IF EXISTS public.aportes_capital_resumen;
CREATE VIEW public.aportes_capital_resumen
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

-- ROLLBACK
--   BEGIN;
--   DROP VIEW IF EXISTS public.aportes_capital_resumen;
--   ALTER TABLE public.aportes_capital DROP COLUMN IF EXISTS fecha_devolucion;
--   -- re-correr la sección 3 de 070 (la vista)
--   COMMIT;
