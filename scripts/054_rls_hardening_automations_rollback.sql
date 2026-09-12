-- Etapa 3A de seguridad (RLS) — ROLLBACK.
--
-- NO SE EJECUTÓ TODAVÍA. Usar solo si, después de correr
-- 052_rls_hardening_automations_add.sql y/o
-- 053_rls_hardening_automations_drop_old.sql, algo se rompe y hace falta
-- volver exactamente al estado anterior (RLS habilitada pero abierta a
-- anon+authenticated) mientras se investiga.
--
-- No re-ejecuta los scripts históricos completos (039-045, 047, 051): esos
-- mezclan DDL/seed con las policies (ej. 039 también hace INSERT de salas y
-- camas iniciales) y volver a correrlos podría reinsertar datos o fallar por
-- objetos que ya existen. Este script contiene ÚNICAMENTE las policies
-- viejas, extraídas verbatim, más el DROP de las nuevas.
--
-- Es seguro correr esto en cualquier momento (antes o después del paso 2):
-- las policies son aditivas — mientras una tabla tenga AL MENOS una policy
-- permissive que autorice una operación para un rol, esa operación funciona,
-- sin importar cuántas otras policies (nuevas o viejas) también existan.
--
-- Script idempotente: cada CREATE POLICY va precedido de su propio
-- DROP POLICY IF EXISTS, así se puede re-correr sin error si se cortó a
-- mitad de camino. Envuelto en una transacción (BEGIN/COMMIT).

BEGIN;

-- 1) Restaurar las policies abiertas originales (idénticas a como estaban).
DROP POLICY IF EXISTS "Allow select salas_cultivo" ON public.salas_cultivo;
CREATE POLICY "Allow select salas_cultivo" ON public.salas_cultivo FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow insert salas_cultivo" ON public.salas_cultivo;
CREATE POLICY "Allow insert salas_cultivo" ON public.salas_cultivo FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Allow update salas_cultivo" ON public.salas_cultivo;
CREATE POLICY "Allow update salas_cultivo" ON public.salas_cultivo FOR UPDATE USING (true);
DROP POLICY IF EXISTS "Allow delete salas_cultivo" ON public.salas_cultivo;
CREATE POLICY "Allow delete salas_cultivo" ON public.salas_cultivo FOR DELETE USING (true);

DROP POLICY IF EXISTS "Allow select camas_cultivo" ON public.camas_cultivo;
CREATE POLICY "Allow select camas_cultivo" ON public.camas_cultivo FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow insert camas_cultivo" ON public.camas_cultivo;
CREATE POLICY "Allow insert camas_cultivo" ON public.camas_cultivo FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Allow update camas_cultivo" ON public.camas_cultivo;
CREATE POLICY "Allow update camas_cultivo" ON public.camas_cultivo FOR UPDATE USING (true);
DROP POLICY IF EXISTS "Allow delete camas_cultivo" ON public.camas_cultivo;
CREATE POLICY "Allow delete camas_cultivo" ON public.camas_cultivo FOR DELETE USING (true);

DROP POLICY IF EXISTS "Allow select pulse_devices" ON public.pulse_devices;
CREATE POLICY "Allow select pulse_devices" ON public.pulse_devices FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow insert pulse_devices" ON public.pulse_devices;
CREATE POLICY "Allow insert pulse_devices" ON public.pulse_devices FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Allow update pulse_devices" ON public.pulse_devices;
CREATE POLICY "Allow update pulse_devices" ON public.pulse_devices FOR UPDATE USING (true);
DROP POLICY IF EXISTS "Allow delete pulse_devices" ON public.pulse_devices;
CREATE POLICY "Allow delete pulse_devices" ON public.pulse_devices FOR DELETE USING (true);

DROP POLICY IF EXISTS "Allow select lecturas_ambientales" ON public.lecturas_ambientales;
CREATE POLICY "Allow select lecturas_ambientales" ON public.lecturas_ambientales FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow insert lecturas_ambientales" ON public.lecturas_ambientales;
CREATE POLICY "Allow insert lecturas_ambientales" ON public.lecturas_ambientales FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Allow update lecturas_ambientales" ON public.lecturas_ambientales;
CREATE POLICY "Allow update lecturas_ambientales" ON public.lecturas_ambientales FOR UPDATE USING (true);
DROP POLICY IF EXISTS "Allow delete lecturas_ambientales" ON public.lecturas_ambientales;
CREATE POLICY "Allow delete lecturas_ambientales" ON public.lecturas_ambientales FOR DELETE USING (true);

DROP POLICY IF EXISTS "Allow select dispositivos_controlables" ON public.dispositivos_controlables;
CREATE POLICY "Allow select dispositivos_controlables" ON public.dispositivos_controlables FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow insert dispositivos_controlables" ON public.dispositivos_controlables;
CREATE POLICY "Allow insert dispositivos_controlables" ON public.dispositivos_controlables FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Allow update dispositivos_controlables" ON public.dispositivos_controlables;
CREATE POLICY "Allow update dispositivos_controlables" ON public.dispositivos_controlables FOR UPDATE USING (true);
DROP POLICY IF EXISTS "Allow delete dispositivos_controlables" ON public.dispositivos_controlables;
CREATE POLICY "Allow delete dispositivos_controlables" ON public.dispositivos_controlables FOR DELETE USING (true);

DROP POLICY IF EXISTS "Allow select automatizaciones" ON public.automatizaciones;
CREATE POLICY "Allow select automatizaciones" ON public.automatizaciones FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow insert automatizaciones" ON public.automatizaciones;
CREATE POLICY "Allow insert automatizaciones" ON public.automatizaciones FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Allow update automatizaciones" ON public.automatizaciones;
CREATE POLICY "Allow update automatizaciones" ON public.automatizaciones FOR UPDATE USING (true);
DROP POLICY IF EXISTS "Allow delete automatizaciones" ON public.automatizaciones;
CREATE POLICY "Allow delete automatizaciones" ON public.automatizaciones FOR DELETE USING (true);

DROP POLICY IF EXISTS "Allow select comandos_dispositivo" ON public.comandos_dispositivo;
CREATE POLICY "Allow select comandos_dispositivo" ON public.comandos_dispositivo FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow insert comandos_dispositivo" ON public.comandos_dispositivo;
CREATE POLICY "Allow insert comandos_dispositivo" ON public.comandos_dispositivo FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Allow update comandos_dispositivo" ON public.comandos_dispositivo;
CREATE POLICY "Allow update comandos_dispositivo" ON public.comandos_dispositivo FOR UPDATE USING (true);
DROP POLICY IF EXISTS "Allow delete comandos_dispositivo" ON public.comandos_dispositivo;
CREATE POLICY "Allow delete comandos_dispositivo" ON public.comandos_dispositivo FOR DELETE USING (true);

DROP POLICY IF EXISTS "Allow select ejecuciones_automatizacion" ON public.ejecuciones_automatizacion;
CREATE POLICY "Allow select ejecuciones_automatizacion" ON public.ejecuciones_automatizacion FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow insert ejecuciones_automatizacion" ON public.ejecuciones_automatizacion;
CREATE POLICY "Allow insert ejecuciones_automatizacion" ON public.ejecuciones_automatizacion FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Allow update ejecuciones_automatizacion" ON public.ejecuciones_automatizacion;
CREATE POLICY "Allow update ejecuciones_automatizacion" ON public.ejecuciones_automatizacion FOR UPDATE USING (true);
DROP POLICY IF EXISTS "Allow delete ejecuciones_automatizacion" ON public.ejecuciones_automatizacion;
CREATE POLICY "Allow delete ejecuciones_automatizacion" ON public.ejecuciones_automatizacion FOR DELETE USING (true);

DROP POLICY IF EXISTS "Allow select automations_engine_lock" ON public.automations_engine_lock;
CREATE POLICY "Allow select automations_engine_lock" ON public.automations_engine_lock FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow update automations_engine_lock" ON public.automations_engine_lock;
CREATE POLICY "Allow update automations_engine_lock" ON public.automations_engine_lock FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Allow select modo_ausente_estado" ON public.modo_ausente_estado;
CREATE POLICY "Allow select modo_ausente_estado" ON public.modo_ausente_estado FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow insert modo_ausente_estado" ON public.modo_ausente_estado;
CREATE POLICY "Allow insert modo_ausente_estado" ON public.modo_ausente_estado FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Allow update modo_ausente_estado" ON public.modo_ausente_estado;
CREATE POLICY "Allow update modo_ausente_estado" ON public.modo_ausente_estado FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Allow select modo_ausente_violaciones" ON public.modo_ausente_violaciones;
CREATE POLICY "Allow select modo_ausente_violaciones" ON public.modo_ausente_violaciones FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow insert modo_ausente_violaciones" ON public.modo_ausente_violaciones;
CREATE POLICY "Allow insert modo_ausente_violaciones" ON public.modo_ausente_violaciones FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Allow update modo_ausente_violaciones" ON public.modo_ausente_violaciones;
CREATE POLICY "Allow update modo_ausente_violaciones" ON public.modo_ausente_violaciones FOR UPDATE USING (true);
DROP POLICY IF EXISTS "Allow delete modo_ausente_violaciones" ON public.modo_ausente_violaciones;
CREATE POLICY "Allow delete modo_ausente_violaciones" ON public.modo_ausente_violaciones FOR DELETE USING (true);

-- 2) Eliminar las policies nuevas (si llegaron a crearse con
--    052_rls_hardening_automations_add.sql).
DROP POLICY IF EXISTS "authenticated_all_salas_cultivo" ON public.salas_cultivo;
DROP POLICY IF EXISTS "authenticated_all_camas_cultivo" ON public.camas_cultivo;
DROP POLICY IF EXISTS "authenticated_all_pulse_devices" ON public.pulse_devices;
DROP POLICY IF EXISTS "authenticated_all_lecturas_ambientales" ON public.lecturas_ambientales;
DROP POLICY IF EXISTS "authenticated_all_dispositivos_controlables" ON public.dispositivos_controlables;
DROP POLICY IF EXISTS "authenticated_all_automatizaciones" ON public.automatizaciones;
DROP POLICY IF EXISTS "authenticated_all_comandos_dispositivo" ON public.comandos_dispositivo;
DROP POLICY IF EXISTS "authenticated_all_ejecuciones_automatizacion" ON public.ejecuciones_automatizacion;
DROP POLICY IF EXISTS "authenticated_all_automations_engine_lock" ON public.automations_engine_lock;
DROP POLICY IF EXISTS "authenticated_all_modo_ausente_estado" ON public.modo_ausente_estado;
DROP POLICY IF EXISTS "authenticated_all_modo_ausente_violaciones" ON public.modo_ausente_violaciones;

COMMIT;

-- No hace falta tocar el código de app/api/automations/evaluate/route.ts para
-- este rollback: createServiceClient() sigue funcionando igual con las
-- policies viejas restauradas (el service_role bypassa RLS de cualquier
-- forma). Si además se quiere revertir ESE cambio de código, es un
-- `git revert` aparte del commit correspondiente.
