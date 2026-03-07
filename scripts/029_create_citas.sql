-- Crear tabla de citas/turnos
CREATE TABLE IF NOT EXISTS citas (
  id SERIAL PRIMARY KEY,
  fecha DATE NOT NULL,
  hora TIME NOT NULL,
  nombre VARCHAR(100) NOT NULL,
  apellido VARCHAR(100) NOT NULL,
  documento VARCHAR(20) NOT NULL,
  socio_id UUID REFERENCES socios(id),
  estado VARCHAR(20) DEFAULT 'confirmada' CHECK (estado IN ('confirmada', 'cancelada', 'atendida')),
  notas TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Máximo 2 personas por turno (fecha + hora)
  CONSTRAINT max_dos_por_turno UNIQUE (fecha, hora, documento)
);

-- Índices para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_citas_fecha ON citas(fecha);
CREATE INDEX IF NOT EXISTS idx_citas_documento ON citas(documento);
CREATE INDEX IF NOT EXISTS idx_citas_socio_id ON citas(socio_id);

-- Trigger para actualizar updated_at
CREATE OR REPLACE FUNCTION update_citas_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_citas_updated_at ON citas;
CREATE TRIGGER trigger_citas_updated_at
  BEFORE UPDATE ON citas
  FOR EACH ROW
  EXECUTE FUNCTION update_citas_updated_at();
