-- Agregar columna peso_enrolados a detalle_venta
ALTER TABLE detalle_venta ADD COLUMN IF NOT EXISTS peso_enrolados DECIMAL(10, 2) DEFAULT 0;
