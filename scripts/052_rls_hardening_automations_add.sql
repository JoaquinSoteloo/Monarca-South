-- Etapa 3A de seguridad (RLS) — PASO 1 de 2: agregar.
--
-- NO SE EJECUTÓ TODAVÍA. Preparado para revisión manual y ejecución en el SQL
-- Editor de Supabase cuando se decida avanzar. No corre solo ni desde la app.
--
-- Alcance de esta etapa: SOLO las tablas de cultivo/monitoreo/hardware/
-- automatizaciones. Ventas, socios, citas, RPC de reservas y Storage quedan
-- para etapas posteriores (ver plan de etapa 3).
--
-- Estas tablas hoy tienen RLS habilitada pero con policies USING(true) sin
-- `TO`, es decir abiertas a `anon` y `authenticated` por igual (ver scripts
-- 039-045, 047, 051). Eso permite que cualquiera con la clave anon pública
-- (visible en el bundle del browser) lea o escriba directo sobre hardware
-- real (dispositivos_controlables, comandos_dispositivo) y sobre el estado
-- de Modo Ausente.
--
-- Este script AGREGA una policy nueva por tabla, exclusiva de `authenticated`
-- (el rol que ya usa el admin logueado, único usuario de la app). Las
-- policies viejas (abiertas a anon) NO se tocan todavía — eso es
-- 053_rls_hardening_automations_drop_old.sql, a correr recién después de
-- verificar que la UI de cultivo/monitoreo/automatizaciones y el cron
-- (/api/automations/evaluate, ya migrado a service_role en el código) siguen
-- funcionando con estas policies nuevas presentes.
--
-- El cron sigue funcionando durante y después de este cambio porque usa
-- createServiceClient() (SUPABASE_SERVICE_ROLE_KEY), que bypassa RLS por
-- completo — no depende de que exista una policy para ningún rol.
--
-- Script idempotente: cada CREATE POLICY va precedido de su propio
-- DROP POLICY IF EXISTS, así se puede re-correr sin error si se cortó a
-- mitad de camino. Envuelto en una transacción (BEGIN/COMMIT).

BEGIN;

DROP POLICY IF EXISTS "authenticated_all_salas_cultivo" ON public.salas_cultivo;
CREATE POLICY "authenticated_all_salas_cultivo" ON public.salas_cultivo
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_all_camas_cultivo" ON public.camas_cultivo;
CREATE POLICY "authenticated_all_camas_cultivo" ON public.camas_cultivo
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_all_pulse_devices" ON public.pulse_devices;
CREATE POLICY "authenticated_all_pulse_devices" ON public.pulse_devices
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_all_lecturas_ambientales" ON public.lecturas_ambientales;
CREATE POLICY "authenticated_all_lecturas_ambientales" ON public.lecturas_ambientales
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_all_dispositivos_controlables" ON public.dispositivos_controlables;
CREATE POLICY "authenticated_all_dispositivos_controlables" ON public.dispositivos_controlables
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_all_automatizaciones" ON public.automatizaciones;
CREATE POLICY "authenticated_all_automatizaciones" ON public.automatizaciones
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_all_comandos_dispositivo" ON public.comandos_dispositivo;
CREATE POLICY "authenticated_all_comandos_dispositivo" ON public.comandos_dispositivo
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_all_ejecuciones_automatizacion" ON public.ejecuciones_automatizacion;
CREATE POLICY "authenticated_all_ejecuciones_automatizacion" ON public.ejecuciones_automatizacion
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_all_automations_engine_lock" ON public.automations_engine_lock;
CREATE POLICY "authenticated_all_automations_engine_lock" ON public.automations_engine_lock
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_all_modo_ausente_estado" ON public.modo_ausente_estado;
CREATE POLICY "authenticated_all_modo_ausente_estado" ON public.modo_ausente_estado
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_all_modo_ausente_violaciones" ON public.modo_ausente_violaciones;
CREATE POLICY "authenticated_all_modo_ausente_violaciones" ON public.modo_ausente_violaciones
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;

-- Después de correr esto: verificar (logueado) que cultivo, monitoreo,
-- automatizaciones y modo ausente siguen andando igual, y que el cron
-- (curl con AUTOMATIONS_CRON_SECRET) sigue devolviendo 200. Recién entonces
-- correr 053_rls_hardening_automations_drop_old.sql.
