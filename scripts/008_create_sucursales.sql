-- Crear tabla de sucursales
CREATE TABLE IF NOT EXISTS sucursales (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre VARCHAR(255) NOT NULL,
  direccion VARCHAR(255),
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insertar sucursales iniciales
INSERT INTO sucursales (nombre, direccion) VALUES
  ('Salas Itaqui', 'Dirección Itaqui'),
  ('Salas Balbastro', 'Dirección Balbastro')
ON CONFLICT DO NOTHING;

-- Agregar columnas a socios (quitar vinculacion, agregar estado_reprocan y sucursal_id)
ALTER TABLE socios DROP COLUMN IF EXISTS vinculacion;

ALTER TABLE socios ADD COLUMN IF NOT EXISTS estado_reprocan VARCHAR(20) DEFAULT 'Pendiente' 
  CHECK (estado_reprocan IN ('Activo', 'Pendiente'));

ALTER TABLE socios ADD COLUMN IF NOT EXISTS sucursal_id UUID REFERENCES sucursales(id);
