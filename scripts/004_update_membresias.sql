-- Limpiar membresías existentes y agregar nuevas de 10 en 10
DELETE FROM membresias;

INSERT INTO membresias (nombre, gramos_mensuales) VALUES
  ('10g por mes', 10),
  ('20g por mes', 20),
  ('30g por mes', 30),
  ('40g por mes', 40),
  ('50g por mes', 50);
