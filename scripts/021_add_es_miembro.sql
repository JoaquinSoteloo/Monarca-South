-- Agregar columna es_miembro a socios
ALTER TABLE socios ADD COLUMN IF NOT EXISTS es_miembro BOOLEAN DEFAULT false;

-- Comentario explicativo
COMMENT ON COLUMN socios.es_miembro IS 'Indica si el socio es miembro del club (trabajador) y tiene productos gratis';
