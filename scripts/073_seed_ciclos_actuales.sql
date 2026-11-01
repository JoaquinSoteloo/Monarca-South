-- Ciclos en curso, con las fechas reales que pasó Facundo el 01/11/2026.
-- Lucho las confirma desde la pantalla Ciclos (botón "Planificar"); al guardar
-- se recalculan las tareas.
--   Sala 1: entró el 30/10 (80 esquejes + las mejores plantas en recuperación).
--   Sala 2: pasó a flora el 24/10. Propuesta: 52 días de flora para cortar
--           ~15/12 y tener material para Navidad.
--   Sala 4: esquejes comprados y trasplantados el 20/10.
--   Sala 5: plantas seleccionadas en recuperación desde el 22/09 (las mejores).
--           Todavía en vege para aprovechar más el tamaño. Propuesta: 12/12
--           el 03/11 → corte ~02/01.
--
-- NO SE EJECUTÓ TODAVÍA. Correr después de 072. Busca las salas por nombre
-- ("Sala 1", "Sala 2", …): revisar que coincidan con salas_cultivo.
-- No duplica: si la sala ya tiene un ciclo abierto, la saltea.
-- Las tareas del protocolo se generan al abrir la pantalla Ciclos.
--
-- Sala 3 es la sala de vege (sin ciclo de flora): madres, esquejes,
-- semillas y plantas en recuperación.

BEGIN;

INSERT INTO public.ciclos_sala (sala_id, nombre, fecha_inicio, dias_vege, dias_flora, m2, notas)
SELECT s.id, v.nombre, v.inicio::date, v.vege, v.flora, v.m2, v.notas
FROM (VALUES
  ('Sala 1', 'Sala 1 · tanda oct-26', '2026-10-30', 21, 60, 10, '80 esquejes + las mejores plantas en recuperación, contadas como una sola tanda.'),
  ('Sala 2', 'Sala 2 · tanda oct-26', '2026-10-03', 21, 52,  6, 'Flora desde el 24/10. Flora corta (52 días) para cortar ~15/12 y llegar a Navidad: a confirmar por Lucho.'),
  ('Sala 4', 'Sala 4 · tanda oct-26', '2026-10-20', 21, 60,  6, 'Casa de Lucho. Esquejes comprados, trasplantados el 20/10.'),
  ('Sala 5', 'Sala 5 · tanda sep-26', '2026-09-22', 42, 60, 10, 'Las mejores plantas, en recuperación con JuaniJuana desde el 22/09. 12/12 propuesto el 03/11: a confirmar por Lucho.')
) AS v(sala, nombre, inicio, vege, flora, m2, notas)
JOIN public.salas_cultivo s ON lower(s.nombre) = lower(v.sala)
WHERE NOT EXISTS (SELECT 1 FROM public.ciclos_sala c WHERE c.sala_id = s.id AND c.estado = 'abierto');

COMMIT;
