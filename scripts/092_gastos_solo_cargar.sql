-- Gastos: un rol puede anotar gastos nuevos sin ver la lista ni los totales.
--
-- NO SE EJECUTÓ TODAVÍA. Correr a mano en el SQL Editor de Supabase, después
-- de 091_descontar_deuda_retribuciones.sql. Correrlo ANTES de publicar la app
-- que lo usa (pantalla /gastos/cargar).
--
-- Pedido de Facundo (04/11/2026): Vilela y Pato anotan los gastos que hacen,
-- pero no ven cuánto gasta Monarca. Cada gasto que anotan le llega como aviso
-- a Demian.
--
-- 1) Permiso nuevo "gastos-cargar.ver" (pantalla «Cargar gastos», lib/permisos.ts).
--    Se le da al rol desde Usuarios → Roles.
-- 2) gastos: hasta ahora cualquier usuario con sesión leía y editaba todo
--    (055). Ahora:
--    - leer: quien ve Gastos, Caja, Inicio o Aportes (las pantallas que los muestran);
--    - anotar: quien ve Gastos, quien tiene «Cargar gastos» y quien carga aportes;
--    - editar y borrar: quien ve Gastos o carga aportes.
--    Las funciones de la base (liquidar retribuciones, etc.) no cambian.
-- 3) gastos.cargado_por: quién anotó cada gasto (de acá en adelante).
-- 4) equipo.recibe_avisos_gastos: a quién le llega el aviso. Se marca a Demian.
-- 5) Aviso automático: cuando anota un gasto alguien que NO ve Gastos, les
--    llega un aviso (Equipo → Avisos) a los marcados en el punto 4.
--
-- Para deshacer: ver el bloque comentado al final.
-- Script idempotente, envuelto en una transacción.

BEGIN;

-- 1) Quién anotó cada gasto ---------------------------------------------------
ALTER TABLE public.gastos
  ADD COLUMN IF NOT EXISTS cargado_por uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL;

-- 2) Seguridad de gastos ------------------------------------------------------
DROP POLICY IF EXISTS "authenticated_all_gastos" ON public.gastos;
DROP POLICY IF EXISTS gastos_select ON public.gastos;
DROP POLICY IF EXISTS gastos_insert ON public.gastos;
DROP POLICY IF EXISTS gastos_update ON public.gastos;
DROP POLICY IF EXISTS gastos_delete ON public.gastos;

CREATE POLICY gastos_select ON public.gastos FOR SELECT TO authenticated
  USING (
    public.tiene_permiso('gastos.ver') OR public.tiene_permiso('caja.ver')
    OR public.tiene_permiso('inicio.ver') OR public.tiene_permiso('aportes.ver')
  );

CREATE POLICY gastos_insert ON public.gastos FOR INSERT TO authenticated
  WITH CHECK (
    public.tiene_permiso('gastos.ver') OR public.tiene_permiso('gastos-cargar.ver')
    OR public.tiene_permiso('aportes.editar')
  );

CREATE POLICY gastos_update ON public.gastos FOR UPDATE TO authenticated
  USING (public.tiene_permiso('gastos.ver') OR public.tiene_permiso('aportes.editar'))
  WITH CHECK (public.tiene_permiso('gastos.ver') OR public.tiene_permiso('aportes.editar'));

CREATE POLICY gastos_delete ON public.gastos FOR DELETE TO authenticated
  USING (public.tiene_permiso('gastos.ver') OR public.tiene_permiso('aportes.editar'));

-- 3) A quién le llega el aviso ------------------------------------------------
ALTER TABLE public.equipo
  ADD COLUMN IF NOT EXISTS recibe_avisos_gastos boolean NOT NULL DEFAULT false;

UPDATE public.equipo e
SET recibe_avisos_gastos = true
FROM public.perfiles p
WHERE p.user_id = e.id AND p.nombre ILIKE 'demi%';

DO $c$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.equipo WHERE recibe_avisos_gastos) THEN
    RAISE NOTICE 'No se encontró a Demian en el equipo: marcar a mano con UPDATE public.equipo SET recibe_avisos_gastos = true WHERE id = ''<user_id>'';';
  END IF;
END
$c$;

-- 4) Aviso por cada gasto anotado por alguien que no ve Gastos ---------------
ALTER TABLE public.notificaciones DROP CONSTRAINT IF EXISTS notificaciones_tipo_check;
ALTER TABLE public.notificaciones ADD CONSTRAINT notificaciones_tipo_check
  CHECK (tipo IN ('tarea_hecha', 'tarea_problema', 'tarea_nueva', 'comentario', 'riego', 'proceso', 'gasto', 'otro'));

CREATE OR REPLACE FUNCTION public.gastos_avisar_carga()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_autor uuid := auth.uid();
  v_nombre text;
BEGIN
  -- Sólo los gastos que anota alguien que no ve la pantalla Gastos (los
  -- demás ya los ve quien controla).
  IF v_autor IS NULL OR public.tiene_permiso('gastos.ver') THEN
    RETURN NULL;
  END IF;

  SELECT nombre INTO v_nombre FROM public.perfiles WHERE user_id = v_autor;

  INSERT INTO public.notificaciones (destinatario_id, autor_id, tipo, titulo, cuerpo, enlace)
  SELECT e.id,
         (SELECT q.id FROM public.equipo q WHERE q.id = v_autor),
         'gasto',
         left('Gasto nuevo: ' || public.fmt_pesos(NEW.monto) || ' · ' || NEW.descripcion, 200),
         concat_ws(' · ',
           'Anotado por ' || COALESCE(v_nombre, 'alguien del equipo'),
           NEW.categoria,
           CASE NEW.metodo_pago WHEN 'efectivo' THEN 'Efectivo' WHEN 'transferencia' THEN 'Transferencia' ELSE NEW.metodo_pago END,
           to_char(NEW.fecha, 'DD/MM/YYYY')),
         '/gastos'
  FROM public.equipo e
  JOIN public.perfiles p ON p.user_id = e.id
  WHERE e.recibe_avisos_gastos AND e.activo AND p.activo AND e.id IS DISTINCT FROM v_autor;

  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  -- Un aviso que no sale nunca puede impedir que se guarde el gasto.
  RAISE WARNING 'No se pudo avisar el gasto %: %', NEW.id, SQLERRM;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.gastos_avisar_carga() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS gastos_avisar_carga_trg ON public.gastos;
CREATE TRIGGER gastos_avisar_carga_trg
  AFTER INSERT ON public.gastos
  FOR EACH ROW EXECUTE FUNCTION public.gastos_avisar_carga();

COMMIT;

-- Para deshacer (correr a mano si hiciera falta):
--   BEGIN;
--   DROP TRIGGER IF EXISTS gastos_avisar_carga_trg ON public.gastos;
--   DROP FUNCTION IF EXISTS public.gastos_avisar_carga();
--   DROP POLICY IF EXISTS gastos_select ON public.gastos;
--   DROP POLICY IF EXISTS gastos_insert ON public.gastos;
--   DROP POLICY IF EXISTS gastos_update ON public.gastos;
--   DROP POLICY IF EXISTS gastos_delete ON public.gastos;
--   CREATE POLICY "authenticated_all_gastos" ON public.gastos
--     FOR ALL TO authenticated USING (true) WITH CHECK (true);
--   DELETE FROM public.rol_permisos WHERE permiso = 'gastos-cargar.ver';
--   COMMIT;
