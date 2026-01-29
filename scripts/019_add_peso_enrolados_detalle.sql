-- Agregar columna peso_enrolados a detalle_venta si no existe
ALTER TABLE detalle_venta ADD COLUMN IF NOT EXISTS peso_enrolados numeric;

-- Agregar columna precio_enrolado a detalle_venta si no existe
ALTER TABLE detalle_venta ADD COLUMN IF NOT EXISTS precio_enrolado numeric;
