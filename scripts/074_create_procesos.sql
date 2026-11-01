-- Procedimientos paso a paso con formularios (riego, cosecha, esquejes, sanidad).
--
-- NO SE EJECUTÓ TODAVÍA. Correr después de 073_seed_ciclos_actuales.sql.
--
-- Pedido de Facundo (31/10/2026): que cada procedimiento sea una cadena de
-- pasos entre personas. Ejemplo del riego:
--   1. Vilela: "Tanques listos"            → le llega el aviso a Lucho.
--   2. Lucho:  "Preparar la mezcla"        → carga EC, pH y qué le puso.
--   3. Lucho:  "Regar y medir runoff" (una por sala) → carga las macetas
--      testigo y el EC/pH/drenaje de cada una. Se guarda solo en Riego.
-- Lo mismo con la cosecha (Demian pesa y carga) y el resto de los
-- procedimientos de los manuales.
--
-- Cómo funciona:
--   - procesos_plantilla + procesos_pasos_plantilla: la receta de cada
--     procedimiento. Cada paso tiene responsable (por nombre de perfil) y sus
--     campos (JSON). Se pueden editar después sin tocar código.
--   - procesos + procesos_pasos: cada vez que alguien inicia uno. Los pasos con
--     el mismo `orden` van en paralelo (ej.: regar cada sala).
--   - Cada paso activo se convierte en una tarea del responsable (pantalla
--     Equipo). Se completa llenando el formulario: completar_paso() guarda los
--     valores, marca la tarea, activa el paso siguiente y le avisa al que sigue.
--
-- Script idempotente, envuelto en una transacción.

BEGIN;

-- 1. Recetas ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.procesos_plantilla (
  clave VARCHAR(30) PRIMARY KEY,
  nombre VARCHAR(80) NOT NULL,
  descripcion TEXT,
  usa_salas BOOLEAN NOT NULL DEFAULT true,
  orden SMALLINT NOT NULL DEFAULT 100,
  activo BOOLEAN NOT NULL DEFAULT true
);

-- Campos (JSON, lista): {clave, etiqueta, tipo, requerido, unidad, min, max,
-- opciones, recordar, ayuda}. Tipos: numero, texto, texto_largo, si_no,
-- opciones, testigos (lista de macetas testigo con EC, pH y % de drenaje).
CREATE TABLE IF NOT EXISTS public.procesos_pasos_plantilla (
  id BIGSERIAL PRIMARY KEY,
  proceso_clave VARCHAR(30) NOT NULL REFERENCES public.procesos_plantilla(clave) ON DELETE CASCADE,
  clave VARCHAR(30) NOT NULL,
  orden SMALLINT NOT NULL,
  titulo VARCHAR(120) NOT NULL,
  detalle TEXT,
  responsable_nombre VARCHAR(40),
  por_sala BOOLEAN NOT NULL DEFAULT false,
  campos JSONB NOT NULL DEFAULT '[]',
  -- Quiénes reciben también el aviso (ej.: Lucho supervisa la prevención de Demian).
  afecta_nombres TEXT[] NOT NULL DEFAULT '{}',
  UNIQUE (proceso_clave, clave)
);
ALTER TABLE public.procesos_pasos_plantilla ADD COLUMN IF NOT EXISTS afecta_nombres TEXT[] NOT NULL DEFAULT '{}';

-- 2. Procedimientos en curso ----------------------------------------------
CREATE TABLE IF NOT EXISTS public.procesos (
  id BIGSERIAL PRIMARY KEY,
  plantilla_clave VARCHAR(30) NOT NULL REFERENCES public.procesos_plantilla(clave),
  titulo VARCHAR(160) NOT NULL,
  salas INTEGER[] NOT NULL DEFAULT '{}',
  fecha DATE NOT NULL DEFAULT (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date,
  estado VARCHAR(12) NOT NULL DEFAULT 'en_curso' CHECK (estado IN ('en_curso', 'terminado', 'cancelado')),
  nota TEXT,
  iniciado_por UUID REFERENCES public.equipo(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  terminado_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS procesos_estado_idx ON public.procesos (estado, created_at DESC);

CREATE TABLE IF NOT EXISTS public.procesos_pasos (
  id BIGSERIAL PRIMARY KEY,
  proceso_id BIGINT NOT NULL REFERENCES public.procesos(id) ON DELETE CASCADE,
  clave VARCHAR(30) NOT NULL,
  orden SMALLINT NOT NULL,
  titulo VARCHAR(160) NOT NULL,
  detalle TEXT,
  sala_id INTEGER REFERENCES public.salas_cultivo(id) ON DELETE SET NULL,
  responsable_id UUID REFERENCES public.equipo(id) ON DELETE SET NULL,
  campos JSONB NOT NULL DEFAULT '[]',
  valores JSONB NOT NULL DEFAULT '{}',
  estado VARCHAR(10) NOT NULL DEFAULT 'espera' CHECK (estado IN ('espera', 'pendiente', 'hecho', 'problema')),
  nota TEXT,
  hecho_por UUID REFERENCES public.equipo(id) ON DELETE SET NULL,
  hecho_at TIMESTAMPTZ,
  tarea_id BIGINT REFERENCES public.tareas(id) ON DELETE SET NULL,
  afecta_a UUID[] NOT NULL DEFAULT '{}'
);
ALTER TABLE public.procesos_pasos ADD COLUMN IF NOT EXISTS afecta_a UUID[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS procesos_pasos_proceso_idx ON public.procesos_pasos (proceso_id, orden);

ALTER TABLE public.tareas
  ADD COLUMN IF NOT EXISTS proceso_paso_id BIGINT REFERENCES public.procesos_pasos(id) ON DELETE SET NULL;

-- Macetas testigo de cada tanda (las elige Lucho en el primer riego y quedan
-- sugeridas para los siguientes).
ALTER TABLE public.ciclos_sala
  ADD COLUMN IF NOT EXISTS testigos TEXT[] NOT NULL DEFAULT '{}';

-- Avisos de procedimientos
ALTER TABLE public.notificaciones DROP CONSTRAINT IF EXISTS notificaciones_tipo_check;
ALTER TABLE public.notificaciones ADD CONSTRAINT notificaciones_tipo_check
  CHECK (tipo IN ('tarea_hecha', 'tarea_problema', 'tarea_nueva', 'comentario', 'riego', 'proceso', 'otro'));

-- 3. Activar un grupo de pasos: tarea para cada responsable + aviso ---------
CREATE OR REPLACE FUNCTION public.procesos_activar_orden(p_proceso BIGINT, p_orden SMALLINT, p_actor UUID, p_previo TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ps procesos_pasos%ROWTYPE;
  nueva BIGINT;
  hoy DATE := (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
  nombre_actor TEXT;
BEGIN
  SELECT nombre INTO nombre_actor FROM equipo_perfiles WHERE id = p_actor;
  FOR ps IN SELECT * FROM procesos_pasos WHERE proceso_id = p_proceso AND orden = p_orden AND estado = 'espera' ORDER BY id LOOP
    INSERT INTO tareas (fecha, titulo, detalle, responsable_id, proceso_paso_id, orden, afecta_a)
    VALUES (hoy, left(ps.titulo, 160), ps.detalle, ps.responsable_id, ps.id, 5, ps.afecta_a)
    RETURNING id INTO nueva;
    UPDATE procesos_pasos SET estado = 'pendiente', tarea_id = nueva WHERE id = ps.id;
    PERFORM notificar_destinatarios(
      ARRAY[ps.responsable_id], p_actor, 'proceso',
      CASE WHEN p_previo IS NULL THEN coalesce(nombre_actor, 'Alguien') || ' inició un procedimiento. Te toca: ' || ps.titulo
           ELSE coalesce(nombre_actor, 'Alguien') || ' terminó «' || p_previo || '». Te toca: ' || ps.titulo END,
      ps.detalle, nueva
    );
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.procesos_activar_orden(BIGINT, SMALLINT, UUID, TEXT) FROM PUBLIC, anon, authenticated;

-- 4. Iniciar un procedimiento ----------------------------------------------
CREATE OR REPLACE FUNCTION public.iniciar_proceso(p_clave TEXT, p_salas INTEGER[] DEFAULT '{}', p_nota TEXT DEFAULT NULL)
RETURNS BIGINT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  actor UUID := auth.uid();
  pl procesos_plantilla%ROWTYPE;
  pp procesos_pasos_plantilla%ROWTYPE;
  nuevo BIGINT;
  s RECORD;
  resp UUID;
  afecta UUID[];
  primero SMALLINT;
  salas_ok INTEGER[];
BEGIN
  IF actor IS NULL OR NOT EXISTS (SELECT 1 FROM equipo_perfiles WHERE id = actor AND activo) THEN
    RAISE EXCEPTION 'Requiere un usuario del equipo';
  END IF;
  SELECT * INTO pl FROM procesos_plantilla WHERE clave = p_clave AND activo;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Procedimiento desconocido: %', p_clave;
  END IF;
  SELECT coalesce(array_agg(id ORDER BY nombre), '{}') INTO salas_ok
  FROM salas_cultivo WHERE id = ANY (coalesce(p_salas, '{}'));
  IF pl.usa_salas AND cardinality(salas_ok) = 0 THEN
    RAISE EXCEPTION 'Elegí al menos una sala';
  END IF;

  INSERT INTO procesos (plantilla_clave, titulo, salas, nota, iniciado_por)
  VALUES (pl.clave,
          pl.nombre || coalesce(' · ' || (SELECT string_agg(nombre, ', ' ORDER BY nombre) FROM salas_cultivo WHERE id = ANY (salas_ok)), ''),
          salas_ok, nullif(btrim(coalesce(p_nota, '')), ''), actor)
  RETURNING id INTO nuevo;

  FOR pp IN SELECT * FROM procesos_pasos_plantilla WHERE proceso_clave = pl.clave ORDER BY orden, id LOOP
    -- Por nombre, sin importar mayúsculas («Lucho Pérez» sirve para «Lucho»).
    SELECT id INTO resp FROM equipo_perfiles
    WHERE activo AND (lower(btrim(nombre)) = lower(pp.responsable_nombre) OR lower(btrim(nombre)) LIKE lower(pp.responsable_nombre) || ' %')
    ORDER BY (lower(btrim(nombre)) = lower(pp.responsable_nombre)) DESC LIMIT 1;
    resp := coalesce(resp, actor);
    SELECT coalesce(array_agg(DISTINCT e.id), '{}') INTO afecta FROM equipo_perfiles e, unnest(pp.afecta_nombres) n
    WHERE e.activo AND e.id <> resp AND (lower(btrim(e.nombre)) = lower(n) OR lower(btrim(e.nombre)) LIKE lower(n) || ' %');
    IF pp.por_sala THEN
      FOR s IN SELECT id, nombre FROM salas_cultivo WHERE id = ANY (salas_ok) ORDER BY nombre LOOP
        INSERT INTO procesos_pasos (proceso_id, clave, orden, titulo, detalle, sala_id, responsable_id, campos, afecta_a)
        VALUES (nuevo, pp.clave, pp.orden, pp.titulo || ' · ' || s.nombre, pp.detalle, s.id, resp, pp.campos, afecta);
      END LOOP;
    ELSE
      INSERT INTO procesos_pasos (proceso_id, clave, orden, titulo, detalle, responsable_id, campos, afecta_a)
      VALUES (nuevo, pp.clave, pp.orden, pp.titulo, pp.detalle, resp, pp.campos, afecta);
    END IF;
  END LOOP;

  SELECT min(orden) INTO primero FROM procesos_pasos WHERE proceso_id = nuevo;
  IF primero IS NULL THEN
    RAISE EXCEPTION 'El procedimiento % no tiene pasos', p_clave;
  END IF;
  PERFORM procesos_activar_orden(nuevo, primero, actor, NULL);
  RETURN nuevo;
END;
$$;
REVOKE ALL ON FUNCTION public.iniciar_proceso(TEXT, INTEGER[], TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.iniciar_proceso(TEXT, INTEGER[], TEXT) TO authenticated;

-- 5. Completar un paso con su formulario -----------------------------------
-- Guarda los valores, marca la tarea (eso avisa al supervisor y afectados
-- como cualquier tarea), y si terminó el grupo activa el siguiente y le avisa
-- a quien le toca. El riego además queda guardado en registros_riego.
CREATE OR REPLACE FUNCTION public.completar_paso(p_paso BIGINT, p_valores JSONB, p_estado TEXT DEFAULT 'hecho', p_nota TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  actor UUID := auth.uid();
  yo equipo_perfiles%ROWTYPE;
  ps procesos_pasos%ROWTYPE;
  pr procesos%ROWTYPE;
  mezcla JSONB;
  t JSONB;
  siguiente SMALLINT;
  nombre_actor TEXT;
  ciclo BIGINT;
BEGIN
  SELECT * INTO yo FROM equipo_perfiles WHERE id = actor AND activo;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Requiere un usuario del equipo';
  END IF;
  IF p_estado NOT IN ('hecho', 'problema') THEN
    RAISE EXCEPTION 'Estado inválido';
  END IF;
  SELECT * INTO ps FROM procesos_pasos WHERE id = p_paso FOR UPDATE;
  IF NOT FOUND OR ps.estado NOT IN ('pendiente', 'problema') THEN
    RAISE EXCEPTION 'Este paso no está para completar';
  END IF;
  IF NOT (ps.responsable_id = actor OR yo.ve_todas_las_tareas
          OR EXISTS (SELECT 1 FROM equipo_perfiles WHERE id = ps.responsable_id AND supervisor_id = actor)) THEN
    RAISE EXCEPTION 'Este paso le toca a otra persona';
  END IF;
  IF p_estado = 'problema' AND nullif(btrim(coalesce(p_nota, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Contá qué pasó';
  END IF;
  SELECT * INTO pr FROM procesos WHERE id = ps.proceso_id;

  UPDATE procesos_pasos
  SET valores = coalesce(p_valores, '{}'), estado = p_estado, nota = nullif(btrim(coalesce(p_nota, '')), ''),
      hecho_por = actor, hecho_at = now()
  WHERE id = ps.id;

  IF ps.tarea_id IS NOT NULL THEN
    UPDATE tareas
    SET estado = CASE p_estado WHEN 'hecho' THEN 'hecha' ELSE 'problema' END,
        nota = nullif(btrim(coalesce(p_nota, '')), ''), completada_at = now(), completada_por = actor
    WHERE id = ps.tarea_id;
  END IF;

  IF p_estado = 'problema' THEN
    RETURN;
  END IF;

  -- Riego: cada sala regada queda en el registro de riego (pantalla Riego).
  IF pr.plantilla_clave = 'riego' AND ps.clave = 'riego' AND ps.sala_id IS NOT NULL THEN
    SELECT valores INTO mezcla FROM procesos_pasos
    WHERE proceso_id = pr.id AND clave = 'mezcla' AND estado = 'hecho' ORDER BY hecho_at DESC LIMIT 1;
    ciclo := nullif(p_valores #>> '{meta,ciclo_id}', '')::BIGINT;
    IF ciclo IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ciclos_sala WHERE id = ciclo) THEN
      ciclo := NULL;
    END IF;
    INSERT INTO registros_riego (fecha, sala_id, etapa, semana, responsable, ec_entrada, ph_entrada,
                                 litros_por_maceta, ec_runoff, ph_runoff, drenaje_pct, notas, cargado_por, ciclo_id)
    SELECT (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date, ps.sala_id,
           CASE WHEN p_valores #>> '{meta,etapa}' IN ('esqueje', 'vegetativo', 'floracion', 'lavado')
                THEN p_valores #>> '{meta,etapa}' ELSE 'vegetativo' END,
           CASE WHEN (p_valores #>> '{meta,semana}') ~ '^[0-9]+$' AND (p_valores #>> '{meta,semana}')::INT BETWEEN 1 AND 12
                THEN (p_valores #>> '{meta,semana}')::SMALLINT END,
           yo.nombre,
           CASE WHEN (mezcla ->> 'ec') ~ '^[0-9]+([.][0-9]+)?$' THEN (mezcla ->> 'ec')::NUMERIC END,
           CASE WHEN (mezcla ->> 'ph') ~ '^[0-9]+([.][0-9]+)?$' THEN (mezcla ->> 'ph')::NUMERIC END,
           CASE WHEN (p_valores ->> 'litros_maceta') ~ '^[0-9]+([.][0-9]+)?$' THEN (p_valores ->> 'litros_maceta')::NUMERIC END,
           round(avg(CASE WHEN (x ->> 'ec') ~ '^[0-9]+([.][0-9]+)?$' THEN (x ->> 'ec')::NUMERIC END), 2),
           round(avg(CASE WHEN (x ->> 'ph') ~ '^[0-9]+([.][0-9]+)?$' THEN (x ->> 'ph')::NUMERIC END), 1),
           round(avg(CASE WHEN (x ->> 'drenaje') ~ '^[0-9]+([.][0-9]+)?$' THEN (x ->> 'drenaje')::NUMERIC END))::SMALLINT,
           nullif(concat_ws(' · ',
             CASE WHEN mezcla ->> 'productos' IS NOT NULL THEN 'Mezcla: ' || (mezcla ->> 'productos') END,
             (SELECT 'Testigos: ' || string_agg(x2 ->> 'maceta', ', ') FROM jsonb_array_elements(coalesce(p_valores -> 'testigos', '[]')) x2),
             p_valores ->> 'notas'), ''),
           actor, ciclo
    FROM jsonb_array_elements(coalesce(p_valores -> 'testigos', '[]')) AS x
    HAVING TRUE;
    IF ciclo IS NOT NULL THEN
      UPDATE ciclos_sala
      SET testigos = coalesce((SELECT array_agg(x ->> 'maceta') FROM jsonb_array_elements(p_valores -> 'testigos') x
                               WHERE nullif(btrim(x ->> 'maceta'), '') IS NOT NULL), testigos),
          updated_at = now()
      WHERE id = ciclo;
    END IF;
  END IF;

  -- ¿Terminó el grupo de pasos? Activar el siguiente o cerrar el procedimiento.
  IF NOT EXISTS (SELECT 1 FROM procesos_pasos WHERE proceso_id = pr.id AND orden = ps.orden AND estado <> 'hecho') THEN
    SELECT min(orden) INTO siguiente FROM procesos_pasos WHERE proceso_id = pr.id AND orden > ps.orden;
    IF siguiente IS NOT NULL THEN
      PERFORM procesos_activar_orden(pr.id, siguiente, actor,
        CASE WHEN ps.sala_id IS NULL THEN ps.titulo ELSE regexp_replace(ps.titulo, ' · [^·]*$', '') END);
    ELSE
      UPDATE procesos SET estado = 'terminado', terminado_at = now() WHERE id = pr.id;
      SELECT nombre INTO nombre_actor FROM equipo_perfiles WHERE id = actor;
      PERFORM notificar_destinatarios(
        (SELECT array_agg(id) FROM equipo_perfiles WHERE activo AND (ve_todas_las_tareas OR id = pr.iniciado_por)),
        actor, 'proceso', 'Procedimiento terminado: ' || pr.titulo, NULL, ps.tarea_id);
    END IF;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.completar_paso(BIGINT, JSONB, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.completar_paso(BIGINT, JSONB, TEXT, TEXT) TO authenticated;

-- Cancelar (por si se inició por error).
CREATE OR REPLACE FUNCTION public.cancelar_proceso(p_proceso BIGINT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  actor UUID := auth.uid();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM equipo_perfiles WHERE id = actor AND activo) THEN
    RAISE EXCEPTION 'Requiere un usuario del equipo';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM procesos WHERE id = p_proceso AND estado = 'en_curso'
                 AND (iniciado_por = actor OR EXISTS (SELECT 1 FROM equipo_perfiles WHERE id = actor AND ve_todas_las_tareas))) THEN
    RAISE EXCEPTION 'Solo lo cancela quien lo inició, Facundo o Lucho';
  END IF;
  UPDATE procesos SET estado = 'cancelado', terminado_at = now() WHERE id = p_proceso;
  DELETE FROM tareas WHERE estado = 'pendiente' AND proceso_paso_id IN (SELECT id FROM procesos_pasos WHERE proceso_id = p_proceso);
END;
$$;
REVOKE ALL ON FUNCTION public.cancelar_proceso(BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancelar_proceso(BIGINT) TO authenticated;

-- 6. Seguridad: todos leen; los cambios pasan por las funciones -------------
ALTER TABLE public.procesos_plantilla ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.procesos_pasos_plantilla ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.procesos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.procesos_pasos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_all_procesos_plantilla" ON public.procesos_plantilla;
CREATE POLICY "authenticated_all_procesos_plantilla" ON public.procesos_plantilla
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "authenticated_all_procesos_pasos_plantilla" ON public.procesos_pasos_plantilla;
CREATE POLICY "authenticated_all_procesos_pasos_plantilla" ON public.procesos_pasos_plantilla
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "authenticated_select_procesos" ON public.procesos;
CREATE POLICY "authenticated_select_procesos" ON public.procesos
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "authenticated_select_procesos_pasos" ON public.procesos_pasos;
CREATE POLICY "authenticated_select_procesos_pasos" ON public.procesos_pasos
  FOR SELECT TO authenticated USING (true);

COMMIT;
