-- Crear tabla de salas de cultivo
CREATE TABLE IF NOT EXISTS salas_cultivo (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  descripcion TEXT,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Crear tabla de camas de cultivo
CREATE TABLE IF NOT EXISTS camas_cultivo (
  id SERIAL PRIMARY KEY,
  sala_id INTEGER NOT NULL REFERENCES salas_cultivo(id) ON DELETE CASCADE,
  nombre VARCHAR(100) NOT NULL,
  genetica_id INTEGER REFERENCES geneticas(id) ON DELETE SET NULL,
  cantidad_plantas INTEGER DEFAULT 0,
  fecha_siembra DATE,
  estado VARCHAR(20) DEFAULT 'vacio' CHECK (estado IN ('vacio', 'vegetativo', 'floracion', 'cosecha')),
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar RLS
ALTER TABLE salas_cultivo ENABLE ROW LEVEL SECURITY;
ALTER TABLE camas_cultivo ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para salas_cultivo
DROP POLICY IF EXISTS "Allow select salas_cultivo" ON salas_cultivo;
CREATE POLICY "Allow select salas_cultivo" ON salas_cultivo FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow insert salas_cultivo" ON salas_cultivo;
CREATE POLICY "Allow insert salas_cultivo" ON salas_cultivo FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow update salas_cultivo" ON salas_cultivo;
CREATE POLICY "Allow update salas_cultivo" ON salas_cultivo FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Allow delete salas_cultivo" ON salas_cultivo;
CREATE POLICY "Allow delete salas_cultivo" ON salas_cultivo FOR DELETE USING (true);

-- Políticas RLS para camas_cultivo
DROP POLICY IF EXISTS "Allow select camas_cultivo" ON camas_cultivo;
CREATE POLICY "Allow select camas_cultivo" ON camas_cultivo FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow insert camas_cultivo" ON camas_cultivo;
CREATE POLICY "Allow insert camas_cultivo" ON camas_cultivo FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow update camas_cultivo" ON camas_cultivo;
CREATE POLICY "Allow update camas_cultivo" ON camas_cultivo FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Allow delete camas_cultivo" ON camas_cultivo;
CREATE POLICY "Allow delete camas_cultivo" ON camas_cultivo FOR DELETE USING (true);

-- Insertar las 3 salas de cultivo iniciales
INSERT INTO salas_cultivo (nombre, descripcion) VALUES
('Sala 1', 'Primera sala de cultivo'),
('Sala 2', 'Segunda sala de cultivo'),
('Sala 3', 'Tercera sala de cultivo');

-- Insertar 4 camas por sala (total 12 camas)
INSERT INTO camas_cultivo (sala_id, nombre) VALUES
-- Sala 1
(1, 'Cama 1'),
(1, 'Cama 2'),
(1, 'Cama 3'),
(1, 'Cama 4'),
-- Sala 2
(2, 'Cama 1'),
(2, 'Cama 2'),
(2, 'Cama 3'),
(2, 'Cama 4'),
-- Sala 3
(3, 'Cama 1'),
(3, 'Cama 2'),
(3, 'Cama 3'),
(3, 'Cama 4');
