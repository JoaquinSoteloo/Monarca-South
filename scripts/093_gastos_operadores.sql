-- Gastos: los operadores cargan, pero no ven los gastos de la asociación
-- (pedido de Facundo, 06/11/2026).
--
-- NO SE EJECUTÓ TODAVÍA. Correr después de 084_roles_y_permisos.sql y antes
-- de publicar el cambio de la pantalla Gastos. Se puede volver a correr.
--
-- - gastos.cargado_por: quién cargó cada gasto (se completa solo con el
--   usuario que lo carga). Los gastos viejos quedan sin dueño.
-- - Permiso nuevo "gastos.todos" (Ver todos los gastos y los totales).
--   La comisión lo tiene siempre; no se le da a ningún otro rol.
-- - RLS de gastos:
--     leer:    gastos.todos, o el gasto lo cargó uno mismo.
--     cargar:  gastos.ver (la pantalla).
--     editar / borrar: gastos.todos, o el propio dentro de las 24 h.
--   Los triggers de aportes y retribuciones siguen igual: los dispara la
--   comisión.

BEGIN;

ALTER TABLE public.gastos
  ADD COLUMN IF NOT EXISTS cargado_por UUID DEFAULT auth.uid();

CREATE INDEX IF NOT EXISTS gastos_cargado_por_idx ON public.gastos (cargado_por);

DROP POLICY IF EXISTS "authenticated_all_gastos" ON public.gastos;
DROP POLICY IF EXISTS "gastos_leer" ON public.gastos;
DROP POLICY IF EXISTS "gastos_cargar" ON public.gastos;
DROP POLICY IF EXISTS "gastos_editar" ON public.gastos;
DROP POLICY IF EXISTS "gastos_borrar" ON public.gastos;

CREATE POLICY "gastos_leer" ON public.gastos
  FOR SELECT TO authenticated
  USING (public.tiene_permiso('gastos.todos') OR cargado_por = auth.uid());

CREATE POLICY "gastos_cargar" ON public.gastos
  FOR INSERT TO authenticated
  WITH CHECK (
    public.tiene_permiso('gastos.todos')
    OR (public.tiene_permiso('gastos.ver') AND cargado_por = auth.uid())
  );

CREATE POLICY "gastos_editar" ON public.gastos
  FOR UPDATE TO authenticated
  USING (public.tiene_permiso('gastos.todos') OR (cargado_por = auth.uid() AND created_at > now() - interval '24 hours'))
  WITH CHECK (public.tiene_permiso('gastos.todos') OR cargado_por = auth.uid());

CREATE POLICY "gastos_borrar" ON public.gastos
  FOR DELETE TO authenticated
  USING (public.tiene_permiso('gastos.todos') OR (cargado_por = auth.uid() AND created_at > now() - interval '24 hours'));

COMMIT;

-- Verificación (con un usuario Operador):
--   SELECT count(*) FROM public.gastos;   -- solo los que cargó él
