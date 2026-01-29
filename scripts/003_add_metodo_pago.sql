-- Agregar columna metodo_pago a la tabla ventas
ALTER TABLE ventas 
ADD COLUMN IF NOT EXISTS metodo_pago TEXT NOT NULL DEFAULT 'efectivo';

-- Agregar constraint para validar valores permitidos
ALTER TABLE ventas 
ADD CONSTRAINT metodo_pago_check 
CHECK (metodo_pago IN ('efectivo', 'transferencia'));
