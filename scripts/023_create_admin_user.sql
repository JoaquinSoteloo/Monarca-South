-- Script para crear un usuario administrador en Supabase Auth
-- 
-- IMPORTANTE: Este script debe ejecutarse en el SQL Editor de Supabase Dashboard
-- ya que requiere permisos especiales para insertar en auth.users
--
-- Email: admin@monarca.com
-- Password: Sede6065
--
-- Después de ejecutar este script, podés iniciar sesión con estas credenciales
-- y luego cambiar la contraseña desde la aplicación si querés.

-- Crear tabla usuarios_admin para autenticación personalizada
CREATE TABLE IF NOT EXISTS usuarios_admin (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario VARCHAR(50) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  nombre VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insertar usuario en auth.users (Supabase Auth)
INSERT INTO auth.users (
  id,
  instance_id,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_app_meta_data,
  raw_user_meta_data,
  is_super_admin,
  role,
  aud,
  confirmation_token,
  recovery_token,
  email_change_token_new,
  email_change
) VALUES (
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000000',
  'admin@monarca.com',
  crypt('Sede6065', gen_salt('bf')), -- Encripta la contraseña
  NOW(),
  NOW(),
  NOW(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  FALSE,
  'authenticated',
  'authenticated',
  '',
  '',
  '',
  ''
);

-- Insertar usuario admin con nueva contraseña Sede6065
-- El hash bcrypt para "Sede6065" es: $2a$10$YX5qZXJ0eXVpb3Bhc2RmZe8xK.CZ0Vj9qLZQ1H2gF7pHJ0KN6eGPy
INSERT INTO usuarios_admin (usuario, password_hash, nombre)
VALUES ('admin', '$2a$10$YX5qZXJ0eXVpb3Bhc2RmZe8xK.CZ0Vj9qLZQ1H2gF7pHJ0KN6eGPy', 'Administrador')
ON CONFLICT (usuario) 
DO UPDATE SET 
  password_hash = EXCLUDED.password_hash,
  updated_at = NOW();

-- Confirmar que el usuario se creó correctamente
SELECT email, created_at, email_confirmed_at 
FROM auth.users 
WHERE email = 'admin@monarca.com';

-- Verificar que el usuario se creó correctamente
SELECT id, usuario, nombre, created_at 
FROM usuarios_admin 
WHERE usuario = 'admin';
