-- Etapa 3C de seguridad (RLS) — RPCs públicas para /reservar.
--
-- Por qué: hasta ahora /reservar (app/reservar/page.tsx) lee y escribe
-- directo sobre las tablas `citas` y `socios` con la clave anon pública,
-- protegido únicamente por policies RLS "USING (true)" (ver 030, 031, 034,
-- 036). Eso significa que cualquiera con la anon key (visible en el bundle
-- del browser) puede leer/insertar/actualizar/borrar filas arbitrarias en
-- esas dos tablas sin pasar por ninguna de las reglas de negocio que hoy
-- viven solo en el cliente: cutoff de reserva, cupo máximo por turno, "un
-- documento = una cita activa por día", etc.
--
-- Esta etapa reemplaza ese acceso directo por 4 funciones SECURITY DEFINER
-- que encapsulan esas mismas reglas server-side, para que
-- 060_rls_hardening_reservations_drop_old.sql pueda cerrar `citas` y
-- `socios` a `anon` sin romper /reservar.
--
-- Riesgo residual documentado (no se soluciona en esta etapa): estas RPCs
-- identifican "tu" cita únicamente por DNI, sin ninguna otra verificación de
-- identidad. Cualquiera que conozca el DNI de otra persona puede usar
-- mi_cita_hoy/reprogramar_reserva_publica para consultar o mover su turno
-- del día (no puede ver nombre/apellido de otro documento salvo que ya los
-- conozca, y no puede cancelarla, solo reprogramarla). Se acepta como riesgo
-- conocido en esta etapa; no se agrega rate limiting ni verificación
-- adicional de identidad todavía.
--
-- Las 4 funciones:
--   - citas_ocupacion_hoy(): cantidad de citas activas por horario, hoy. Sin
--     DNIs ni nombres — solo lo necesario para pintar "lugares disponibles"
--     en /reservar.
--   - mi_cita_hoy(p_documento): la cita activa de HOY para ese documento, si
--     existe.
--   - crear_reserva_publica(...): crea una cita nueva para hoy.
--   - reprogramar_reserva_publica(...): cambia el horario de una cita ya
--     confirmada (y de paso actualiza nombre/apellido, por si la persona los
--     retipeó).
--
-- Todas: SECURITY DEFINER + SET search_path = '' (referencias siempre
-- schema-calificadas public.<tabla>, para que no se pueda secuestrar la
-- función creando un objeto con el mismo nombre en otro schema). REVOKE ALL
-- FROM PUBLIC + GRANT EXECUTE explícito a anon/authenticated (mismo patrón
-- que historial_ambiental_bucketed en 046, pero ahí no hacía falta el
-- REVOKE porque esa función no toca tablas restringidas).
--
-- Zona horaria: "hoy" siempre se calcula en America/Argentina/Buenos_Aires,
-- no en la zona del servidor de Postgres (UTC por defecto en Supabase).
--
-- Concurrencia: crear_reserva_publica y reprogramar_reserva_publica toman
-- DOS pg_advisory_xact_lock, siempre en el mismo orden para no generar
-- deadlocks entre llamadas concurrentes:
--   1) lock por (fecha, documento) — namespace 84732002. Serializa
--      cualquier par de llamadas (crear y/o reprogramar) del MISMO
--      documento, sin importar a qué horario apunte cada una. Sin este
--      lock, dos llamadas concurrentes de un mismo DNI a horarios
--      DISTINTOS podían correr en paralelo (cada una toma un lock de
--      horario distinto) y las dos pasaban el chequeo de "no tiene cita
--      activa" antes de que la otra confirmara la suya, resultando en dos
--      citas activas para el mismo documento el mismo día.
--   2) lock por (fecha, horario destino) — namespace 84732001. Serializa
--      todas las llamadas que compiten por el mismo turno, así dos
--      requests simultáneos por el último lugar no pueden superar
--      max_por_turno.
-- reprogramar_reserva_publica toma el lock de documento ANTES del
-- SELECT ... FOR UPDATE que busca la cita a mover, para que ninguna otra
-- llamada (crear o reprogramar) del mismo documento pueda intercalarse
-- entre "busco la cita" y "la actualizo". Ambos locks son por-transacción:
-- se liberan solo al terminar la función, y cada llamada RPC de PostgREST
-- corre en su propia transacción, así que no quedan colgados entre
-- requests.
--
-- Idempotencia: un doble-submit de crear_reserva_publica con el mismo
-- documento + mismo horario (doble click, reintento de red) no crea una
-- cita duplicada ni falla: devuelve la cita ya creada. Pedir el mismo
-- documento a un horario DISTINTO del que ya tiene sí es un error (MC004) —
-- ese caso lo resuelve el cliente mostrando la pantalla de "¿querés cambiar
-- tu turno?" y llamando a reprogramar_reserva_publica. El lock por
-- documento es lo que hace que esta regla ("una cita activa por documento y
-- día") valga también bajo concurrencia y no solo en llamadas secuenciales:
-- dos crear_reserva_publica concurrentes del mismo DNI a horarios distintos
-- quedan serializadas por ese lock, así la segunda ve efectivamente la cita
-- que acaba de confirmar la primera y responde MC004 en vez de crear una
-- segunda cita activa.
--
-- Códigos de error (USING ERRCODE) que el cliente puede mapear a mensajes
-- conocidos sin parsear texto libre:
--   MC001 reservas cerradas (después de la hora límite configurada)
--   MC002 horario inválido (no existe en la grilla de la configuración)
--   MC003 turno completo (ya alcanzó max_por_turno)
--   MC004 ya existe una cita activa hoy para ese documento, a otro horario
--   MC005 no se encontró una cita confirmable para reprogramar
--   MC006 datos inválidos (documento/nombre/apellido)
--   MC007 la cita existente ya no está "confirmada" (no se puede reprogramar)
--   MC008 la configuración de turnos no está disponible
--
-- Script idempotente: CREATE OR REPLACE FUNCTION + su propio REVOKE/GRANT,
-- se puede re-correr sin error. Envuelto en una transacción (BEGIN/COMMIT).

BEGIN;

-- =========================================================================
-- 1) citas_ocupacion_hoy()
-- =========================================================================
CREATE OR REPLACE FUNCTION public.citas_ocupacion_hoy()
RETURNS TABLE (
  hora time,
  cantidad bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT c.hora, count(*) AS cantidad
  FROM public.citas c
  WHERE c.fecha = (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
    AND c.estado IN ('confirmada', 'atendida', 'no_asistio')
  GROUP BY c.hora
  ORDER BY c.hora;
$$;

REVOKE ALL ON FUNCTION public.citas_ocupacion_hoy() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.citas_ocupacion_hoy() TO anon, authenticated;

-- =========================================================================
-- 2) mi_cita_hoy(p_documento)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.mi_cita_hoy(p_documento text)
RETURNS TABLE (
  id integer,
  hora time,
  estado text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_dni text;
  v_hoy date;
BEGIN
  v_dni := regexp_replace(coalesce(p_documento, ''), '[^0-9]', '', 'g');
  IF p_documento IS NULL OR length(v_dni) < 6 OR length(v_dni) > 20 THEN
    RAISE EXCEPTION 'El documento ingresado no es válido' USING ERRCODE = 'MC006';
  END IF;

  v_hoy := (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;

  RETURN QUERY
  SELECT c.id, c.hora, c.estado::text
  FROM public.citas c
  WHERE c.fecha = v_hoy
    AND c.documento = v_dni
    AND c.estado IN ('confirmada', 'atendida', 'no_asistio')
  ORDER BY c.created_at DESC
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.mi_cita_hoy(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mi_cita_hoy(text) TO anon, authenticated;

-- =========================================================================
-- 3) crear_reserva_publica(p_nombre, p_apellido, p_documento, p_hora)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.crear_reserva_publica(
  p_nombre text,
  p_apellido text,
  p_documento text,
  p_hora time
)
RETURNS TABLE (
  id integer,
  fecha date,
  hora time,
  estado text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_config public.config_citas%ROWTYPE;
  v_ahora timestamp;
  v_hoy date;
  v_hora_actual int;
  v_dni text;
  v_nombre text;
  v_apellido text;
  v_socio_id uuid;
  v_cantidad int;
  v_existente_id integer;
  v_existente_hora time;
  v_existente_estado text;
BEGIN
  SELECT * INTO v_config FROM public.config_citas WHERE id = 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La configuración de turnos no está disponible' USING ERRCODE = 'MC008';
  END IF;

  v_ahora := (now() AT TIME ZONE 'America/Argentina/Buenos_Aires');
  v_hoy := v_ahora::date;
  v_hora_actual := EXTRACT(HOUR FROM v_ahora)::int;

  IF v_hora_actual >= v_config.hora_limite_reserva THEN
    RAISE EXCEPTION 'Las reservas están cerradas después de las %:00hs', v_config.hora_limite_reserva
      USING ERRCODE = 'MC001';
  END IF;

  v_nombre := btrim(coalesce(p_nombre, ''));
  v_apellido := btrim(coalesce(p_apellido, ''));
  IF p_nombre IS NULL OR p_apellido IS NULL
     OR length(v_nombre) = 0 OR length(v_nombre) > 100
     OR length(v_apellido) = 0 OR length(v_apellido) > 100 THEN
    RAISE EXCEPTION 'Revisá el nombre y apellido ingresados' USING ERRCODE = 'MC006';
  END IF;

  v_dni := regexp_replace(coalesce(p_documento, ''), '[^0-9]', '', 'g');
  IF p_documento IS NULL OR length(v_dni) < 6 OR length(v_dni) > 20 THEN
    RAISE EXCEPTION 'El documento ingresado no es válido' USING ERRCODE = 'MC006';
  END IF;

  IF p_hora IS NULL THEN
    RAISE EXCEPTION 'Seleccioná un horario' USING ERRCODE = 'MC002';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM generate_series(
      ('2000-01-01 ' || v_config.hora_inicio::text)::timestamp,
      ('2000-01-01 ' || v_config.hora_fin::text)::timestamp,
      interval '30 minutes'
    ) AS gs(ts)
    WHERE gs.ts::time = p_hora
  ) THEN
    RAISE EXCEPTION 'El horario seleccionado no es válido' USING ERRCODE = 'MC002';
  END IF;

  -- Orden fijo de locks para evitar deadlocks: primero documento, después
  -- horario destino (ver comentario "Concurrencia" al inicio del archivo).
  PERFORM pg_advisory_xact_lock(84732002, hashtext(v_hoy::text || '|' || v_dni::text));
  PERFORM pg_advisory_xact_lock(84732001, hashtext(v_hoy::text || '|' || p_hora::text));

  -- Un documento no puede tener dos citas activas el mismo día. Si ya tiene
  -- una Y es a este mismo horario, tratamos el pedido como un reintento
  -- (doble click, red lenta) y devolvemos la cita existente sin duplicar.
  -- El lock por documento tomado arriba es lo que garantiza que este
  -- chequeo sea válido también bajo concurrencia (ver comentario
  -- "Concurrencia" al inicio del archivo).
  SELECT c.id, c.hora, c.estado::text
  INTO v_existente_id, v_existente_hora, v_existente_estado
  FROM public.citas c
  WHERE c.fecha = v_hoy
    AND c.documento = v_dni
    AND c.estado IN ('confirmada', 'atendida', 'no_asistio')
  ORDER BY c.created_at DESC
  LIMIT 1;

  IF FOUND THEN
    IF v_existente_hora = p_hora THEN
      id := v_existente_id;
      fecha := v_hoy;
      hora := v_existente_hora;
      estado := v_existente_estado;
      RETURN NEXT;
      RETURN;
    ELSE
      RAISE EXCEPTION 'Ya tenés una cita reservada para hoy' USING ERRCODE = 'MC004';
    END IF;
  END IF;

  SELECT count(*) INTO v_cantidad
  FROM public.citas c
  WHERE c.fecha = v_hoy
    AND c.hora = p_hora
    AND c.estado IN ('confirmada', 'atendida', 'no_asistio');

  IF v_cantidad >= v_config.max_por_turno THEN
    RAISE EXCEPTION 'Este horario ya está completo, elegí otro' USING ERRCODE = 'MC003';
  END IF;

  -- Limpia una cita cancelada previa con el mismo (fecha, hora, documento)
  -- para no chocar con el UNIQUE constraint de la tabla.
  DELETE FROM public.citas c
  WHERE c.fecha = v_hoy
    AND c.hora = p_hora
    AND c.documento = v_dni
    AND c.estado = 'cancelada';

  SELECT s.id INTO v_socio_id FROM public.socios s WHERE s.dni = v_dni;

  INSERT INTO public.citas AS c (fecha, hora, nombre, apellido, documento, socio_id, estado)
  VALUES (v_hoy, p_hora, v_nombre, v_apellido, v_dni, v_socio_id, 'confirmada')
  RETURNING c.id, c.fecha, c.hora, c.estado::text INTO id, fecha, hora, estado;

  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.crear_reserva_publica(text, text, text, time) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crear_reserva_publica(text, text, text, time) TO anon, authenticated;

-- =========================================================================
-- 4) reprogramar_reserva_publica(p_nombre, p_apellido, p_documento, p_hora_nueva)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.reprogramar_reserva_publica(
  p_nombre text,
  p_apellido text,
  p_documento text,
  p_hora_nueva time
)
RETURNS TABLE (
  id integer,
  fecha date,
  hora time,
  estado text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_config public.config_citas%ROWTYPE;
  v_ahora timestamp;
  v_hoy date;
  v_hora_actual int;
  v_dni text;
  v_nombre text;
  v_apellido text;
  v_socio_id uuid;
  v_cantidad int;
  v_cita_id integer;
  v_cita_hora time;
  v_cita_estado text;
BEGIN
  SELECT * INTO v_config FROM public.config_citas WHERE id = 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La configuración de turnos no está disponible' USING ERRCODE = 'MC008';
  END IF;

  v_ahora := (now() AT TIME ZONE 'America/Argentina/Buenos_Aires');
  v_hoy := v_ahora::date;
  v_hora_actual := EXTRACT(HOUR FROM v_ahora)::int;

  IF v_hora_actual >= v_config.hora_limite_reserva THEN
    RAISE EXCEPTION 'Las reservas están cerradas después de las %:00hs', v_config.hora_limite_reserva
      USING ERRCODE = 'MC001';
  END IF;

  v_nombre := btrim(coalesce(p_nombre, ''));
  v_apellido := btrim(coalesce(p_apellido, ''));
  IF p_nombre IS NULL OR p_apellido IS NULL
     OR length(v_nombre) = 0 OR length(v_nombre) > 100
     OR length(v_apellido) = 0 OR length(v_apellido) > 100 THEN
    RAISE EXCEPTION 'Revisá el nombre y apellido ingresados' USING ERRCODE = 'MC006';
  END IF;

  v_dni := regexp_replace(coalesce(p_documento, ''), '[^0-9]', '', 'g');
  IF p_documento IS NULL OR length(v_dni) < 6 OR length(v_dni) > 20 THEN
    RAISE EXCEPTION 'El documento ingresado no es válido' USING ERRCODE = 'MC006';
  END IF;

  IF p_hora_nueva IS NULL THEN
    RAISE EXCEPTION 'Seleccioná un horario' USING ERRCODE = 'MC002';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM generate_series(
      ('2000-01-01 ' || v_config.hora_inicio::text)::timestamp,
      ('2000-01-01 ' || v_config.hora_fin::text)::timestamp,
      interval '30 minutes'
    ) AS gs(ts)
    WHERE gs.ts::time = p_hora_nueva
  ) THEN
    RAISE EXCEPTION 'El horario seleccionado no es válido' USING ERRCODE = 'MC002';
  END IF;

  -- Orden fijo de locks para evitar deadlocks: primero documento, después
  -- horario destino (ver comentario "Concurrencia" al inicio del archivo).
  -- El lock de documento se toma ANTES del SELECT ... FOR UPDATE de abajo,
  -- para que ninguna otra llamada (crear o reprogramar) del mismo documento
  -- pueda intercalarse entre "busco la cita" y "la actualizo".
  PERFORM pg_advisory_xact_lock(84732002, hashtext(v_hoy::text || '|' || v_dni::text));

  -- Cita activa de hoy para este documento (la más reciente si por algún
  -- motivo hubiera más de una). FOR UPDATE: la bloqueamos contra otra
  -- reprogramación concurrente del mismo documento (redundante con el lock
  -- de arriba, pero además evita que una crear_reserva_publica concurrente
  -- lea esta fila a mitad de un UPDATE).
  SELECT c.id, c.hora, c.estado::text
  INTO v_cita_id, v_cita_hora, v_cita_estado
  FROM public.citas c
  WHERE c.fecha = v_hoy
    AND c.documento = v_dni
    AND c.estado IN ('confirmada', 'atendida', 'no_asistio')
  ORDER BY c.created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No encontramos una cita para reprogramar' USING ERRCODE = 'MC005';
  END IF;

  IF v_cita_estado <> 'confirmada' THEN
    RAISE EXCEPTION 'Tu cita ya no está confirmada y no se puede reprogramar' USING ERRCODE = 'MC007';
  END IF;

  -- Serializa contra cualquier otra reserva/reprogramación que compita por
  -- el (fecha, horario) destino. Si el destino es el mismo horario que ya
  -- tenía, esto también sirve para actualizar nombre/apellido de forma segura.
  PERFORM pg_advisory_xact_lock(84732001, hashtext(v_hoy::text || '|' || p_hora_nueva::text));

  -- Cupo del horario destino, sin contar la propia cita que se está moviendo
  -- (así reprogramar al mismo horario que ya tenía nunca se autobloquea).
  SELECT count(*) INTO v_cantidad
  FROM public.citas c
  WHERE c.fecha = v_hoy
    AND c.hora = p_hora_nueva
    AND c.estado IN ('confirmada', 'atendida', 'no_asistio')
    AND c.id <> v_cita_id;

  IF v_cantidad >= v_config.max_por_turno THEN
    RAISE EXCEPTION 'Este horario ya está completo, elegí otro' USING ERRCODE = 'MC003';
  END IF;

  -- Limpia una cita cancelada previa en el horario destino con el mismo
  -- documento, para no chocar con el UNIQUE constraint de la tabla.
  DELETE FROM public.citas c
  WHERE c.fecha = v_hoy
    AND c.hora = p_hora_nueva
    AND c.documento = v_dni
    AND c.estado = 'cancelada';

  SELECT s.id INTO v_socio_id FROM public.socios s WHERE s.dni = v_dni;

  UPDATE public.citas AS c
  SET hora = p_hora_nueva,
      nombre = v_nombre,
      apellido = v_apellido,
      socio_id = v_socio_id,
      estado = 'confirmada'
  WHERE c.id = v_cita_id
  RETURNING c.id, c.fecha, c.hora, c.estado::text INTO id, fecha, hora, estado;

  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.reprogramar_reserva_publica(text, text, text, time) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reprogramar_reserva_publica(text, text, text, time) TO anon, authenticated;

COMMIT;

-- Verificación de concurrencia (además de la funcional habitual):
-- confirmar que dos llamadas simultáneas de crear_reserva_publica con el
-- MISMO documento y horarios DISTINTOS no puedan crear dos citas activas
-- para ese documento el mismo día. Abrir dos conexiones (dos pestañas del
-- SQL Editor de Supabase, o dos `psql`) y lanzar, lo más simultáneo
-- posible (por ejemplo ejecutando ambas con un segundo de diferencia o
-- menos):
--
--   -- conexión A
--   SELECT * FROM public.crear_reserva_publica('Test', 'Uno', '99999901', '14:00');
--
--   -- conexión B
--   SELECT * FROM public.crear_reserva_publica('Test', 'Dos', '99999901', '14:30');
--
-- Resultado esperado: el lock por (fecha, documento) serializa ambas
-- llamadas aunque pidan horarios distintos. Una de las dos (la que llegue
-- segunda al lock) debe fallar con ERRCODE MC004 ("Ya tenés una cita
-- reservada para hoy"); la otra debe devolver la fila de la cita creada.
-- Al final debe existir UNA sola fila en `citas` con
-- documento = '99999901' y estado en ('confirmada','atendida','no_asistio')
-- para hoy — nunca dos. Antes de este fix (sin el lock por documento), era
-- posible que ambas pasaran el chequeo de "no tiene cita activa" y las dos
-- terminaran creando una fila cada una.
--
-- Limpieza después de la prueba:
--   DELETE FROM public.citas WHERE documento = '99999901';
