-- Agregar campos para venta de enrolados
ALTER TABLE ventas 
ADD COLUMN IF NOT EXISTS tipo_venta VARCHAR(20) DEFAULT 'gramos' CHECK (tipo_venta IN ('gramos', 'enrolados'));

ALTER TABLE ventas 
ADD COLUMN IF NOT EXISTS cantidad_enrolados INTEGER DEFAULT NULL;

-- Comentario explicativo
COMMENT ON COLUMN ventas.tipo_venta IS 'Tipo de venta: gramos o enrolados';
COMMENT ON COLUMN ventas.cantidad_enrolados IS 'Cantidad de enrolados vendidos (solo si tipo_venta = enrolados)';
