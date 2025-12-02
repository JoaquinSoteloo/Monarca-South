-- Agregar precio por enrolado a la tabla de genéticas
ALTER TABLE geneticas ADD COLUMN IF NOT EXISTS precio_por_enrolado numeric(10,2) DEFAULT 0;

-- Comentario: El precio por enrolado es independiente del precio por gramo
COMMENT ON COLUMN geneticas.precio_por_enrolado IS 'Precio unitario por cada enrolado vendido';
