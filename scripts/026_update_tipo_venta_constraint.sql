-- Actualizar el constraint de tipo_venta para permitir productos y combinaciones
ALTER TABLE ventas
DROP CONSTRAINT IF EXISTS ventas_tipo_venta_check;

ALTER TABLE ventas
ADD CONSTRAINT ventas_tipo_venta_check
CHECK (tipo_venta IN ('gramos', 'enrolados', 'mixto', 'genetica_y_enrolados', 'productos'));

COMMENT ON COLUMN ventas.tipo_venta IS 'Tipo de venta: gramos, enrolados, mixto, genetica_y_enrolados, o productos';
