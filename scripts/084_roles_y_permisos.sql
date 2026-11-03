-- Roles configurables con permisos por pantalla y acciones (lib/permisos.ts).
--
-- 1) roles: la comisión directiva (clave 'comision') es fija y tiene todos los
--    permisos; no se edita ni se borra. El resto de los roles se crean y
--    editan desde Usuarios → Roles. 'operador' queda como un rol editable con
--    los mismos permisos que tenía hasta ahora.
-- 2) rol_permisos: qué permisos tiene cada rol (claves de lib/permisos.ts).
-- 3) perfiles.rol pasa a apuntar a roles.clave (antes era un CHECK fijo).
-- 4) tiene_permiso(): reemplaza las comprobaciones "sólo comisión" de las
--    políticas y funciones por el permiso que corresponde.
--
-- Errores nuevos: RP001 el rol de la comisión no se modifica.

BEGIN;

-- =============================================================================
-- 1) Roles y permisos
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.roles (
  clave text PRIMARY KEY DEFAULT ('rol_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
  nombre text NOT NULL UNIQUE CHECK (btrim(nombre) <> ''),
  descripcion text,
  es_sistema boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.roles (clave, nombre, descripcion, es_sistema) VALUES
  ('comision', 'Comisión directiva', 'Tiene todos los permisos. No se puede editar.', true),
  ('operador', 'Operador', 'Atiende y opera el día a día.', false)
ON CONFLICT (clave) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.rol_permisos (
  rol text NOT NULL REFERENCES public.roles(clave) ON UPDATE CASCADE ON DELETE CASCADE,
  permiso text NOT NULL CHECK (permiso ~ '^[a-z-]+\.[a-z]+$'),
  PRIMARY KEY (rol, permiso)
);

-- Operador: lo mismo que podía hacer hasta ahora (todas las pantallas menos
-- Usuarios y Retribuciones, y editar entregas y stock).
INSERT INTO public.rol_permisos (rol, permiso)
SELECT 'operador', p FROM unnest(ARRAY[
  'inicio.ver', 'equipo.ver', 'entregas.ver', 'historial.ver', 'entregas.editar',
  'stock.ver', 'stock.editar', 'cosechas.ver', 'ciclos.ver', 'procesos.ver', 'cultivo.ver', 'riego.ver',
  'monitoreo.ver', 'citas.ver', 'socios.ver', 'externos.ver', 'sucursales.ver',
  'caja.ver', 'gastos.ver', 'aportes.ver', 'deudas.ver',
  'automatizaciones.ver', 'control-manual.ver', 'modo-ausente.ver'
]) AS p
ON CONFLICT DO NOTHING;

ALTER TABLE public.perfiles DROP CONSTRAINT IF EXISTS perfiles_rol_check;
ALTER TABLE public.perfiles DROP CONSTRAINT IF EXISTS perfiles_rol_fkey;
ALTER TABLE public.perfiles
  ADD CONSTRAINT perfiles_rol_fkey FOREIGN KEY (rol) REFERENCES public.roles(clave) ON UPDATE CASCADE ON DELETE RESTRICT;

-- =============================================================================
-- 2) tiene_permiso()
-- =============================================================================

CREATE OR REPLACE FUNCTION public.tiene_permiso(p_permiso text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(public.rol_actual() = 'comision', false)
      OR EXISTS (
        SELECT 1 FROM public.rol_permisos
        WHERE rol = public.rol_actual() AND permiso = p_permiso
      );
$$;

REVOKE ALL ON FUNCTION public.tiene_permiso(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tiene_permiso(text) TO authenticated;

-- =============================================================================
-- 3) Seguridad de roles y permisos
-- =============================================================================

ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rol_permisos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS roles_select ON public.roles;
CREATE POLICY roles_select ON public.roles FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS roles_administrar ON public.roles;
CREATE POLICY roles_administrar ON public.roles FOR ALL TO authenticated
  USING (public.tiene_permiso('usuarios.administrar')) WITH CHECK (public.tiene_permiso('usuarios.administrar'));

DROP POLICY IF EXISTS rol_permisos_select ON public.rol_permisos;
CREATE POLICY rol_permisos_select ON public.rol_permisos FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS rol_permisos_administrar ON public.rol_permisos;
CREATE POLICY rol_permisos_administrar ON public.rol_permisos FOR ALL TO authenticated
  USING (public.tiene_permiso('usuarios.administrar')) WITH CHECK (public.tiene_permiso('usuarios.administrar'));

REVOKE ALL ON public.roles, public.rol_permisos FROM anon;

-- El rol de la comisión no se toca: tiene todos los permisos sin filas.
CREATE OR REPLACE FUNCTION public.proteger_rol_sistema()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_TABLE_NAME = 'roles' THEN
    IF OLD.es_sistema THEN
      RAISE EXCEPTION 'El rol de la comisión directiva no se puede modificar' USING ERRCODE = 'RP001';
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.es_sistema THEN
      RAISE EXCEPTION 'No se puede marcar un rol como de sistema' USING ERRCODE = 'RP001';
    END IF;
  ELSIF COALESCE(NEW.rol, OLD.rol) = 'comision' THEN
    RAISE EXCEPTION 'El rol de la comisión directiva ya tiene todos los permisos' USING ERRCODE = 'RP001';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS roles_proteger_sistema ON public.roles;
CREATE TRIGGER roles_proteger_sistema BEFORE UPDATE OR DELETE ON public.roles
  FOR EACH ROW EXECUTE FUNCTION public.proteger_rol_sistema();
DROP TRIGGER IF EXISTS rol_permisos_proteger_sistema ON public.rol_permisos;
CREATE TRIGGER rol_permisos_proteger_sistema BEFORE INSERT OR UPDATE OR DELETE ON public.rol_permisos
  FOR EACH ROW EXECUTE FUNCTION public.proteger_rol_sistema();

-- =============================================================================
-- 4) "Sólo comisión" pasa a ser un permiso
-- =============================================================================

DROP POLICY IF EXISTS aportes_capital_comision ON public.aportes_capital;
CREATE POLICY aportes_capital_editar ON public.aportes_capital FOR ALL TO authenticated
  USING (public.tiene_permiso('aportes.editar')) WITH CHECK (public.tiene_permiso('aportes.editar'));

DROP POLICY IF EXISTS cierres_cosecha_borrar ON public.cierres_cosecha;
CREATE POLICY cierres_cosecha_borrar ON public.cierres_cosecha FOR DELETE TO authenticated
  USING (public.tiene_permiso('cosechas.borrar'));

DROP POLICY IF EXISTS comision_update_config_entregas ON public.config_entregas;
CREATE POLICY reglas_update_config_entregas ON public.config_entregas FOR UPDATE TO authenticated
  USING (public.tiene_permiso('reglas.editar')) WITH CHECK (public.tiene_permiso('reglas.editar'));

DROP POLICY IF EXISTS categorias_gasto_comision ON public.categorias_gasto;
CREATE POLICY categorias_gasto_editar ON public.categorias_gasto FOR ALL TO authenticated
  USING (public.tiene_permiso('gastos.categorias')) WITH CHECK (public.tiene_permiso('gastos.categorias'));

DROP POLICY IF EXISTS liquidaciones_equipo_select ON public.liquidaciones_equipo;
CREATE POLICY liquidaciones_equipo_select ON public.liquidaciones_equipo FOR SELECT TO authenticated
  USING (public.tiene_permiso('retribuciones.ver'));

DROP POLICY IF EXISTS retribuciones_equipo_comision ON public.retribuciones_equipo;
CREATE POLICY retribuciones_equipo_select ON public.retribuciones_equipo FOR SELECT TO authenticated
  USING (public.tiene_permiso('retribuciones.ver'));
CREATE POLICY retribuciones_equipo_editar ON public.retribuciones_equipo FOR ALL TO authenticated
  USING (public.tiene_permiso('retribuciones.liquidar')) WITH CHECK (public.tiene_permiso('retribuciones.liquidar'));

DO $m$
DECLARE
  v_def text;
BEGIN
  -- Autorizar excepciones a las reglas de entrega (066).
  v_def := pg_get_functiondef('public.crear_autorizacion_entrega(uuid, text)'::regprocedure);
  IF position('v_perfil.rol <> ''comision''' IN v_def) = 0 THEN
    RAISE EXCEPTION 'crear_autorizacion_entrega no tiene la comprobación esperada';
  END IF;
  v_def := replace(v_def, 'v_perfil.rol <> ''comision''', 'NOT public.tiene_permiso(''entregas.autorizar'')');
  v_def := regexp_replace(v_def, '''Sólo un usuario de la comisión[^'']*''', '''Tu usuario no tiene permiso para autorizar excepciones''');
  EXECUTE v_def;

  -- Liquidar y anular retribuciones (072).
  v_def := pg_get_functiondef('public.liquidar_retribucion(uuid, date, date, numeric, text, uuid, numeric, integer, numeric, text)'::regprocedure);
  v_def := replace(v_def, 'public.rol_actual() IS DISTINCT FROM ''comision''', 'NOT public.tiene_permiso(''retribuciones.liquidar'')');
  v_def := replace(v_def, 'Sólo la comisión directiva liquida retribuciones', 'Tu usuario no tiene permiso para liquidar retribuciones');
  IF position('tiene_permiso' IN v_def) = 0 THEN
    RAISE EXCEPTION 'liquidar_retribucion no tiene la comprobación esperada';
  END IF;
  EXECUTE v_def;

  v_def := pg_get_functiondef('public.anular_liquidacion(uuid)'::regprocedure);
  v_def := replace(v_def, 'public.rol_actual() IS DISTINCT FROM ''comision''', 'NOT public.tiene_permiso(''retribuciones.liquidar'')');
  v_def := replace(v_def, 'Sólo la comisión directiva anula liquidaciones', 'Tu usuario no tiene permiso para anular liquidaciones');
  IF position('tiene_permiso' IN v_def) = 0 THEN
    RAISE EXCEPTION 'anular_liquidacion no tiene la comprobación esperada';
  END IF;
  EXECUTE v_def;
END
$m$;

COMMIT;
