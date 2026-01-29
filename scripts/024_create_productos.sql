-- Crear tabla de productos adicionales (rosin, etc)
CREATE TABLE IF NOT EXISTS productos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  codigo_barras TEXT UNIQUE,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  precio DECIMAL(10, 2) NOT NULL,
  cantidad INTEGER NOT NULL DEFAULT 0,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insertar algunos productos de ejemplo
INSERT INTO productos (nombre, descripcion, precio, cantidad, codigo_barras) VALUES
('Rosin Premium 1g', 'Rosin extraído con prensa', 25000, 10, '7891234567890'),
('Papel de Liar King Size', 'Paquete de 32 hojas', 2000, 50, '7891234567891');

-- Índice para búsqueda por código de barras
CREATE INDEX IF NOT EXISTS idx_productos_codigo_barras ON productos(codigo_barras);
