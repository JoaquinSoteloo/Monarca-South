-- Insertar membresías predefinidas
INSERT INTO membresias (nombre, gramos_mensuales) VALUES
  ('Básica', 10),
  ('Standard', 20),
  ('Premium', 30),
  ('VIP', 50)
ON CONFLICT DO NOTHING;
