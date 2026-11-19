-- 105 — Riego: productos de la mezcla (pedido de Facundo, 18/11/2026).
-- Hasta ahora el silicio, el King Crab y los nutrientes iban en Notas. Ahora
-- cada riego guarda qué llevó la mezcla y en qué dosis, más los litros del
-- tanque, para ver el historial, avisar faltantes (King Crab de los
-- miércoles) y calcular el consumo de cada producto.
-- productos: [{ "clave": "calcis", "nombre": "Calcis C (Ryanodine)", "dosis": 2.8, "unidad": "ml/L" }, …]
-- Lista de productos y dosis sugeridas: lib/riego-productos.ts. Idempotente.
BEGIN;

ALTER TABLE public.registros_riego
  ADD COLUMN IF NOT EXISTS productos JSONB CHECK (productos IS NULL OR jsonb_typeof(productos) = 'array'),
  ADD COLUMN IF NOT EXISTS litros_mezcla NUMERIC(6,1) CHECK (litros_mezcla IS NULL OR litros_mezcla > 0);

COMMIT;
