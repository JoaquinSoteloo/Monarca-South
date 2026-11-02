-- Fase C — categorías de gastos nuevas, campo Proyecto y reclasificación.
--
-- 1) Las categorías pasan a ser las del pedido de cambios (29/10/2026), cada
--    una con "qué entra" y cómo cuenta en el resultado del mes:
--      resultado -> cuenta como gasto del mes
--      inversion -> aparte, como inversión (Equipamiento)
--      aparte    -> no cuenta; se muestra aparte en Caja (Devolución de aportes)
--    Más "Sin clasificar", para lo que no se pudo reclasificar solo.
--
-- 2) gastos.categoria queda atada a categorias_gasto.nombre: renombrar una
--    categoría actualiza sus gastos, y no se puede borrar una que tenga gastos
--    (primero se reclasifican).
--
-- 3) Los gastos ya cargados se reclasifican por la descripción; lo dudoso queda
--    en "Sin clasificar" para reclasificarlo desde Gastos. Las categorías
--    viejas (Varios, Gastos Fijos, Mercadería) se borran.
--
-- 4) gastos.proyecto (opcional), para ver cuánto costó cada proyecto.
--
-- 5) Sólo la comisión crea, renombra o borra categorías. Hasta acá las
--    políticas de categorias_gasto eran para PUBLIC: cualquiera, incluso sin
--    sesión, podía agregar o borrar categorías.

BEGIN;

-- =============================================================================
-- 1) Categorías
-- =============================================================================

ALTER TABLE public.categorias_gasto
  ADD COLUMN IF NOT EXISTS descripcion text,
  ADD COLUMN IF NOT EXISTS en_resultado text NOT NULL DEFAULT 'resultado',
  ADD COLUMN IF NOT EXISTS orden integer NOT NULL DEFAULT 100;

ALTER TABLE public.categorias_gasto DROP CONSTRAINT IF EXISTS categorias_gasto_en_resultado_check;
ALTER TABLE public.categorias_gasto
  ADD CONSTRAINT categorias_gasto_en_resultado_check CHECK (en_resultado IN ('resultado', 'inversion', 'aparte'));

INSERT INTO public.categorias_gasto (nombre, descripcion, en_resultado, orden) VALUES
  ('Retribuciones del equipo', 'Una línea por persona, en dinero o en producto', 'resultado', 10),
  ('Servicios', 'Luz, aire, Verisure, internet', 'resultado', 20),
  ('Insumos de cultivo', 'Sustrato, nutrientes, esquejes, macetas, micorrizas', 'resultado', 30),
  ('Obras y mantenimiento', 'Trabajos de electricidad, arreglos, mano de obra', 'resultado', 40),
  ('Equipamiento', 'Ventiladores, medidores, cámaras, todo lo que dura años', 'inversion', 50),
  ('Honorarios profesionales', 'Contador, Director Técnico, asesores', 'resultado', 60),
  ('Packaging', 'Bolsas, frascos, stickers', 'resultado', 70),
  ('Insumos de elaboración', 'Hielo seco, materiales para rosin y hash', 'resultado', 80),
  ('Gastos de sede', 'Comida, bebida, limpieza', 'resultado', 90),
  ('Devolución de aportes', 'Cuotas de devolución a quienes aportaron capital', 'aparte', 100),
  ('Otros', 'Lo que no entra en ninguna; debería quedar por debajo del 5 %', 'resultado', 110),
  ('Sin clasificar', 'Gastos viejos que hay que reclasificar', 'resultado', 120)
ON CONFLICT (nombre) DO UPDATE
  SET descripcion = EXCLUDED.descripcion, en_resultado = EXCLUDED.en_resultado, orden = EXCLUDED.orden;

-- =============================================================================
-- 2) Reclasificar los gastos cargados
-- =============================================================================

UPDATE public.gastos g
SET categoria = c.cat, updated_at = now()
FROM (
  SELECT id, CASE
    WHEN d LIKE '%sueldo%' THEN 'Retribuciones del equipo'
    WHEN d LIKE '%contador%' THEN 'Honorarios profesionales'
    WHEN d ~ '(ventilador|camara|cámara|medidor)' THEN 'Equipamiento'
    WHEN d ~ '(hielo|manolo)' THEN 'Insumos de elaboración'
    WHEN d ~ '(luz|verisur|aire|internet)' THEN 'Servicios'
    WHEN d ~ '(cocomix|sustrato|esqueje|micori|maseta|maceta|melaza|lugan)' THEN 'Insumos de cultivo'
    WHEN d ~ '(comida|coca|bebida|agua|merienda|limp|birra|cafe|café|galle|morfi|compras|bolsas residuos|encendedor)' THEN 'Gastos de sede'
    WHEN d ~ '(stick|stiker|frasco|bolsas fantasia|bolsas negras)' THEN 'Packaging'
    ELSE 'Sin clasificar'
  END AS cat
  FROM (SELECT id, lower(btrim(descripcion)) AS d FROM public.gastos) x
) c
WHERE g.id = c.id
  AND g.categoria IN ('Varios', 'Gastos Fijos', 'Mercadería');

-- Cualquier otra categoría que no esté en la lista nueva también queda sin clasificar.
UPDATE public.gastos
SET categoria = 'Sin clasificar', updated_at = now()
WHERE categoria IS NULL
   OR categoria NOT IN (SELECT nombre FROM public.categorias_gasto WHERE nombre NOT IN ('Varios', 'Gastos Fijos', 'Mercadería'));

DELETE FROM public.categorias_gasto WHERE nombre IN ('Varios', 'Gastos Fijos', 'Mercadería');

-- =============================================================================
-- 3) gastos: categoría atada a la lista, y Proyecto
-- =============================================================================

ALTER TABLE public.gastos ALTER COLUMN categoria SET DEFAULT 'Sin clasificar';
ALTER TABLE public.gastos ALTER COLUMN categoria SET NOT NULL;

ALTER TABLE public.gastos DROP CONSTRAINT IF EXISTS gastos_categoria_fkey;
ALTER TABLE public.gastos
  ADD CONSTRAINT gastos_categoria_fkey FOREIGN KEY (categoria)
  REFERENCES public.categorias_gasto (nombre) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE public.gastos ADD COLUMN IF NOT EXISTS proyecto text;
ALTER TABLE public.gastos DROP CONSTRAINT IF EXISTS gastos_proyecto_check;
ALTER TABLE public.gastos
  ADD CONSTRAINT gastos_proyecto_check CHECK (proyecto IS NULL OR btrim(proyecto) <> '');

CREATE INDEX IF NOT EXISTS gastos_categoria_idx ON public.gastos (categoria);
CREATE INDEX IF NOT EXISTS gastos_proyecto_idx ON public.gastos (proyecto) WHERE proyecto IS NOT NULL;

-- =============================================================================
-- 4) Permisos de categorias_gasto
-- =============================================================================

DROP POLICY IF EXISTS "public select categorias_gasto" ON public.categorias_gasto;
DROP POLICY IF EXISTS "public insert categorias_gasto" ON public.categorias_gasto;
DROP POLICY IF EXISTS "public delete categorias_gasto" ON public.categorias_gasto;
DROP POLICY IF EXISTS categorias_gasto_select ON public.categorias_gasto;
DROP POLICY IF EXISTS categorias_gasto_comision ON public.categorias_gasto;

ALTER TABLE public.categorias_gasto ENABLE ROW LEVEL SECURITY;

CREATE POLICY categorias_gasto_select ON public.categorias_gasto
  FOR SELECT TO authenticated USING (true);

CREATE POLICY categorias_gasto_comision ON public.categorias_gasto
  FOR ALL TO authenticated
  USING (public.rol_actual() = 'comision')
  WITH CHECK (public.rol_actual() = 'comision');

REVOKE ALL ON public.categorias_gasto FROM anon;

COMMIT;

-- =============================================================================
-- VERIFICACIÓN
-- =============================================================================
--   SELECT categoria, count(*), sum(monto) FROM public.gastos GROUP BY 1 ORDER BY 3 DESC;
--   -> 145 reclasificados y 14 en "Sin clasificar" (datos al 31/10/2026).
--
-- =============================================================================
-- ROLLBACK (las categorías de cada gasto no vuelven a las viejas)
-- =============================================================================
--   BEGIN;
--   ALTER TABLE public.gastos DROP CONSTRAINT IF EXISTS gastos_categoria_fkey;
--   ALTER TABLE public.gastos DROP CONSTRAINT IF EXISTS gastos_proyecto_check;
--   ALTER TABLE public.gastos DROP COLUMN IF EXISTS proyecto;
--   ALTER TABLE public.gastos ALTER COLUMN categoria DROP NOT NULL;
--   ALTER TABLE public.gastos ALTER COLUMN categoria SET DEFAULT 'Varios';
--   COMMIT;
