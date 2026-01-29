-- Crear tabla de pagos para registrar pagos parciales
CREATE TABLE IF NOT EXISTS pagos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  venta_id UUID NOT NULL REFERENCES ventas(id) ON DELETE CASCADE,
  monto DECIMAL(10, 2) NOT NULL,
  metodo_pago VARCHAR(20) NOT NULL CHECK (metodo_pago IN ('efectivo', 'transferencia')),
  comprobante_url TEXT NULL,
  notas TEXT NULL,
  fecha TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Agregar columna de saldo pendiente a ventas
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS saldo_pendiente DECIMAL(10, 2) DEFAULT 0;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS monto_pagado DECIMAL(10, 2) DEFAULT 0;

-- Actualizar ventas existentes con metodo_pago = 'pendiente' para que tengan saldo_pendiente = total
UPDATE ventas 
SET saldo_pendiente = total, monto_pagado = 0
WHERE metodo_pago = 'pendiente' AND (saldo_pendiente IS NULL OR saldo_pendiente = 0);

-- Actualizar ventas pagadas para que tengan saldo_pendiente = 0 y monto_pagado = total
UPDATE ventas 
SET saldo_pendiente = 0, monto_pagado = total
WHERE metodo_pago != 'pendiente' AND (monto_pagado IS NULL OR monto_pagado = 0);

-- Crear índices para mejor rendimiento
CREATE INDEX IF NOT EXISTS idx_pagos_venta_id ON pagos(venta_id);
CREATE INDEX IF NOT EXISTS idx_ventas_saldo_pendiente ON ventas(saldo_pendiente);
CREATE INDEX IF NOT EXISTS idx_ventas_metodo_pago ON ventas(metodo_pago);

-- Verificación
SELECT 'Tabla pagos creada y ventas actualizadas' as resultado;
