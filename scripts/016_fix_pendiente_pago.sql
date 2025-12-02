-- Buscar y eliminar cualquier constraint de metodo_pago existente
DO $$
DECLARE
    constraint_name text;
BEGIN
    FOR constraint_name IN 
        SELECT conname 
        FROM pg_constraint 
        WHERE conrelid = 'ventas'::regclass 
        AND conname LIKE '%metodo_pago%'
    LOOP
        EXECUTE 'ALTER TABLE ventas DROP CONSTRAINT IF EXISTS ' || constraint_name;
    END LOOP;
END $$;

-- Agregar la nueva constraint que incluye 'pendiente'
ALTER TABLE ventas
ADD CONSTRAINT ventas_metodo_pago_check 
CHECK (metodo_pago IN ('efectivo', 'transferencia', 'pendiente'));

-- Confirmar el cambio
SELECT 'Constraint actualizada correctamente. Ahora se permite: efectivo, transferencia, pendiente' as resultado;
