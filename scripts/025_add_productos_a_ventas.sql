-- Agregar productos a detalle_venta
ALTER TABLE detalle_venta ADD COLUMN IF NOT EXISTS producto_id UUID REFERENCES productos(id);

-- Permitir que genetica_id sea opcional (ahora puede ser genetica o producto)
ALTER TABLE detalle_venta ALTER COLUMN genetica_id DROP NOT NULL;

-- Agregar constraint para que haya genetica_id o producto_id
ALTER TABLE detalle_venta ADD CONSTRAINT check_genetica_or_producto 
  CHECK ((genetica_id IS NOT NULL AND producto_id IS NULL) OR (genetica_id IS NULL AND producto_id IS NOT NULL));

-- Crear índice para productos
CREATE INDEX IF NOT EXISTS idx_detalle_venta_producto_id ON detalle_venta(producto_id);
