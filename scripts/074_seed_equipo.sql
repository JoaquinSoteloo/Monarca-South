-- Equipo: áreas, supervisión y rutinas del Manual 2 (Rutina diaria del equipo).
--
-- NO SE EJECUTÓ TODAVÍA. Antes de correrlo:
--   1. Crear a cada persona en la pantalla Usuarios del sistema (Facundo,
--      Lucho, Vilela, Demian, Pato), con ese nombre. Las que todavía no
--      tengan usuario se saltean (se puede volver a correr después).
--   2. Correr este script. Se puede volver a correr: actualiza el equipo y no
--      duplica rutinas.
--
-- Se busca a cada persona por nombre en public.perfiles (sin importar
-- mayúsculas; también sirve "Lucho Pérez" para "Lucho").
-- Supervisión pedida por Facundo: Vilela → Lucho, Demian → Facundo.
-- Facundo y Lucho ven las tareas de todos. Pato reporta a Lucho (cubre a Vilela).
-- Días: 1 = lunes … 7 = domingo. Todo se puede cambiar después desde la
-- pantalla Equipo → Rutinas.

BEGIN;

CREATE TEMP TABLE miembro (nombre TEXT, area TEXT, ve_todas BOOLEAN, supervisor TEXT, user_id UUID) ON COMMIT DROP;
INSERT INTO miembro (nombre, area, ve_todas, supervisor) VALUES
  ('Facundo', 'direccion',     true,  NULL),
  ('Lucho',   'cultivo',       true,  NULL),
  ('Vilela',  'mantenimiento', false, 'Lucho'),
  ('Demian',  'atencion',      false, 'Facundo'),
  ('Pato',    'ayudante',      false, 'Lucho');

UPDATE miembro m SET user_id = (
  SELECT p.user_id FROM public.perfiles p
  WHERE lower(btrim(p.nombre)) = lower(m.nombre) OR lower(btrim(p.nombre)) LIKE lower(m.nombre) || ' %'
  ORDER BY (lower(btrim(p.nombre)) = lower(m.nombre)) DESC LIMIT 1
);

INSERT INTO public.equipo (id, area, ve_todas_las_tareas)
SELECT user_id, area, ve_todas FROM miembro WHERE user_id IS NOT NULL
ON CONFLICT (id) DO UPDATE SET area = EXCLUDED.area, ve_todas_las_tareas = EXCLUDED.ve_todas_las_tareas, activo = true;

UPDATE public.equipo e SET supervisor_id = s.user_id
FROM miembro m LEFT JOIN miembro s ON s.nombre = m.supervisor
WHERE e.id = m.user_id;

-- Quiénes quedaron afuera por no tener usuario todavía.
DO $$
DECLARE faltan TEXT;
BEGIN
  SELECT string_agg(nombre, ', ') INTO faltan FROM miembro WHERE user_id IS NULL;
  IF faltan IS NOT NULL THEN
    RAISE NOTICE 'Sin usuario todavía (crear en Usuarios y volver a correr): %', faltan;
  END IF;
END $$;

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
  -- Consumo del equipo: prioridad máxima (Facundo, 01/11). Nadie se sirve solo:
  -- todo lo que retira cada uno se registra como entrega y se descuenta el día 5.
  ('Facundo', 1, 'Lo que retiré hoy quedó registrado como entrega', 'Prioridad máxima. Siempre con cuántos gramos y de qué genética. Si no retiré nada, marcar como hecha.', '{Demian}', 'semanal', '{1,2,3,4,5,6}', NULL),
  ('Lucho',   1, 'Lo que retiré hoy quedó registrado como entrega', 'Prioridad máxima. Siempre con cuántos gramos y de qué genética. Incluye las muestras de calidad (registrarlas como muestra, con su peso y su genética). Si no retiré nada, marcar como hecha.', '{Demian}', 'semanal', '{1,2,3,4,5,6}', NULL),
  ('Vilela',  1, 'Lo que retiré hoy quedó registrado como entrega', 'Prioridad máxima. Siempre con cuántos gramos y de qué genética. Si no retiré nada, marcar como hecha.', '{Demian}', 'semanal', '{1,2,3,4,5,6}', NULL),
  ('Demian',  1, 'Lo que retiré hoy quedó registrado como entrega', 'Prioridad máxima. Siempre con cuántos gramos y de qué genética. Si no retiré nada, marcar como hecha.', '{Facundo}', 'semanal', '{1,2,3,4,5,6}', NULL),
  ('Demian',  3, 'Consumo del equipo: entregado y registrado por mí',
   'Nadie se sirve de un frasco ni de una sala. Lo que retira cada uno pasa por el stock y queda en el sistema con su aporte, los gramos y la genética. Si alguien se sirvió sin registrar, marcar «Problema».', '{Facundo}', 'semanal', '{1,2,3,4,5,6}', NULL),
  ('Demian', 65, 'Sala de vege: semillas germinadas y madres (bajo supervisión de Lucho)',
   'Riego, estado y lo que indique Lucho. Cualquier duda o problema, marcar «Problema» para que le llegue a Lucho.',
   '{Lucho}', 'semanal', '{1,2,3,4,5}', NULL),
  ('Vilela', 35, 'Preventivos en vege: aplicar lo que indicó Lucho',
   'Solo en madres, esquejes y vege; nunca en floración. Registrar cada aplicación con el procedimiento «Aplicación sanitaria» (producto, dosis, carencia). Si no corresponde ese día, marcar como hecha.',
   '{Lucho}', 'semanal', '{1,4}', NULL),
  ('Demian', 70, 'Resumen del consumo del equipo de la semana',
   'Cuánto retiró cada uno y de qué genética, para que Facundo lo descuente el día 5. Incluye los 5 g semanales de Pato.', '{Facundo}', 'semanal', '{5}', NULL),
  ('Lucho',  50, 'Cierre de cosecha: peso seco = entregas + stock + muestras',
   'Con Demian, al terminar de entregar cada cosecha. La diferencia es merma: se revisa en la reunión del viernes.', '{Facundo,Demian}', 'mensual_primer', '{5}', NULL),
  -- Pato (desde las 17 h). Encargado de la limpieza de cierre.
  ('Pato', 1, 'Lo que retiré hoy quedó registrado como entrega', 'Prioridad máxima. Siempre con cuántos gramos y de qué genética. Los 5 g semanales también se registran. Si no retiré nada, marcar como hecha.', '{Demian}', 'semanal', '{1,2,3,4,5,6}', NULL),
  ('Pato', 10, 'Limpieza de salas al cerrar el día',
   'Pisos, hojas, bandejas y basura. Dejar todo listo para que Vilela arranque a la mañana.', '{Lucho,Vilela}', 'semanal', '{1,2,3,4,5,6}', NULL);

INSERT INTO public.tareas_plantilla (titulo, detalle, responsable_id, afecta_a, frecuencia, dias_semana, dia_mes, orden)
SELECT r.titulo, r.detalle, p.id,
  coalesce((SELECT array_agg(a.user_id) FROM miembro a WHERE a.nombre = ANY (r.afecta) AND a.user_id IS NOT NULL), '{}'),
  r.frecuencia, r.dias, r.dia_mes, r.orden
FROM rutina r JOIN miembro m ON m.nombre = r.responsable AND m.user_id IS NOT NULL JOIN public.equipo_perfiles p ON p.id = m.user_id
WHERE NOT EXISTS (
  SELECT 1 FROM public.tareas_plantilla t WHERE t.responsable_id = p.id AND t.titulo = r.titulo
);

-- Pato cubre a Vilela desde las 17 h; además de su rutina de cierre, se le
-- asignan tareas extra desde la pantalla.

COMMIT;
