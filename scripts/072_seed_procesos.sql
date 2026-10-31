-- Recetas de los procedimientos (Manuales 2, 3 y 4 de Monarca South).
--
-- NO SE EJECUTÓ TODAVÍA. Correr después de 071_create_procesos.sql.
-- Se puede volver a correr: actualiza títulos, responsables y campos.
--
-- Responsables por nombre de perfil (068_seed_equipo.sql). Si esa persona
-- todavía no tiene usuario, el paso le queda a quien inició el procedimiento.

BEGIN;

INSERT INTO public.procesos_plantilla (clave, nombre, descripcion, usa_salas, orden) VALUES
  ('riego',    'Riego',                 'Vilela deja los tanques listos → Lucho prepara la mezcla → Lucho riega cada sala y mide el runoff de las macetas testigo.', true, 10),
  ('cosecha',  'Cosecha',               'Corte → manicura y colgado → pesaje de fin de secado → carga en stock.', true, 20),
  ('esquejes', 'Esquejes',              'Vilela prepara los materiales → Lucho corta → control de enraizado.', true, 30),
  ('sanidad',  'Aplicación sanitaria',  'Solo en esquejes, madres y vege. Nunca en floración. Registro de producto, dosis y carencia, y revisión a los 3 días.', true, 40)
ON CONFLICT (clave) DO UPDATE SET nombre = EXCLUDED.nombre, descripcion = EXCLUDED.descripcion,
  usa_salas = EXCLUDED.usa_salas, orden = EXCLUDED.orden;

CREATE TEMP TABLE paso (proceso TEXT, clave TEXT, orden SMALLINT, titulo TEXT, detalle TEXT, responsable TEXT, por_sala BOOLEAN, campos JSONB) ON COMMIT DROP;

INSERT INTO paso VALUES
  -- Riego -------------------------------------------------------------------
  ('riego', 'tanques', 10, 'Tanques listos con agua de ósmosis',
   'Llenar y tapar. Al marcarlo le llega el aviso a Lucho para preparar la mezcla.', 'Vilela', false,
   '[{"clave":"litros","etiqueta":"Litros en el tanque","tipo":"numero","unidad":"L","min":0,"max":1500,"requerido":true},
     {"clave":"ec_agua","etiqueta":"EC del agua de ósmosis","tipo":"numero","unidad":"mS/cm","min":0,"max":1,"ayuda":"Tendría que dar menos de 0,1. Si da más, revisar la ósmosis."}]'),
  ('riego', 'mezcla', 20, 'Preparar la mezcla',
   'Manual 3. Medir después de mezclar y de corregir el pH.', 'Lucho', false,
   '[{"clave":"ec","etiqueta":"EC de la mezcla","tipo":"numero","unidad":"mS/cm","min":0,"max":5,"requerido":true},
     {"clave":"ph","etiqueta":"pH de la mezcla","tipo":"numero","min":3,"max":9,"requerido":true},
     {"clave":"litros","etiqueta":"Litros preparados","tipo":"numero","unidad":"L","min":0,"max":1500},
     {"clave":"productos","etiqueta":"Qué le pusiste","tipo":"texto_largo","requerido":true,"recordar":true,"ayuda":"Producto y dosis. Ej.: Ryanodine A 2 ml/L · B 2 ml/L · C 1 ml/L · regulador de pH"},
     {"clave":"temp_agua","etiqueta":"Temperatura del agua","tipo":"numero","unidad":"°C","min":5,"max":40}]'),
  ('riego', 'riego', 30, 'Regar y medir runoff',
   'Medir el runoff de las 2 macetas testigo de la sala. Queda guardado en Riego con sus alertas.', 'Lucho', true,
   '[{"clave":"litros_maceta","etiqueta":"Litros por maceta","tipo":"numero","unidad":"L","min":0,"max":10},
     {"clave":"testigos","etiqueta":"Macetas testigo","tipo":"testigos","requerido":true,"cantidad":2,"ayuda":"Las mismas 2 macetas durante toda la tanda (ej.: «Cama 2 · maceta 14»). Quedan sugeridas para el próximo riego."},
     {"clave":"notas","etiqueta":"Observaciones","tipo":"texto_largo"}]'),
  -- Cosecha -----------------------------------------------------------------
  ('cosecha', 'corte', 10, 'Corte',
   'Higiene hecha 3 días antes (Manual 4). Todo el equipo ayuda.', 'Lucho', true,
   '[{"clave":"higiene","etiqueta":"¿Se hizo la higiene previa?","tipo":"si_no","requerido":true},
     {"clave":"plantas","etiqueta":"Plantas cortadas","tipo":"numero","min":0,"max":2000,"requerido":true},
     {"clave":"geneticas","etiqueta":"Genéticas y cantidad de plantas","tipo":"texto_largo","ayuda":"Ej.: Blue Moon 20 · Gelato 12"},
     {"clave":"lote","etiqueta":"Lote","tipo":"texto","requerido":true,"ayuda":"Ej.: S2-2612 (sala y fecha de corte)"}]'),
  ('cosecha', 'colgado', 20, 'Manicura y colgado en secado', NULL, 'Vilela', true,
   '[{"clave":"colgado","etiqueta":"¿Quedó todo colgado?","tipo":"si_no","requerido":true},
     {"clave":"manicura_kg","etiqueta":"Manicura juntada (para hash/BHO)","tipo":"numero","unidad":"kg","min":0,"max":50},
     {"clave":"notas","etiqueta":"Observaciones","tipo":"texto_largo"}]'),
  ('cosecha', 'pesaje', 30, 'Pesaje de fin de secado',
   'A los 5–6 días. Pesar por genética. Al marcarlo le avisa a Facundo.', 'Demian', true,
   '[{"clave":"flor_g","etiqueta":"Flor seca","tipo":"numero","unidad":"g","min":0,"max":20000,"requerido":true},
     {"clave":"chicos_g","etiqueta":"Cocos chicos (para enrolados)","tipo":"numero","unidad":"g","min":0,"max":20000},
     {"clave":"por_genetica","etiqueta":"Peso por genética","tipo":"texto_largo","requerido":true,"ayuda":"Ej.: Blue Moon 820 g · Gelato 540 g"},
     {"clave":"frascos","etiqueta":"Frascos o bolsas","tipo":"numero","min":0,"max":500}]'),
  ('cosecha', 'stock', 40, 'Cargar la cosecha en el stock del sistema', NULL, 'Demian', true,
   '[{"clave":"cargado","etiqueta":"¿Quedó cargado en Stock?","tipo":"si_no","requerido":true},
     {"clave":"notas","etiqueta":"Observaciones","tipo":"texto_largo"}]'),
  -- Esquejes ----------------------------------------------------------------
  ('esquejes', 'materiales', 10, 'Preparar tubos, bandejas y King Crab', 'Manual 4. Todo limpio y desinfectado.', 'Vilela', false,
   '[{"clave":"listo","etiqueta":"¿Está todo listo?","tipo":"si_no","requerido":true},
     {"clave":"faltantes","etiqueta":"Qué falta","tipo":"texto"}]'),
  ('esquejes', 'corte', 20, 'Cortar esquejes', NULL, 'Lucho', false,
   '[{"clave":"cantidad","etiqueta":"Esquejes cortados","tipo":"numero","min":0,"max":2000,"requerido":true},
     {"clave":"por_genetica","etiqueta":"Por genética","tipo":"texto_largo","requerido":true,"ayuda":"Ej.: Blue Moon 40 · Gelato 30"},
     {"clave":"madres","etiqueta":"Madres usadas","tipo":"texto"}]'),
  ('esquejes', 'enraizado', 30, 'Control de enraizado (día 10 a 14)', NULL, 'Lucho', false,
   '[{"clave":"enraizados","etiqueta":"Enraizados","tipo":"numero","min":0,"max":2000,"requerido":true},
     {"clave":"perdidos","etiqueta":"Perdidos","tipo":"numero","min":0,"max":2000},
     {"clave":"notas","etiqueta":"Observaciones","tipo":"texto_largo"}]'),
  -- Sanidad -----------------------------------------------------------------
  ('sanidad', 'aplicacion', 10, 'Aplicación',
   'Nunca en floración. Respetar la carencia y rotar productos (Manual 4, Sanidad).', 'Lucho', true,
   '[{"clave":"producto","etiqueta":"Producto","tipo":"opciones","opciones":["Mamboretá ABA","Foli-H","Oil 85","Adama","Otro"],"requerido":true},
     {"clave":"dosis","etiqueta":"Dosis","tipo":"texto","requerido":true,"ayuda":"Ej.: 1 ml/L"},
     {"clave":"litros","etiqueta":"Litros aplicados","tipo":"numero","unidad":"L","min":0,"max":200},
     {"clave":"motivo","etiqueta":"Motivo","tipo":"opciones","opciones":["Preventivo","Curativo"],"requerido":true},
     {"clave":"plaga","etiqueta":"Plaga o síntoma","tipo":"texto"},
     {"clave":"carencia","etiqueta":"Días de carencia","tipo":"numero","unidad":"días","min":0,"max":120}]'),
  ('sanidad', 'revision', 20, 'Revisar el resultado de la aplicación', NULL, 'Vilela', true,
   '[{"clave":"resultado","etiqueta":"¿Cómo está?","tipo":"opciones","opciones":["Bien","Sigue igual","Peor"],"requerido":true},
     {"clave":"notas","etiqueta":"Observaciones","tipo":"texto_largo"}]');

INSERT INTO public.procesos_pasos_plantilla (proceso_clave, clave, orden, titulo, detalle, responsable_nombre, por_sala, campos)
SELECT proceso, clave, orden, titulo, detalle, responsable, por_sala, campos FROM paso
ON CONFLICT (proceso_clave, clave) DO UPDATE SET orden = EXCLUDED.orden, titulo = EXCLUDED.titulo,
  detalle = EXCLUDED.detalle, responsable_nombre = EXCLUDED.responsable_nombre,
  por_sala = EXCLUDED.por_sala, campos = EXCLUDED.campos;

-- La rutina de Vilela ahora apunta al procedimiento.
UPDATE public.tareas_plantilla
SET titulo = 'Si es día de riego: iniciar «Riego» en Procedimientos y dejar los tanques listos',
    detalle = 'Elegir las salas que se riegan. Al marcar «Tanques listos» le llega el aviso a Lucho.'
WHERE titulo = 'Si es día de riego: llenar el tanque con agua de ósmosis y dejarlo tapado';

COMMIT;
