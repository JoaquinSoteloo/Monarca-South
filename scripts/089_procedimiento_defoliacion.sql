-- Procedimiento «Defoliación» (pedido de Facundo, 03/11/2026).
--
-- Ya estaba ejecutado en producción (se encontró aplicado el 12/11/2026, igual a este archivo). Correr después de 088_sede_chat_asistente.sql.
-- Se puede volver a correr: actualiza títulos, responsables y campos.
--
-- Cuándo (lib/ciclo.ts, Ciclos genera las tareas solas):
--   - Limpieza de bajos 3 días antes del 12/12 (preparación 2 días antes).
--   - Defoliación principal el día 21 de flora: hojas que tapan cogollos y
--     ramitas bajas sin luz, como máximo 20–30 % de las hojas.
--   - Repaso el día 42 solo con hojas amarillas o dañadas. Después, nada.
-- Se posterga si la sala tiene plagas, carencias o estrés. Plantas regadas
-- el día anterior y sin otros estreses esa semana.

BEGIN;

INSERT INTO public.procesos_plantilla (clave, nombre, descripcion, usa_salas, orden) VALUES
  ('defoliacion', 'Defoliación',
   'Vilela prepara materiales y plantas → Lucho defolia cada sala → Vilela deja la sala limpia → Lucho revisa la recuperación a los 2–3 días. Limpieza de bajos antes del 12/12 y la principal el día 21 de flora.',
   true, 35)
ON CONFLICT (clave) DO UPDATE SET nombre = EXCLUDED.nombre, descripcion = EXCLUDED.descripcion,
  usa_salas = EXCLUDED.usa_salas, orden = EXCLUDED.orden;

CREATE TEMP TABLE paso (proceso TEXT, clave TEXT, orden SMALLINT, titulo TEXT, detalle TEXT, responsable TEXT, por_sala BOOLEAN, campos JSONB, afecta TEXT[] DEFAULT '{}') ON COMMIT DROP;

INSERT INTO paso (proceso, clave, orden, titulo, detalle, responsable, por_sala, campos, afecta) VALUES
  ('defoliacion', 'preparar', 10, 'Preparar materiales y plantas',
   'Tijeras de punta fina filosas y desinfectadas (una por persona y de repuesto), alcohol 70 % en rociador, guantes, bolsas o tachos, linterna y lupa. Plantas regadas el día anterior.',
   'Vilela', false,
   '[{"clave":"materiales","etiqueta":"¿Están todos los materiales?","tipo":"si_no","requerido":true},
     {"clave":"regadas","etiqueta":"¿Las plantas se regaron el día anterior?","tipo":"si_no","requerido":true},
     {"clave":"faltantes","etiqueta":"Qué falta","tipo":"texto"}]',
   '{Lucho}'),
  ('defoliacion', 'defoliar', 20, 'Defoliar',
   'Primero las salas más sanas. Desinfectar las tijeras entre cama y cama. Cortar, no arrancar. Si la sala tiene plagas, carencias o estrés, marcar «Problema» y postergar.',
   'Lucho', true,
   '[{"clave":"momento","etiqueta":"Qué defoliación es","tipo":"opciones","opciones":["Limpieza de bajos antes del 12/12","Día 21 de flora","Repaso día 42 (solo hojas dañadas)","Otra"],"requerido":true},
     {"clave":"cuanto","etiqueta":"Cuánto se sacó","tipo":"opciones","opciones":["Menos de 15 %","15 a 25 %","25 a 30 %","Más de 30 %"],"requerido":true},
     {"clave":"plantas","etiqueta":"Plantas trabajadas","tipo":"numero","min":0,"max":2000},
     {"clave":"hermafroditas","etiqueta":"¿Apareció alguna hermafrodita?","tipo":"si_no","requerido":true},
     {"clave":"plagas","etiqueta":"¿Se vieron plagas u hongos?","tipo":"si_no","requerido":true},
     {"clave":"notas","etiqueta":"Observaciones","tipo":"texto_largo","ayuda":"Genéticas que se trabajaron distinto, plantas sacadas, etc."}]',
   '{}'),
  ('defoliacion', 'limpieza', 30, 'Dejar la sala limpia',
   'Hojas en bolsas y afuera de la sala, piso barrido, tijeras lavadas y desinfectadas.',
   'Vilela', true,
   '[{"clave":"limpia","etiqueta":"¿Quedó la sala limpia?","tipo":"si_no","requerido":true}]',
   '{}'),
  ('defoliacion', 'revision', 40, 'Revisar la recuperación (2 a 3 días después)',
   'Clima estable: aire y deshumidificador funcionando. Mirar si las plantas se ven caídas o estresadas.',
   'Lucho', true,
   '[{"clave":"estado","etiqueta":"¿Cómo se recuperaron?","tipo":"opciones","opciones":["Bien","Algo estresadas","Mal"],"requerido":true},
     {"clave":"notas","etiqueta":"Observaciones","tipo":"texto_largo"}]',
   '{}');

INSERT INTO public.procesos_pasos_plantilla (proceso_clave, clave, orden, titulo, detalle, responsable_nombre, por_sala, campos, afecta_nombres)
SELECT proceso, clave, orden, titulo, detalle, responsable, por_sala, campos, afecta FROM paso
ON CONFLICT (proceso_clave, clave) DO UPDATE SET orden = EXCLUDED.orden, titulo = EXCLUDED.titulo,
  detalle = EXCLUDED.detalle, responsable_nombre = EXCLUDED.responsable_nombre,
  por_sala = EXCLUDED.por_sala, campos = EXCLUDED.campos, afecta_nombres = EXCLUDED.afecta_nombres;

COMMIT;
