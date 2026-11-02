-- Sede: chat por canales y asistente de cultivo con IA.
--
-- NO SE EJECUTÓ TODAVÍA. Correr a mano en el SQL Editor de Supabase, después
-- de 086_lecturas_cada_5_minutos.sql.
--
-- Pedido de Facundo (02/11/2026): el simulador de la sede entra al sistema
-- (pantalla /sede) y cada uno lo usa con su usuario, sin cuenta de Claude.
--   - Chat: canal «Todos» (como hasta ahora) + mensajes privados entre dos
--     personas (columna para_id). Un privado lo leen solo quien lo escribe y
--     quien lo recibe.
--   - Asistente: cada persona tiene su conversación privada con el asistente
--     de cultivo (tabla asistente_mensajes). La respuesta la genera el
--     servidor (app/api/asistente) con la clave ANTHROPIC_API_KEY de Vercel.
--
-- Script idempotente, envuelto en una transacción.

BEGIN;

-- 1. Mensajes privados -------------------------------------------------------
ALTER TABLE public.mensajes
  ADD COLUMN IF NOT EXISTS para_id UUID REFERENCES public.equipo(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS mensajes_privados_idx ON public.mensajes (para_id, autor_id, created_at) WHERE para_id IS NOT NULL;

-- Todos leen el canal general y los comentarios de tareas; un privado solo
-- lo ven sus dos personas.
DROP POLICY IF EXISTS "authenticated_select_mensajes" ON public.mensajes;
CREATE POLICY "authenticated_select_mensajes" ON public.mensajes
  FOR SELECT TO authenticated
  USING (para_id IS NULL OR autor_id = auth.uid() OR para_id = auth.uid());

-- Un privado no va dentro de una tarea.
DO $$ BEGIN
  ALTER TABLE public.mensajes
    ADD CONSTRAINT mensajes_privado_sin_tarea CHECK (para_id IS NULL OR tarea_id IS NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Conversación con el asistente ------------------------------------------
CREATE TABLE IF NOT EXISTS public.asistente_mensajes (
  id BIGSERIAL PRIMARY KEY,
  usuario_id UUID NOT NULL DEFAULT auth.uid() REFERENCES public.perfiles(user_id) ON DELETE CASCADE,
  rol VARCHAR(10) NOT NULL CHECK (rol IN ('user', 'assistant')),
  cuerpo TEXT NOT NULL CHECK (char_length(cuerpo) BETWEEN 1 AND 12000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS asistente_mensajes_usuario_idx ON public.asistente_mensajes (usuario_id, created_at);

ALTER TABLE public.asistente_mensajes ENABLE ROW LEVEL SECURITY;
-- Cada uno ve y escribe solo su conversación. La escribe el servidor con la
-- sesión de la persona, así que auth.uid() es siempre quien pregunta.
DROP POLICY IF EXISTS "own_select_asistente" ON public.asistente_mensajes;
CREATE POLICY "own_select_asistente" ON public.asistente_mensajes
  FOR SELECT TO authenticated USING (usuario_id = auth.uid());
DROP POLICY IF EXISTS "own_insert_asistente" ON public.asistente_mensajes;
CREATE POLICY "own_insert_asistente" ON public.asistente_mensajes
  FOR INSERT TO authenticated WITH CHECK (usuario_id = auth.uid());
DROP POLICY IF EXISTS "own_delete_asistente" ON public.asistente_mensajes;
CREATE POLICY "own_delete_asistente" ON public.asistente_mensajes
  FOR DELETE TO authenticated USING (usuario_id = auth.uid());

GRANT SELECT, INSERT, DELETE ON public.asistente_mensajes TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.asistente_mensajes_id_seq TO authenticated;

-- 3. Permiso de la pantalla (script 084): el operador también ve la Sede ------
INSERT INTO public.rol_permisos (rol, permiso) VALUES ('operador', 'sede.ver')
ON CONFLICT DO NOTHING;

COMMIT;
