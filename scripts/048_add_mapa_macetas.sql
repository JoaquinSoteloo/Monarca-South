-- Ejecutar una vez en Supabase antes de guardar mapas.
-- Mantiene intactos los datos anteriores de cada cama. No crea macetas ficticias.
BEGIN;
ALTER TABLE public.camas_cultivo
  ADD COLUMN IF NOT EXISTS mapa_macetas JSONB NOT NULL
    DEFAULT '{"filas":2,"columnas":4,"macetas":[]}'::jsonb,
  ADD COLUMN IF NOT EXISTS mapa_version INTEGER NOT NULL DEFAULT 0;

-- Toda escritura del mapa incrementa la versión, incluso desde otros clientes.
-- La UI actualiza con WHERE mapa_version = versión_leída para evitar sobrescrituras.
CREATE OR REPLACE FUNCTION public.validar_mapa_macetas()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  filas INTEGER;
  columnas INTEGER;
  maceta JSONB;
  posiciones TEXT[] := ARRAY[]::TEXT[];
  posicion TEXT;
BEGIN
  IF jsonb_typeof(NEW.mapa_macetas) IS DISTINCT FROM 'object'
    OR jsonb_typeof(NEW.mapa_macetas->'macetas') IS DISTINCT FROM 'array'
    OR coalesce(NEW.mapa_macetas->>'filas', '') !~ '^[0-9]+$'
    OR coalesce(NEW.mapa_macetas->>'columnas', '') !~ '^[0-9]+$' THEN
    RAISE EXCEPTION 'Mapa de macetas inválido';
  END IF;
  filas := (NEW.mapa_macetas->>'filas')::INTEGER;
  columnas := (NEW.mapa_macetas->>'columnas')::INTEGER;
  IF filas NOT BETWEEN 1 AND 12 OR columnas NOT BETWEEN 1 AND 12 THEN
    RAISE EXCEPTION 'El mapa admite entre 1 y 12 filas y columnas';
  END IF;
  FOR maceta IN SELECT value FROM jsonb_array_elements(NEW.mapa_macetas->'macetas') LOOP
    IF coalesce(maceta->>'fila','') !~ '^[0-9]+$'
      OR coalesce(maceta->>'columna','') !~ '^[0-9]+$' THEN
      RAISE EXCEPTION 'Posición de maceta inválida';
    END IF;
    IF (maceta->>'fila')::INTEGER >= filas OR (maceta->>'columna')::INTEGER >= columnas
      OR coalesce(maceta->>'salud', '') NOT IN ('sin_evaluar','sana','observacion','enferma')
      OR coalesce(maceta->>'estado', '') NOT IN ('vegetativo','floracion','cosecha') THEN
      RAISE EXCEPTION 'Posición, salud o etapa inválida';
    END IF;
    posicion := (maceta->>'fila')::INTEGER || ':' || (maceta->>'columna')::INTEGER;
    IF posicion = ANY(posiciones) THEN RAISE EXCEPTION 'Posición duplicada'; END IF;
    posiciones := array_append(posiciones, posicion);
  END LOOP;
  IF TG_OP = 'UPDATE' THEN
    NEW.mapa_version := OLD.mapa_version + 1;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS validar_mapa_macetas_trigger ON public.camas_cultivo;
CREATE TRIGGER validar_mapa_macetas_trigger
  BEFORE INSERT OR UPDATE OF mapa_macetas ON public.camas_cultivo
  FOR EACH ROW EXECUTE FUNCTION public.validar_mapa_macetas();
COMMIT;
