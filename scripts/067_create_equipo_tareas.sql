-- Equipo: usuarios con perfil, tareas diarias, avisos y conversación.
--
-- NO SE EJECUTÓ TODAVÍA. Correr a mano en el SQL Editor de Supabase, después
-- de 066_create_registros_riego.sql. Después correr 068_seed_equipo.sql.
--
-- Pedido de Facundo (31/10/2026):
--   - Cada persona entra con su propio usuario (Supabase Auth, email + clave).
--   - Todos ven todo el sistema. Facundo y Lucho ven las tareas de todos.
--   - Cada uno tiene su rutina (Manual 2), que se genera sola cada día, más
--     tareas extra que carga alguien.
--   - Lo que hace Vilela le avisa a Lucho; lo que hace Demian le avisa a
--     Facundo (columna supervisor_id). Si una tarea afecta a otro, ese otro
--     también recibe el aviso (columna afecta_a).
--   - Chat del equipo + comentarios dentro de cada tarea.
--
-- Los avisos se generan con triggers en la base, así no dependen de que la
-- pantalla esté abierta. Todo nace solo para `authenticated`.
--
-- La sesión del sistema (lib/auth/session.ts) sigue igual: esto agrega
-- perfiles por usuario sin tocar la cuenta admin existente.
--
-- Script idempotente, envuelto en una transacción.

BEGIN;

-- 1. Perfiles: una fila por usuario de Supabase Auth -----------------------
CREATE TABLE IF NOT EXISTS public.perfiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre VARCHAR(40) NOT NULL UNIQUE,
  rol VARCHAR(20) NOT NULL CHECK (rol IN ('direccion', 'cultivo', 'mantenimiento', 'atencion', 'ayudante')),
  ve_todas_las_tareas BOOLEAN NOT NULL DEFAULT false,
  supervisor_id UUID REFERENCES public.perfiles(id) ON DELETE SET NULL,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Rutinas (plantillas que generan tareas cada día) ----------------------
--   semanal:        se genera los días de `dias_semana` (ISO: 1 = lunes … 7 = domingo).
--                   Una tarea diaria es una semanal con todos los días.
--   mensual_dia:    se genera el día `dia_mes` de cada mes.
--   mensual_primer: se genera el primer `dias_semana[1]` de cada mes (ej.: primer lunes).
CREATE TABLE IF NOT EXISTS public.tareas_plantilla (
  id BIGSERIAL PRIMARY KEY,
  titulo VARCHAR(160) NOT NULL,
  detalle TEXT,
  responsable_id UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  afecta_a UUID[] NOT NULL DEFAULT '{}',
  frecuencia VARCHAR(20) NOT NULL DEFAULT 'semanal' CHECK (frecuencia IN ('semanal', 'mensual_dia', 'mensual_primer')),
  dias_semana SMALLINT[] NOT NULL DEFAULT '{1,2,3,4,5,6,7}',
  dia_mes SMALLINT CHECK (dia_mes IS NULL OR dia_mes BETWEEN 1 AND 28),
  orden SMALLINT NOT NULL DEFAULT 100,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT plantilla_frecuencia_valida CHECK (
    (frecuencia = 'semanal' AND cardinality(dias_semana) > 0 AND dias_semana <@ '{1,2,3,4,5,6,7}')
    OR (frecuencia = 'mensual_dia' AND dia_mes IS NOT NULL)
    OR (frecuencia = 'mensual_primer' AND cardinality(dias_semana) = 1 AND dias_semana <@ '{1,2,3,4,5,6,7}')
  )
);

-- 3. Tareas del día ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tareas (
  id BIGSERIAL PRIMARY KEY,
  fecha DATE NOT NULL,
  titulo VARCHAR(160) NOT NULL,
  detalle TEXT,
  responsable_id UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  creada_por UUID REFERENCES public.perfiles(id) ON DELETE SET NULL,
  plantilla_id BIGINT REFERENCES public.tareas_plantilla(id) ON DELETE SET NULL,
  afecta_a UUID[] NOT NULL DEFAULT '{}',
  estado VARCHAR(10) NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'hecha', 'problema')),
  nota TEXT,
  completada_at TIMESTAMPTZ,
  completada_por UUID REFERENCES public.perfiles(id) ON DELETE SET NULL,
  orden SMALLINT NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS tareas_plantilla_fecha_uidx ON public.tareas (plantilla_id, fecha) WHERE plantilla_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS tareas_fecha_responsable_idx ON public.tareas (fecha, responsable_id);

-- 4. Avisos (bandeja de cada usuario) --------------------------------------
CREATE TABLE IF NOT EXISTS public.notificaciones (
  id BIGSERIAL PRIMARY KEY,
  destinatario_id UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  autor_id UUID REFERENCES public.perfiles(id) ON DELETE SET NULL,
  tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('tarea_hecha', 'tarea_problema', 'tarea_nueva', 'comentario', 'riego', 'otro')),
  titulo VARCHAR(200) NOT NULL,
  cuerpo TEXT,
  tarea_id BIGINT REFERENCES public.tareas(id) ON DELETE CASCADE,
  enlace VARCHAR(200),
  leida BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notificaciones_destinatario_idx ON public.notificaciones (destinatario_id, leida, created_at DESC);

-- 5. Conversación: chat del equipo (tarea_id NULL) y comentarios por tarea --
CREATE TABLE IF NOT EXISTS public.mensajes (
  id BIGSERIAL PRIMARY KEY,
  autor_id UUID NOT NULL DEFAULT auth.uid() REFERENCES public.perfiles(id) ON DELETE CASCADE,
  tarea_id BIGINT REFERENCES public.tareas(id) ON DELETE CASCADE,
  cuerpo TEXT NOT NULL CHECK (char_length(btrim(cuerpo)) BETWEEN 1 AND 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mensajes_tarea_idx ON public.mensajes (tarea_id, created_at);

-- 6. Quién cargó cada riego -------------------------------------------------
ALTER TABLE public.registros_riego
  ADD COLUMN IF NOT EXISTS cargado_por UUID REFERENCES public.perfiles(id) ON DELETE SET NULL;

-- 7. Generar las tareas de rutina de un día (idempotente) ------------------
CREATE OR REPLACE FUNCTION public.generar_tareas_del_dia(p_fecha DATE)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  creadas INTEGER;
  dow SMALLINT := extract(isodow FROM p_fecha)::SMALLINT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Requiere sesión';
  END IF;
  INSERT INTO tareas (fecha, titulo, detalle, responsable_id, plantilla_id, afecta_a, orden)
  SELECT p_fecha, p.titulo, p.detalle, p.responsable_id, p.id, p.afecta_a, p.orden
  FROM tareas_plantilla p
  JOIN perfiles r ON r.id = p.responsable_id AND r.activo
  WHERE p.activo AND (
    (p.frecuencia = 'semanal' AND dow = ANY (p.dias_semana))
    OR (p.frecuencia = 'mensual_dia' AND extract(day FROM p_fecha) = p.dia_mes)
    OR (p.frecuencia = 'mensual_primer' AND dow = p.dias_semana[1] AND extract(day FROM p_fecha) <= 7)
  )
  ON CONFLICT (plantilla_id, fecha) WHERE plantilla_id IS NOT NULL DO NOTHING;
  GET DIAGNOSTICS creadas = ROW_COUNT;
  RETURN creadas;
END;
$$;
REVOKE ALL ON FUNCTION public.generar_tareas_del_dia(DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generar_tareas_del_dia(DATE) TO authenticated;

-- 8. Avisos automáticos -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.notificar_destinatarios(
  p_destinatarios UUID[], p_autor UUID, p_tipo TEXT, p_titulo TEXT, p_cuerpo TEXT, p_tarea BIGINT
) RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO notificaciones (destinatario_id, autor_id, tipo, titulo, cuerpo, tarea_id, enlace)
  SELECT DISTINCT d, p_autor, p_tipo, left(p_titulo, 200), p_cuerpo, p_tarea, '/equipo'
  FROM unnest(p_destinatarios) AS d
  JOIN perfiles pf ON pf.id = d AND pf.activo
  WHERE d IS NOT NULL AND d IS DISTINCT FROM p_autor;
$$;
REVOKE ALL ON FUNCTION public.notificar_destinatarios(UUID[], UUID, TEXT, TEXT, TEXT, BIGINT) FROM PUBLIC, anon, authenticated;

-- Al completar o marcar un problema: avisa al supervisor del responsable y a
-- los afectados. Un problema avisa además a quienes ven todas las tareas.
CREATE OR REPLACE FUNCTION public.tareas_avisar_cambio_estado()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  actor UUID := coalesce(auth.uid(), NEW.completada_por);
  nombre_actor TEXT;
  dest UUID[];
BEGIN
  IF NEW.estado = OLD.estado OR NEW.estado = 'pendiente' THEN
    RETURN NEW;
  END IF;
  SELECT nombre INTO nombre_actor FROM perfiles WHERE id = actor;
  SELECT array_agg(x) INTO dest FROM (
    SELECT supervisor_id AS x FROM perfiles WHERE id = NEW.responsable_id
    UNION SELECT unnest(NEW.afecta_a)
    UNION SELECT id FROM perfiles WHERE NEW.estado = 'problema' AND ve_todas_las_tareas AND activo
  ) s;
  PERFORM notificar_destinatarios(
    dest, actor,
    CASE NEW.estado WHEN 'hecha' THEN 'tarea_hecha' ELSE 'tarea_problema' END,
    coalesce(nombre_actor, 'Alguien') || CASE NEW.estado WHEN 'hecha' THEN ' completó: ' ELSE ' marcó un problema: ' END || NEW.titulo,
    NEW.nota, NEW.id
  );
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS tareas_avisar_cambio_estado_trg ON public.tareas;
CREATE TRIGGER tareas_avisar_cambio_estado_trg
  AFTER UPDATE OF estado ON public.tareas
  FOR EACH ROW EXECUTE FUNCTION public.tareas_avisar_cambio_estado();

-- Tarea extra cargada por alguien: avisa al responsable y a los afectados.
CREATE OR REPLACE FUNCTION public.tareas_avisar_nueva()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  nombre_autor TEXT;
  nombre_resp TEXT;
BEGIN
  IF NEW.creada_por IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT nombre INTO nombre_autor FROM perfiles WHERE id = NEW.creada_por;
  SELECT nombre INTO nombre_resp FROM perfiles WHERE id = NEW.responsable_id;
  PERFORM notificar_destinatarios(
    ARRAY[NEW.responsable_id], NEW.creada_por, 'tarea_nueva',
    coalesce(nombre_autor, 'Alguien') || ' te asignó: ' || NEW.titulo, NEW.detalle, NEW.id
  );
  PERFORM notificar_destinatarios(
    array_remove(NEW.afecta_a, NEW.responsable_id), NEW.creada_por, 'tarea_nueva',
    'Tarea de ' || coalesce(nombre_resp, 'otro') || ' que te afecta: ' || NEW.titulo, NEW.detalle, NEW.id
  );
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS tareas_avisar_nueva_trg ON public.tareas;
CREATE TRIGGER tareas_avisar_nueva_trg
  AFTER INSERT ON public.tareas
  FOR EACH ROW EXECUTE FUNCTION public.tareas_avisar_nueva();

-- Comentario en una tarea: avisa al responsable, su supervisor, los afectados
-- y a quien la creó (menos al que escribió).
CREATE OR REPLACE FUNCTION public.mensajes_avisar_comentario()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t tareas%ROWTYPE;
  nombre_autor TEXT;
  dest UUID[];
BEGIN
  IF NEW.tarea_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT * INTO t FROM tareas WHERE id = NEW.tarea_id;
  SELECT nombre INTO nombre_autor FROM perfiles WHERE id = NEW.autor_id;
  SELECT array_agg(x) INTO dest FROM (
    SELECT t.responsable_id AS x
    UNION SELECT supervisor_id FROM perfiles WHERE id = t.responsable_id
    UNION SELECT unnest(t.afecta_a)
    UNION SELECT t.creada_por
  ) s;
  PERFORM notificar_destinatarios(
    dest, NEW.autor_id, 'comentario',
    coalesce(nombre_autor, 'Alguien') || ' comentó en: ' || t.titulo, left(NEW.cuerpo, 300), t.id
  );
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS mensajes_avisar_comentario_trg ON public.mensajes;
CREATE TRIGGER mensajes_avisar_comentario_trg
  AFTER INSERT ON public.mensajes
  FOR EACH ROW EXECUTE FUNCTION public.mensajes_avisar_comentario();

-- 9. Seguridad --------------------------------------------------------------
ALTER TABLE public.perfiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tareas_plantilla ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tareas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notificaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mensajes ENABLE ROW LEVEL SECURITY;

-- Perfiles: todos los leen; se administran desde el SQL Editor.
DROP POLICY IF EXISTS "authenticated_select_perfiles" ON public.perfiles;
CREATE POLICY "authenticated_select_perfiles" ON public.perfiles
  FOR SELECT TO authenticated USING (true);

-- Rutinas y tareas: todo el equipo ve y edita (pedido: "todos ven todo").
DROP POLICY IF EXISTS "authenticated_all_tareas_plantilla" ON public.tareas_plantilla;
CREATE POLICY "authenticated_all_tareas_plantilla" ON public.tareas_plantilla
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "authenticated_all_tareas" ON public.tareas;
CREATE POLICY "authenticated_all_tareas" ON public.tareas
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Avisos: cada uno ve y marca como leídos solo los suyos. Cualquiera del
-- equipo puede generar un aviso para otro (ej.: alertas de riego).
DROP POLICY IF EXISTS "own_select_notificaciones" ON public.notificaciones;
CREATE POLICY "own_select_notificaciones" ON public.notificaciones
  FOR SELECT TO authenticated USING (destinatario_id = auth.uid());
DROP POLICY IF EXISTS "own_update_notificaciones" ON public.notificaciones;
CREATE POLICY "own_update_notificaciones" ON public.notificaciones
  FOR UPDATE TO authenticated USING (destinatario_id = auth.uid()) WITH CHECK (destinatario_id = auth.uid());
DROP POLICY IF EXISTS "authenticated_insert_notificaciones" ON public.notificaciones;
CREATE POLICY "authenticated_insert_notificaciones" ON public.notificaciones
  FOR INSERT TO authenticated WITH CHECK (autor_id = auth.uid());

-- Mensajes: todos leen; cada uno escribe y borra solo los propios.
DROP POLICY IF EXISTS "authenticated_select_mensajes" ON public.mensajes;
CREATE POLICY "authenticated_select_mensajes" ON public.mensajes
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "own_insert_mensajes" ON public.mensajes;
CREATE POLICY "own_insert_mensajes" ON public.mensajes
  FOR INSERT TO authenticated WITH CHECK (autor_id = auth.uid());
DROP POLICY IF EXISTS "own_delete_mensajes" ON public.mensajes;
CREATE POLICY "own_delete_mensajes" ON public.mensajes
  FOR DELETE TO authenticated USING (autor_id = auth.uid());

COMMIT;
