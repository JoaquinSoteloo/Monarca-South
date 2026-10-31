-- Ciclos en curso al 31/10/2026, según el calendario que pasó Facundo el 30/10.
-- Son ESTIMADOS: Lucho tiene que confirmar las fechas desde la pantalla Ciclos
-- (botón "Planificar"); al guardar se recalculan las tareas.
--
-- NO SE EJECUTÓ TODAVÍA. Correr después de 069. Busca las salas por nombre
-- ("Sala 1", "Sala 2", …): revisar que coincidan con salas_cultivo.
-- No duplica: si la sala ya tiene un ciclo abierto, la saltea.
-- Las tareas del protocolo se generan al abrir la pantalla Ciclos.
--
-- Sala 3 es la sala de vege (sin ciclo de flora).

BEGIN;

INSERT INTO public.ciclos_sala (sala_id, nombre, fecha_inicio, m2, notas)
SELECT s.id, v.nombre, v.inicio::date, v.m2, v.notas
FROM (VALUES
  ('Sala 1', 'Sala 1 · tanda nov-26', '2026-11-09', 10, 'Plantas compradas. 12/12 estimado ~30/11.'),
  ('Sala 2', 'Sala 2 · tanda oct-26', '2026-10-02',  6, 'Pasó a flora ~23/10 con plantas chicas (urgencia de las fiestas).'),
  ('Sala 4', 'Sala 4 · tanda oct-26', '2026-10-20',  6, 'Casa de Lucho. Propuesto correr el 12/12 a ~20/11.'),
  ('Sala 5', 'Sala 5 · tanda oct-26', '2026-10-23', 10, '12/12 estimado ~13/11.')
) AS v(sala, nombre, inicio, m2, notas)
JOIN public.salas_cultivo s ON lower(s.nombre) = lower(v.sala)
WHERE NOT EXISTS (SELECT 1 FROM public.ciclos_sala c WHERE c.sala_id = s.id AND c.estado = 'abierto');

COMMIT;
