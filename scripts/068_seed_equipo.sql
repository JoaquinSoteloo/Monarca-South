-- Equipo: perfiles y rutinas del Manual 2 (Rutina diaria del equipo).
--
-- NO SE EJECUTÓ TODAVÍA. Antes de correrlo:
--   1. En Supabase → Authentication → Users → "Add user", crear un usuario por
--      persona (email + contraseña; marcar "Auto Confirm User").
--   2. Reemplazar los emails de la tabla `equipo` de abajo por los reales.
--      Las personas sin usuario creado se saltean (por ejemplo, Pato).
--   3. Correr este script. Se puede volver a correr: actualiza perfiles y no
--      duplica rutinas.
--
-- Supervisión pedida por Facundo: Vilela → Lucho, Demian → Facundo.
-- Facundo y Lucho ven las tareas de todos. Pato reporta a Lucho (cubre a Vilela).
-- Días: 1 = lunes … 7 = domingo. Todo se puede cambiar después desde la
-- pantalla Equipo → Rutinas.

BEGIN;

CREATE TEMP TABLE equipo (email TEXT, nombre TEXT, rol TEXT, ve_todas BOOLEAN, supervisor TEXT) ON COMMIT DROP;
INSERT INTO equipo VALUES
  ('facundo@CAMBIAR.com', 'Facundo', 'direccion',     true,  NULL),
  ('lucho@CAMBIAR.com',   'Lucho',   'cultivo',       true,  NULL),
  ('vilela@CAMBIAR.com',  'Vilela',  'mantenimiento', false, 'Lucho'),
  ('demian@CAMBIAR.com',  'Demian',  'atencion',      false, 'Facundo'),
  ('pato@CAMBIAR.com',    'Pato',    'ayudante',      false, 'Lucho');

INSERT INTO public.perfiles (id, nombre, rol, ve_todas_las_tareas)
SELECT u.id, e.nombre, e.rol, e.ve_todas
FROM equipo e JOIN auth.users u ON lower(u.email) = lower(e.email)
ON CONFLICT (id) DO UPDATE SET nombre = EXCLUDED.nombre, rol = EXCLUDED.rol,
  ve_todas_las_tareas = EXCLUDED.ve_todas_las_tareas, activo = true;

UPDATE public.perfiles p SET supervisor_id = s.id
FROM equipo e LEFT JOIN public.perfiles s ON s.nombre = e.supervisor
WHERE p.nombre = e.nombre;

-- Rutinas ---------------------------------------------------------------
CREATE TEMP TABLE rutina (
  responsable TEXT, orden SMALLINT, titulo TEXT, detalle TEXT, afecta TEXT[],
  frecuencia TEXT, dias SMALLINT[], dia_mes SMALLINT
) ON COMMIT DROP;

INSERT INTO rutina VALUES
  -- Vilela (desde las 10 h). Encargada de la limpieza de apertura.
  ('Vilela', 5, 'Atención al socio: limpiar y dejar todo listo para Demian',
   'Mostrador, balanza, frascos, piso y basura. Que a la tarde Demian encuentre todo en orden para atender.',
   '{Demian}', 'semanal', '{1,2,3,4,5,6}', NULL),
  ('Vilela', 10, 'Revisar el monitoreo de la noche en las 5 salas',
   'Temperatura, humedad y VPD. Si algo estuvo fuera de rango (Manual 2, rangos de referencia), marcar "Problema" y explicar.',
   '{Lucho}', 'semanal', '{1,2,3,4,5,6}', NULL),
  ('Vilela', 20, 'Recorrer las salas',
   'Plagas (revés de las hojas y trampas amarillas), hojas amarillas o quemadas, macetas secas, goteos o filtraciones. Si hay algo raro, marcar "Problema" y subir foto en el comentario.',
   '{Lucho}', 'semanal', '{1,2,3,4,5,6}', NULL),
  ('Vilela', 30, 'Controlar aires, deshumidificadores, ventiladores y extractores', NULL,
   '{Lucho}', 'semanal', '{1,2,3,4,5,6}', NULL),
  ('Vilela', 40, 'Limpieza de salas al iniciar el día',
   'Hojas caídas, sustrato derramado, pisos y bandejas. Sacar la basura. Las salas limpias son tarea de todos; Vilela (apertura) y Pato (cierre) son los encargados.', '{Lucho}', 'semanal', '{1,2,3,4,5,6}', NULL),
  ('Vilela', 50, 'Si es día de riego: llenar el tanque con agua de ósmosis y dejarlo tapado',
   'Para que Lucho lo prepare a la tarde. Si no es día de riego, marcar como hecha.', '{Lucho}', 'semanal', '{1,2,3,4,5,6}', NULL),
  ('Vilela', 60, 'Relevamiento de insumos (procedimiento B)',
   'Nutrientes A, B y C, reguladores de pH, aditivos, sustrato, macetas de 1 L y 5 L, bolsas, guantes y alcohol. Anotar en el comentario lo que alcanza para menos de 2 semanas.',
   '{Lucho,Facundo}', 'semanal', '{1}', NULL),
  -- Lucho (desde las 15 h)
  ('Lucho', 10, 'Leer lo que reportó Vilela y resolver lo urgente', NULL, '{}', 'semanal', '{1,2,3,4,5,6}', NULL),
  ('Lucho', 20, 'Recorrer las salas: estado general y altura de las luces', NULL, '{}', 'semanal', '{1,2,3,4,5,6}', NULL),
  ('Lucho', 30, 'Si es día de riego: preparar el tanque y regar midiendo el runoff',
   'Procedimiento A y Manual 3. Cargar cada sala en la pantalla Riego. Si no es día de riego, levantar una maceta por cama para confirmar por el peso.',
   '{}', 'semanal', '{1,2,3,4,5,6}', NULL),
  ('Lucho', 40, 'Revisar el registro de riego con Facundo', 'Unos 30 minutos: EC y pH de runoff, problemas y ajustes.',
   '{Facundo}', 'semanal', '{5}', NULL),
  -- Demian: stock y elaborados (todos los días) y atención (lunes, miércoles y viernes)
  ('Demian', 2, 'Control de stock del día',
   'Contar flor, enrolados, hash y rosin y compararlo con el sistema. Cada movimiento tiene que quedar cargado.',
   '{Facundo}', 'semanal', '{1,2,3,4,5}', NULL),
  ('Demian', 4, 'Stock bajo: avisar y mirar los próximos cortes',
   'Si algo alcanza para menos de 2 semanas, marcar "Problema". Si además no hay un corte cercano en Ciclos, avisar a Facundo para comprar material.',
   '{Facundo,Lucho}', 'semanal', '{1,2,3,4,5}', NULL),
  ('Demian', 6, 'Empaquetado de flor', 'Bolsas, peso y sticker con genética y lote. Si faltan bolsas o stickers, avisar con "Falta algo".',
   '{}', 'semanal', '{1,2,3,4,5}', NULL),
  ('Demian', 7, 'Armado de enrolados', 'Con los cocos chicos. Cargar en el sistema cuántos se armaron.', '{}', 'semanal', '{1,2,3,4,5}', NULL),
  ('Demian', 8, 'Rosin y hash: preparar la manicura y registrar lo que entra', 'Si no hay manicura o elaborado ese día, marcar como hecha.',
   '{Facundo}', 'semanal', '{1,2,3,4,5}', NULL),
  ('Demian', 9, 'Frasco de exhibición: armarlo y rotar genéticas', 'Que muestre lo que hay disponible ese día.', '{}', 'semanal', '{1,3,5}', NULL),
  ('Demian', 10, 'Apertura de caja (procedimiento C)',
   'Contar el efectivo y compararlo con el fondo fijo. Si no coincide, marcar "Problema" antes de atender.', '{Facundo}', 'semanal', '{1,3,5}', NULL),
  ('Demian', 20, 'Revisar los turnos del día en Citas', NULL, '{}', 'semanal', '{1,3,5}', NULL),
  ('Demian', 30, 'Atender socios y anotar cada movimiento en el sistema (procedimiento D)',
   'REPROCANN activo, límite disponible y sin fiado vencido. Si algo no se cumple, no se entrega.', '{}', 'semanal', '{1,3,5}', NULL),
  ('Demian', 40, 'Responder los mensajes de socios pendientes', NULL, '{}', 'semanal', '{1,3,5}', NULL),
  ('Demian', 45, 'Control de stock de cierre: todo cargado en el sistema', NULL, '{Facundo}', 'semanal', '{1,3,5}', NULL),
  ('Demian', 50, 'Cierre de caja (procedimiento E)',
   'Si no coincide con el sistema, marcar "Problema" con la diferencia y el motivo.', '{Facundo}', 'semanal', '{1,3,5}', NULL),
  ('Demian', 60, 'Socios con REPROCANN por vencer (próximos 90 días) y pendientes de más de 60 días',
   NULL, '{}', 'mensual_primer', '{1}', NULL),
  -- Facundo (supervisión)
  ('Facundo', 10, 'Mirar el monitoreo de las 5 salas y los avisos del equipo', NULL, '{}', 'semanal', '{1,2,3,4,5,6}', NULL),
  ('Facundo', 20, 'Autorizar, pagar y cargar los gastos del día (procedimiento G)', NULL, '{}', 'semanal', '{1,2,3,4,5}', NULL),
  ('Facundo', 30, 'Controlar el cierre de caja de Demian', NULL, '{Demian}', 'semanal', '{1,3,5}', NULL),
  ('Facundo', 40, 'Revisar fiados vencidos (más de 30 días) y avisar a cada socio', NULL, '{Demian}', 'semanal', '{1}', NULL),
  ('Facundo', 50, 'Hacer el pedido de insumos con la lista de Vilela (procedimiento H)', NULL, '{Vilela,Lucho}', 'semanal', '{2}', NULL),
  ('Facundo', 60, 'Pagar retribuciones y cancelar en el sistema lo que cada uno retiró', NULL, '{}', 'mensual_dia', '{1}', 5),
  ('Facundo', 70, 'Reunión de comisión directiva con los números del mes', NULL, '{}', 'mensual_primer', '{2}', NULL),
  -- Pato (desde las 17 h). Encargado de la limpieza de cierre.
  ('Pato', 10, 'Limpieza de salas al cerrar el día',
   'Pisos, hojas, bandejas y basura. Dejar todo listo para que Vilela arranque a la mañana.', '{Lucho,Vilela}', 'semanal', '{1,2,3,4,5,6}', NULL);

INSERT INTO public.tareas_plantilla (titulo, detalle, responsable_id, afecta_a, frecuencia, dias_semana, dia_mes, orden)
SELECT r.titulo, r.detalle, p.id,
  coalesce((SELECT array_agg(a.id) FROM public.perfiles a WHERE a.nombre = ANY (r.afecta)), '{}'),
  r.frecuencia, r.dias, r.dia_mes, r.orden
FROM rutina r JOIN public.perfiles p ON p.nombre = r.responsable
WHERE NOT EXISTS (
  SELECT 1 FROM public.tareas_plantilla t WHERE t.responsable_id = p.id AND t.titulo = r.titulo
);

-- Pato cubre a Vilela desde las 17 h; además de su rutina de cierre, se le
-- asignan tareas extra desde la pantalla.

COMMIT;
