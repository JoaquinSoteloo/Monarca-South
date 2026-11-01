-- Fase A — Reglas de entrega, externos y usuarios con rol.
--
-- Pedido de la comisión directiva (29/10/2026):
--   1. Límite mensual: cuentan sólo los GRAMOS SUELTOS. Un socio (REPROCANN
--      Activo o Pendiente) que se pasa de su límite no puede llevar más
--      gramos sueltos; enrolados sí.
--   2. Externos: personas que no son socias pero se cargan en el sistema
--      (socios.tipo = 'externo'). Máximo de entregas por mes (3, configurable).
--      Reemplazan al registro genérico "No socios", que se conserva con su
--      historial pero ya no admite entregas nuevas (socios.es_generico).
--   3. No se entrega a quien tiene un aporte pendiente de más de N días (30).
--   4. No se deja pendiente si la deuda total del socio pasaría el tope de
--      fiado ($120.000, configurable).
--   5. Una excepción a 1–4 sólo la autoriza un usuario de la comisión, y queda
--      registrada con su nombre y el motivo.
--
-- Diseño: registrar_venta (062) y editar_venta (065) NO se reescriben. Se
-- agregan registrar_entrega/editar_entrega, que llaman a esas funciones y
-- después validan las reglas sobre lo que quedó escrito. Si una regla no se
-- cumple y no hay autorización válida, la excepción revierte TODO lo que hizo
-- la llamada (una llamada RPC = una transacción). Así la lógica de precios,
-- stock y pagos sigue en un solo lugar.
--
-- registrar_venta/editar_venta dejan de poder llamarse directamente desde la
-- app en 067 (a correr DESPUÉS de publicar el frontend nuevo), para que nadie
-- se saltee las reglas. OJO: si en el futuro se re-corre 062 o 065, vuelven
-- a otorgar EXECUTE a authenticated; después de eso hay que re-correr 067.
--
-- Autorizaciones: un usuario de la comisión crea una autorización de un solo
-- uso, atada al socio y con vencimiento (crear_autorizacion_entrega). La
-- entrega la consume pasando su id. La tabla no tiene policies de escritura:
-- sólo se escribe desde estas funciones SECURITY DEFINER, que verifican el
-- rol con auth.uid() — un operador no puede fabricarse una autorización.
--
-- Errores (SQLSTATE propios, mensaje pensado para mostrarse tal cual):
--   VB001 — una o más reglas no se cumplen. MESSAGE: motivos separados por
--           " · ". DETAIL: códigos separados por coma (limite_mensual,
--           max_entregas_externo, deuda_vencida, tope_deuda).
--   VB002 — el registro genérico ya no admite entregas nuevas (sin excepción).
--   VB003 — la autorización no existe, ya se usó, venció o es de otro socio.
--   VB004 — quien autoriza no es de la comisión.
--   VB005 — falta el motivo de la excepción.
--
-- Script idempotente. Envuelto en BEGIN/COMMIT. Requiere 062 y 065 ya
-- aplicados. Pruebas y rollback al final del archivo.

BEGIN;

-- =============================================================================
-- 1) Socios: externos y registro genérico
-- =============================================================================

ALTER TABLE public.socios ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'socio';
ALTER TABLE public.socios ADD COLUMN IF NOT EXISTS es_generico boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'socios_tipo_check') THEN
    ALTER TABLE public.socios ADD CONSTRAINT socios_tipo_check CHECK (tipo IN ('socio', 'externo'));
  END IF;
END $$;

-- "No, socios" en pantalla = apellido "No", nombre "socios".
UPDATE public.socios
SET es_generico = true
WHERE lower(trim(apellido)) = 'no' AND lower(trim(nombre)) = 'socios';

-- =============================================================================
-- 2) Perfiles de usuario (rol por persona)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.perfiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  rol text NOT NULL DEFAULT 'operador' CHECK (rol IN ('operador', 'comision')),
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.perfiles ENABLE ROW LEVEL SECURITY;

-- Lectura para cualquier usuario logueado (nombres en pantalla). Sin policies
-- de escritura: altas y cambios sólo desde /api/usuarios con service_role.
DROP POLICY IF EXISTS "authenticated_select_perfiles" ON public.perfiles;
CREATE POLICY "authenticated_select_perfiles" ON public.perfiles
  FOR SELECT TO authenticated USING (true);

-- La cuenta compartida que existía hasta hoy queda como comisión, para que
-- alguien pueda dar de alta al resto desde la pantalla Usuarios.
INSERT INTO public.perfiles (user_id, nombre, rol)
SELECT id, COALESCE(email, 'admin'), 'comision' FROM auth.users
ON CONFLICT (user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.rol_actual()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT rol FROM public.perfiles WHERE user_id = auth.uid() AND activo
$$;

REVOKE ALL ON FUNCTION public.rol_actual() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rol_actual() TO authenticated;

-- =============================================================================
-- 3) Configuración de las reglas (una sola fila)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.config_entregas (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  tope_deuda numeric(12, 2) NOT NULL DEFAULT 120000 CHECK (tope_deuda >= 0),
  dias_max_pendiente integer NOT NULL DEFAULT 30 CHECK (dias_max_pendiente > 0),
  max_entregas_externo_mes integer NOT NULL DEFAULT 3 CHECK (max_entregas_externo_mes > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

INSERT INTO public.config_entregas (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.config_entregas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_select_config_entregas" ON public.config_entregas;
CREATE POLICY "authenticated_select_config_entregas" ON public.config_entregas
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "comision_update_config_entregas" ON public.config_entregas;
CREATE POLICY "comision_update_config_entregas" ON public.config_entregas
  FOR UPDATE TO authenticated
  USING (public.rol_actual() = 'comision')
  WITH CHECK (public.rol_actual() = 'comision');

-- =============================================================================
-- 4) Autorizaciones de excepción
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.autorizaciones_entrega (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  socio_id uuid NOT NULL REFERENCES public.socios(id),
  motivo text NOT NULL,
  autorizado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  autorizado_por_nombre text NOT NULL,
  creada_en timestamptz NOT NULL DEFAULT now(),
  vence_en timestamptz NOT NULL,
  -- Se completan al usarla. venta_id queda NULL si después se elimina la
  -- entrega: el registro de la excepción se conserva igual.
  venta_id uuid REFERENCES public.ventas(id) ON DELETE SET NULL,
  reglas text[],
  usada_en timestamptz,
  usada_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  usada_por_nombre text
);

CREATE INDEX IF NOT EXISTS idx_autorizaciones_entrega_venta ON public.autorizaciones_entrega(venta_id);

ALTER TABLE public.autorizaciones_entrega ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_select_autorizaciones_entrega" ON public.autorizaciones_entrega;
CREATE POLICY "authenticated_select_autorizaciones_entrega" ON public.autorizaciones_entrega
  FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.crear_autorizacion_entrega(p_socio_id uuid, p_motivo text)
RETURNS public.autorizaciones_entrega
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_perfil public.perfiles%ROWTYPE;
  v_aut public.autorizaciones_entrega%ROWTYPE;
BEGIN
  SELECT * INTO v_perfil FROM public.perfiles WHERE user_id = auth.uid() AND activo;
  IF NOT FOUND OR v_perfil.rol <> 'comision' THEN
    RAISE EXCEPTION 'Sólo un usuario de la comisión directiva puede autorizar excepciones' USING ERRCODE = 'VB004';
  END IF;

  IF p_motivo IS NULL OR length(trim(p_motivo)) < 3 THEN
    RAISE EXCEPTION 'Escribí el motivo de la excepción' USING ERRCODE = 'VB005';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.socios WHERE id = p_socio_id) THEN
    RAISE EXCEPTION 'El socio indicado no existe' USING ERRCODE = 'VB003';
  END IF;

  INSERT INTO public.autorizaciones_entrega (socio_id, motivo, autorizado_por, autorizado_por_nombre, vence_en)
  VALUES (p_socio_id, trim(p_motivo), auth.uid(), v_perfil.nombre, now() + interval '15 minutes')
  RETURNING * INTO v_aut;

  RETURN v_aut;
END;
$$;

REVOKE ALL ON FUNCTION public.crear_autorizacion_entrega(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crear_autorizacion_entrega(uuid, text) TO authenticated;

-- =============================================================================
-- 5) Helpers internos (no expuestos a la app)
-- =============================================================================

-- Gramos sueltos de una entrega: líneas de genética de detalle_venta (sin el
-- peso de los enrolados). Una venta legacy sin detalle_venta cuenta
-- ventas.gramos completo, como hasta ahora.
CREATE OR REPLACE FUNCTION public.gramos_sueltos_venta(p_venta_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM public.detalle_venta d WHERE d.venta_id = v.id) THEN
      COALESCE((SELECT sum(d.gramos) FROM public.detalle_venta d WHERE d.venta_id = v.id AND d.genetica_id IS NOT NULL), 0)
    ELSE COALESCE(v.gramos, 0)
  END
  FROM public.ventas v
  WHERE v.id = p_venta_id
$$;

-- Inicio del mes calendario argentino que contiene p_ts.
CREATE OR REPLACE FUNCTION public.inicio_mes_argentina(p_ts timestamptz)
RETURNS timestamptz
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT date_trunc('month', p_ts AT TIME ZONE 'America/Argentina/Buenos_Aires') AT TIME ZONE 'America/Argentina/Buenos_Aires'
$$;

CREATE OR REPLACE FUNCTION public.fmt_gramos(p numeric)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT replace(regexp_replace(round(p, 1)::text, '\.0$', ''), '.', ',') || ' g'
$$;

CREATE OR REPLACE FUNCTION public.fmt_pesos(p numeric)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT '$' || translate(to_char(round(p, 2), 'FM999,999,999,990.00'), ',.', '.,')
$$;

-- Reglas que la entrega p_venta_id (ya escrita) no cumple. Para una edición,
-- se compara contra el estado anterior: sólo frena lo que la edición agrega
-- (más gramos sueltos, más saldo pendiente, cambio de socio o de mes).
CREATE OR REPLACE FUNCTION public.reglas_entrega_incumplidas(
  p_venta_id uuid,
  p_es_edicion boolean,
  p_socio_antes uuid,
  p_fecha_antes timestamptz,
  p_sueltos_antes numeric,
  p_saldo_antes numeric
)
RETURNS TABLE (codigo text, mensaje text)
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  v_venta public.ventas%ROWTYPE;
  v_socio public.socios%ROWTYPE;
  v_cfg public.config_entregas%ROWTYPE;
  v_inicio timestamptz;
  v_fin timestamptz;
  v_mismo_socio boolean;
  v_mismo_mes boolean;
  v_sueltos numeric;
  v_consumo numeric;
  v_cantidad integer;
  v_mas_vieja timestamptz;
  v_deuda numeric;
  v_sueltos_previos numeric;
  v_saldo_previo numeric;
BEGIN
  SELECT * INTO v_venta FROM public.ventas WHERE id = p_venta_id;
  SELECT * INTO v_socio FROM public.socios WHERE id = v_venta.socio_id;
  SELECT * INTO v_cfg FROM public.config_entregas WHERE id;

  v_inicio := public.inicio_mes_argentina(v_venta.created_at);
  v_fin := (date_trunc('month', v_venta.created_at AT TIME ZONE 'America/Argentina/Buenos_Aires') + interval '1 month')
    AT TIME ZONE 'America/Argentina/Buenos_Aires';
  v_mismo_socio := p_es_edicion AND p_socio_antes = v_venta.socio_id;
  v_mismo_mes := p_es_edicion AND public.inicio_mes_argentina(p_fecha_antes) = v_inicio;
  v_sueltos := public.gramos_sueltos_venta(p_venta_id);
  -- Lo que ya había antes de la edición y cuenta para el mismo socio/mes.
  -- (Calculado acá y no con CASE dentro del IF: PL/pgSQL corta la condición
  -- en el primer THEN que encuentra.)
  v_sueltos_previos := 0;
  IF v_mismo_socio AND v_mismo_mes THEN
    v_sueltos_previos := p_sueltos_antes;
  END IF;
  v_saldo_previo := 0;
  IF v_mismo_socio THEN
    v_saldo_previo := p_saldo_antes;
  END IF;

  -- 1) Límite mensual de gramos sueltos (sólo socios con límite cargado).
  IF v_socio.tipo = 'socio' AND v_socio.gramos_mensuales IS NOT NULL AND v_sueltos > v_sueltos_previos THEN
    SELECT COALESCE(sum(public.gramos_sueltos_venta(v.id)), 0) INTO v_consumo
    FROM public.ventas v
    WHERE v.socio_id = v_socio.id AND v.created_at >= v_inicio AND v.created_at < v_fin;

    IF v_consumo > v_socio.gramos_mensuales THEN
      codigo := 'limite_mensual';
      mensaje := format(
        'Supera su límite mensual: con esta entrega lleva %s sueltos de %s. Puede llevar enrolados.',
        public.fmt_gramos(v_consumo), public.fmt_gramos(v_socio.gramos_mensuales)
      );
      RETURN NEXT;
    END IF;
  END IF;

  -- 2) Máximo de entregas por mes para externos.
  IF v_socio.tipo = 'externo' AND NOT (v_mismo_socio AND v_mismo_mes) THEN
    SELECT count(*) INTO v_cantidad
    FROM public.ventas v
    WHERE v.socio_id = v_socio.id AND v.created_at >= v_inicio AND v.created_at < v_fin;

    IF v_cantidad > v_cfg.max_entregas_externo_mes THEN
      codigo := 'max_entregas_externo';
      mensaje := format(
        'Ya tiene %s entregas este mes (máximo %s para externos).',
        v_cantidad - 1, v_cfg.max_entregas_externo_mes
      );
      RETURN NEXT;
    END IF;
  END IF;

  -- 3) Aporte pendiente más viejo que el máximo de días.
  IF NOT v_mismo_socio THEN
    SELECT min(v.created_at) INTO v_mas_vieja
    FROM public.ventas v
    WHERE v.socio_id = v_socio.id
      AND v.id <> p_venta_id
      AND v.saldo_pendiente > 0
      AND v.created_at < v_venta.created_at - make_interval(days => v_cfg.dias_max_pendiente);

    IF v_mas_vieja IS NOT NULL THEN
      codigo := 'deuda_vencida';
      mensaje := format(
        'Tiene un aporte pendiente de más de %s días (del %s).',
        v_cfg.dias_max_pendiente,
        to_char(v_mas_vieja AT TIME ZONE 'America/Argentina/Buenos_Aires', 'DD/MM/YYYY')
      );
      RETURN NEXT;
    END IF;
  END IF;

  -- 4) Tope de deuda total, sólo si esta entrega suma saldo pendiente.
  IF v_venta.saldo_pendiente > v_saldo_previo THEN
    SELECT COALESCE(sum(v.saldo_pendiente), 0) INTO v_deuda
    FROM public.ventas v
    WHERE v.socio_id = v_socio.id AND v.saldo_pendiente > 0;

    IF v_deuda > v_cfg.tope_deuda THEN
      codigo := 'tope_deuda';
      mensaje := format(
        'Su deuda total quedaría en %s, por encima del tope de %s.',
        public.fmt_pesos(v_deuda), public.fmt_pesos(v_cfg.tope_deuda)
      );
      RETURN NEXT;
    END IF;
  END IF;
END;
$$;

-- Aplica el resultado de reglas_entrega_incumplidas: si hay reglas sin
-- cumplir, exige una autorización válida y la consume; si no, frena (VB001).
CREATE OR REPLACE FUNCTION public.aplicar_reglas_entrega(
  p_venta_id uuid,
  p_es_edicion boolean,
  p_socio_antes uuid,
  p_fecha_antes timestamptz,
  p_sueltos_antes numeric,
  p_saldo_antes numeric,
  p_autorizacion_id uuid
)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_codigos text[];
  v_mensajes text;
  v_socio_id uuid;
  v_aut public.autorizaciones_entrega%ROWTYPE;
BEGIN
  SELECT array_agg(r.codigo), string_agg(r.mensaje, ' · ')
  INTO v_codigos, v_mensajes
  FROM public.reglas_entrega_incumplidas(
    p_venta_id, p_es_edicion, p_socio_antes, p_fecha_antes, p_sueltos_antes, p_saldo_antes
  ) r;

  IF v_codigos IS NULL THEN
    RETURN; -- todo en regla; una autorización enviada de más no se consume
  END IF;

  IF p_autorizacion_id IS NULL THEN
    RAISE EXCEPTION '%', v_mensajes USING ERRCODE = 'VB001', DETAIL = array_to_string(v_codigos, ',');
  END IF;

  SELECT socio_id INTO v_socio_id FROM public.ventas WHERE id = p_venta_id;

  SELECT * INTO v_aut FROM public.autorizaciones_entrega WHERE id = p_autorizacion_id FOR UPDATE;
  IF NOT FOUND OR v_aut.usada_en IS NOT NULL OR v_aut.vence_en < now() OR v_aut.socio_id <> v_socio_id THEN
    RAISE EXCEPTION 'La autorización no es válida o ya venció. Pedí una nueva.' USING ERRCODE = 'VB003';
  END IF;

  UPDATE public.autorizaciones_entrega
  SET venta_id = p_venta_id,
      reglas = v_codigos,
      usada_en = now(),
      usada_por = auth.uid(),
      usada_por_nombre = (SELECT nombre FROM public.perfiles WHERE user_id = auth.uid())
  WHERE id = p_autorizacion_id;
END;
$$;

REVOKE ALL ON FUNCTION public.gramos_sueltos_venta(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.inicio_mes_argentina(timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fmt_gramos(numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fmt_pesos(numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reglas_entrega_incumplidas(uuid, boolean, uuid, timestamptz, numeric, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.aplicar_reglas_entrega(uuid, boolean, uuid, timestamptz, numeric, numeric, uuid) FROM PUBLIC, anon, authenticated;

-- =============================================================================
-- 6) Puntos de entrada de la app
-- =============================================================================

CREATE OR REPLACE FUNCTION public.registrar_entrega(
  p_socio_id uuid,
  p_lineas jsonb,
  p_pago_efectivo numeric,
  p_pago_transferencia numeric,
  p_notas text,
  p_fecha timestamptz,
  p_autorizacion_id uuid DEFAULT NULL
)
RETURNS SETOF public.ventas
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_venta public.ventas%ROWTYPE;
BEGIN
  IF EXISTS (SELECT 1 FROM public.socios WHERE id = p_socio_id AND es_generico) THEN
    RAISE EXCEPTION 'Este registro genérico ya no admite entregas nuevas. Cargá a la persona en Externos.'
      USING ERRCODE = 'VB002';
  END IF;

  SELECT * INTO v_venta
  FROM public.registrar_venta(p_socio_id, p_lineas, p_pago_efectivo, p_pago_transferencia, p_notas, p_fecha);

  PERFORM public.aplicar_reglas_entrega(v_venta.id, false, NULL, NULL, 0, 0, p_autorizacion_id);

  RETURN QUERY SELECT * FROM public.ventas WHERE id = v_venta.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.editar_entrega(
  p_venta_id uuid,
  p_socio_id uuid,
  p_lineas jsonb,
  p_notas text,
  p_fecha timestamptz,
  p_autorizacion_id uuid DEFAULT NULL
)
RETURNS SETOF public.ventas
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_antes public.ventas%ROWTYPE;
  v_sueltos_antes numeric;
BEGIN
  SELECT * INTO v_antes FROM public.ventas WHERE id = p_venta_id;
  v_sueltos_antes := COALESCE(public.gramos_sueltos_venta(p_venta_id), 0);

  IF p_socio_id IS DISTINCT FROM v_antes.socio_id
     AND EXISTS (SELECT 1 FROM public.socios WHERE id = p_socio_id AND es_generico) THEN
    RAISE EXCEPTION 'Este registro genérico ya no admite entregas nuevas. Cargá a la persona en Externos.'
      USING ERRCODE = 'VB002';
  END IF;

  -- editar_venta valida que la entrega exista (VE001) y bloquea la fila.
  PERFORM 1 FROM public.editar_venta(p_venta_id, p_socio_id, p_lineas, p_notas, p_fecha);

  PERFORM public.aplicar_reglas_entrega(
    p_venta_id, true, v_antes.socio_id, v_antes.created_at, v_sueltos_antes,
    COALESCE(v_antes.saldo_pendiente, 0), p_autorizacion_id
  );

  RETURN QUERY SELECT * FROM public.ventas WHERE id = p_venta_id;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_entrega(uuid, jsonb, numeric, numeric, text, timestamptz, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_entrega(uuid, jsonb, numeric, numeric, text, timestamptz, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.editar_entrega(uuid, uuid, jsonb, text, timestamptz, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.editar_entrega(uuid, uuid, jsonb, text, timestamptz, uuid) TO authenticated;

-- El acceso directo a registrar_venta/editar_venta se cierra en 067, recién
-- después de publicar el frontend que usa registrar_entrega/editar_entrega:
-- hasta entonces la app publicada sigue llamando a las funciones viejas.

COMMIT;

-- =============================================================================
-- VERIFICACIÓN DESPUÉS DE CORRER
-- =============================================================================
--
-- a) El registro genérico quedó marcado (debería devolver 1 fila, "No socios"):
--      SELECT id, apellido, nombre FROM public.socios WHERE es_generico;
--
-- b) La cuenta existente quedó como comisión:
--      SELECT p.nombre, p.rol FROM public.perfiles p;
--
-- =============================================================================
-- PRUEBAS MANUALES (dentro de BEGIN; ... ROLLBACK;, logueado como postgres)
-- =============================================================================
--
-- Simular un usuario: SELECT set_config('request.jwt.claims', '{"sub":"<user_id>"}', true);
--
-- 1) Socio pasado del límite + gramos sueltos -> VB001 limite_mensual.
--    El mismo socio con sólo enrolados -> se registra.
-- 2) Externo con 3 entregas en el mes -> la 4ª da VB001 max_entregas_externo.
-- 3) Socio con un pendiente de hace 31 días -> VB001 deuda_vencida.
-- 4) Entrega que deja la deuda total por encima del tope -> VB001 tope_deuda;
--    la misma entrega pagada completa -> se registra.
-- 5) Con un usuario comisión: SELECT id FROM public.crear_autorizacion_entrega('<socio>', 'motivo');
--    y repetir 1) pasando ese id -> se registra y la autorización queda usada.
--    Reusar el mismo id -> VB003.
-- 6) Con un usuario operador: crear_autorizacion_entrega -> VB004.
-- 7) Entrega a "No socios" -> VB002.
--
-- =============================================================================
-- ROLLBACK
-- =============================================================================
--
--   BEGIN;
--   DROP FUNCTION IF EXISTS public.registrar_entrega(uuid, jsonb, numeric, numeric, text, timestamptz, uuid);
--   DROP FUNCTION IF EXISTS public.editar_entrega(uuid, uuid, jsonb, text, timestamptz, uuid);
--   DROP FUNCTION IF EXISTS public.aplicar_reglas_entrega(uuid, boolean, uuid, timestamptz, numeric, numeric, uuid);
--   DROP FUNCTION IF EXISTS public.reglas_entrega_incumplidas(uuid, boolean, uuid, timestamptz, numeric, numeric);
--   DROP FUNCTION IF EXISTS public.crear_autorizacion_entrega(uuid, text);
--   DROP FUNCTION IF EXISTS public.gramos_sueltos_venta(uuid);
--   DROP FUNCTION IF EXISTS public.inicio_mes_argentina(timestamptz);
--   DROP FUNCTION IF EXISTS public.fmt_gramos(numeric);
--   DROP FUNCTION IF EXISTS public.fmt_pesos(numeric);
--   GRANT EXECUTE ON FUNCTION public.registrar_venta(uuid, jsonb, numeric, numeric, text, timestamptz) TO authenticated;
--   GRANT EXECUTE ON FUNCTION public.editar_venta(uuid, uuid, jsonb, text, timestamptz) TO authenticated;
--   COMMIT;
--
-- Las tablas nuevas (perfiles, config_entregas, autorizaciones_entrega) y las
-- columnas socios.tipo / socios.es_generico se pueden dejar: no molestan al
-- código anterior. Revertir también el frontend de este commit.
