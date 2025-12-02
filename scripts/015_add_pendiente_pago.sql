-- Agregar 'pendiente' como opción de método de pago
ALTER TABLE ventas 
DROP CONSTRAINT IF EXISTS ventas_metodo_pago_check;

ALTER TABLE ventas
ADD CONSTRAINT ventas_metodo_pago_check 
CHECK (metodo_pago IN ('efectivo', 'transferencia', 'pendiente'));
