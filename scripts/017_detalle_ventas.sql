-- Script para permitir múltiples genéticas por venta
-- Crear tabla detalle_venta para las líneas de productos

CREATE TABLE IF NOT EXISTS detalle_venta (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venta_id UUID NOT NULL REFERENCES ventas(id) ON DELETE CASCADE,
  genetica_id UUID NOT NULL REFERENCES geneticas(id),
  gramos DECIMAL(10,2) NOT NULL DEFAULT 0,
  cantidad_enrolados INTEGER DEFAULT NULL,
  peso_por_enrolado DECIMAL(10,2) DEFAULT NULL,
  precio_unitario DECIMAL(10,2) NOT NULL,
  subtotal DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Migrar datos existentes de ventas a detalle_venta
INSERT INTO detalle_venta (venta_id, genetica_id, gramos, cantidad_enrolados, precio_unitario, subtotal)
SELECT 
  id as venta_id,
  genetica_id,
  gramos,
  cantidad_enrolados,
  precio_unitario,
  total as subtotal
FROM ventas
WHERE genetica_id IS NOT NULL;

-- Hacer genetica_id opcional en ventas (ya que ahora está en detalle_venta)
ALTER TABLE ventas ALTER COLUMN genetica_id DROP NOT NULL;

-- Crear índice para mejorar rendimiento
CREATE INDEX IF NOT EXISTS idx_detalle_venta_venta_id ON detalle_venta(venta_id);
CREATE INDEX IF NOT EXISTS idx_detalle_venta_genetica_id ON detalle_venta(genetica_id);
