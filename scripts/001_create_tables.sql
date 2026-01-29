-- Tabla de membresías (tipos de membresía por cantidad de gramos)
CREATE TABLE IF NOT EXISTS membresias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  gramos_mensuales INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de socios
CREATE TABLE IF NOT EXISTS socios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  apellido TEXT NOT NULL,
  dni TEXT UNIQUE NOT NULL,
  email TEXT,
  telefono TEXT,
  membresia_id UUID REFERENCES membresias(id),
  gramos_consumidos_mes INTEGER DEFAULT 0,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de genéticas (stock)
CREATE TABLE IF NOT EXISTS geneticas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  descripcion TEXT,
  gramos_disponibles DECIMAL(10,2) NOT NULL DEFAULT 0,
  precio_por_gramo DECIMAL(10,2) NOT NULL DEFAULT 0,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de ventas
CREATE TABLE IF NOT EXISTS ventas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  socio_id UUID NOT NULL REFERENCES socios(id),
  genetica_id UUID NOT NULL REFERENCES geneticas(id),
  gramos DECIMAL(10,2) NOT NULL,
  precio_unitario DECIMAL(10,2) NOT NULL,
  total DECIMAL(10,2) NOT NULL,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para mejorar rendimiento
CREATE INDEX IF NOT EXISTS idx_ventas_socio ON ventas(socio_id);
CREATE INDEX IF NOT EXISTS idx_ventas_genetica ON ventas(genetica_id);
CREATE INDEX IF NOT EXISTS idx_ventas_fecha ON ventas(created_at);
CREATE INDEX IF NOT EXISTS idx_socios_membresia ON socios(membresia_id);
