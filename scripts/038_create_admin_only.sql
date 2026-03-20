-- Crear tabla usuarios_admin si no existe
CREATE TABLE IF NOT EXISTS usuarios_admin (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario VARCHAR(50) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  nombre VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar RLS
ALTER TABLE usuarios_admin ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
DROP POLICY IF EXISTS "Allow select usuarios_admin" ON usuarios_admin;
CREATE POLICY "Allow select usuarios_admin" ON usuarios_admin FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow insert usuarios_admin" ON usuarios_admin;
CREATE POLICY "Allow insert usuarios_admin" ON usuarios_admin FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow update usuarios_admin" ON usuarios_admin;
CREATE POLICY "Allow update usuarios_admin" ON usuarios_admin FOR UPDATE USING (true);

-- Insertar usuario admin con contraseña Sede6065
INSERT INTO usuarios_admin (usuario, password_hash, nombre)
VALUES ('admin', '$2a$10$YX5qZXJ0eXVpb3Bhc2RmZe8xK.CZ0Vj9qLZQ1H2gF7pHJ0KN6eGPy', 'Administrador')
ON CONFLICT (usuario) 
DO UPDATE SET 
  password_hash = EXCLUDED.password_hash,
  updated_at = NOW();
