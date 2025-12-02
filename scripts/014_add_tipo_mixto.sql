-- Actualizar el tipo de venta para permitir "mixto"
ALTER TABLE ventas 
DROP CONSTRAINT IF EXISTS ventas_tipo_venta_check;

ALTER TABLE ventas 
ADD CONSTRAINT ventas_tipo_venta_check 
CHECK (tipo_venta IN ('gramos', 'enrolados', 'mixto'));
