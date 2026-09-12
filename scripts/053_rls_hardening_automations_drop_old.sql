-- Etapa 3A de seguridad (RLS) — PASO 2 de 2: eliminar policies públicas viejas.
--
-- NO SE EJECUTÓ TODAVÍA. Correr SOLO después de:
--   1) Haber ejecutado 052_rls_hardening_automations_add.sql.
--   2) Haber verificado en la app (logueado) que cultivo, monitoreo,
--      automatizaciones y modo ausente siguen funcionando igual.
--   3) Haber verificado que /api/automations/evaluate (cron, ya migrado a
--      createServiceClient() en el código) sigue devolviendo 200 con el
--      secret correcto.
--
-- A partir de este script, `anon` deja de tener acceso a estas 11 tablas
-- (antes tenía lectura Y escritura completa sin sesión). Si algo se rompe,
-- usar 054_rls_hardening_automations_rollback.sql para volver atrás.
--
-- Nombres de policy tomados verbatim de los scripts originales:
-- 039_create_cultivo_tables.sql, 040_create_pulse_devices_table.sql,
-- 041_create_lecturas_ambientales.sql, 042_create_dispositivos_controlables.sql,
-- 043_create_automatizaciones.sql, 044_create_comandos_dispositivo.sql,
-- 045_create_ejecuciones_automatizacion.sql, 047_create_automations_engine_lock.sql,
-- 051_create_modo_ausente.sql.

BEGIN;

-- salas_cultivo
DROP POLICY IF EXISTS "Allow select salas_cultivo" ON public.salas_cultivo;
DROP POLICY IF EXISTS "Allow insert salas_cultivo" ON public.salas_cultivo;
DROP POLICY IF EXISTS "Allow update salas_cultivo" ON public.salas_cultivo;
DROP POLICY IF EXISTS "Allow delete salas_cultivo" ON public.salas_cultivo;

-- camas_cultivo
DROP POLICY IF EXISTS "Allow select camas_cultivo" ON public.camas_cultivo;
DROP POLICY IF EXISTS "Allow insert camas_cultivo" ON public.camas_cultivo;
DROP POLICY IF EXISTS "Allow update camas_cultivo" ON public.camas_cultivo;
DROP POLICY IF EXISTS "Allow delete camas_cultivo" ON public.camas_cultivo;

-- pulse_devices
DROP POLICY IF EXISTS "Allow select pulse_devices" ON public.pulse_devices;
DROP POLICY IF EXISTS "Allow insert pulse_devices" ON public.pulse_devices;
DROP POLICY IF EXISTS "Allow update pulse_devices" ON public.pulse_devices;
DROP POLICY IF EXISTS "Allow delete pulse_devices" ON public.pulse_devices;

-- lecturas_ambientales
DROP POLICY IF EXISTS "Allow select lecturas_ambientales" ON public.lecturas_ambientales;
DROP POLICY IF EXISTS "Allow insert lecturas_ambientales" ON public.lecturas_ambientales;
DROP POLICY IF EXISTS "Allow update lecturas_ambientales" ON public.lecturas_ambientales;
DROP POLICY IF EXISTS "Allow delete lecturas_ambientales" ON public.lecturas_ambientales;

-- dispositivos_controlables
DROP POLICY IF EXISTS "Allow select dispositivos_controlables" ON public.dispositivos_controlables;
DROP POLICY IF EXISTS "Allow insert dispositivos_controlables" ON public.dispositivos_controlables;
DROP POLICY IF EXISTS "Allow update dispositivos_controlables" ON public.dispositivos_controlables;
DROP POLICY IF EXISTS "Allow delete dispositivos_controlables" ON public.dispositivos_controlables;

-- automatizaciones
DROP POLICY IF EXISTS "Allow select automatizaciones" ON public.automatizaciones;
DROP POLICY IF EXISTS "Allow insert automatizaciones" ON public.automatizaciones;
DROP POLICY IF EXISTS "Allow update automatizaciones" ON public.automatizaciones;
DROP POLICY IF EXISTS "Allow delete automatizaciones" ON public.automatizaciones;

-- comandos_dispositivo
DROP POLICY IF EXISTS "Allow select comandos_dispositivo" ON public.comandos_dispositivo;
DROP POLICY IF EXISTS "Allow insert comandos_dispositivo" ON public.comandos_dispositivo;
DROP POLICY IF EXISTS "Allow update comandos_dispositivo" ON public.comandos_dispositivo;
DROP POLICY IF EXISTS "Allow delete comandos_dispositivo" ON public.comandos_dispositivo;

-- ejecuciones_automatizacion
DROP POLICY IF EXISTS "Allow select ejecuciones_automatizacion" ON public.ejecuciones_automatizacion;
DROP POLICY IF EXISTS "Allow insert ejecuciones_automatizacion" ON public.ejecuciones_automatizacion;
DROP POLICY IF EXISTS "Allow update ejecuciones_automatizacion" ON public.ejecuciones_automatizacion;
DROP POLICY IF EXISTS "Allow delete ejecuciones_automatizacion" ON public.ejecuciones_automatizacion;

-- automations_engine_lock (nunca tuvo policy de insert/delete, solo select/update)
DROP POLICY IF EXISTS "Allow select automations_engine_lock" ON public.automations_engine_lock;
DROP POLICY IF EXISTS "Allow update automations_engine_lock" ON public.automations_engine_lock;

-- modo_ausente_estado (nunca tuvo policy de delete)
DROP POLICY IF EXISTS "Allow select modo_ausente_estado" ON public.modo_ausente_estado;
DROP POLICY IF EXISTS "Allow insert modo_ausente_estado" ON public.modo_ausente_estado;
DROP POLICY IF EXISTS "Allow update modo_ausente_estado" ON public.modo_ausente_estado;

-- modo_ausente_violaciones
DROP POLICY IF EXISTS "Allow select modo_ausente_violaciones" ON public.modo_ausente_violaciones;
DROP POLICY IF EXISTS "Allow insert modo_ausente_violaciones" ON public.modo_ausente_violaciones;
DROP POLICY IF EXISTS "Allow update modo_ausente_violaciones" ON public.modo_ausente_violaciones;
DROP POLICY IF EXISTS "Allow delete modo_ausente_violaciones" ON public.modo_ausente_violaciones;

COMMIT;

-- Verificación: correr esto después del COMMIT y confirmar que, para estas
-- 11 tablas, la única policy que queda por tabla es "authenticated_all_*"
-- (ninguna fila "Allow ..." debería aparecer). Además: repetir la
-- verificación manual (UI logueada + curl al cron) y confirmar que un
-- request con SOLO la clave anon (sin sesión) ya no puede leer ni escribir
-- estas tablas (401/permission denied, o 200 con 0 filas en el caso de
-- SELECT, según cómo PostgREST lo reporte).
SELECT schemaname, tablename, policyname, roles, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'salas_cultivo',
    'camas_cultivo',
    'pulse_devices',
    'lecturas_ambientales',
    'dispositivos_controlables',
    'automatizaciones',
    'comandos_dispositivo',
    'ejecuciones_automatizacion',
    'automations_engine_lock',
    'modo_ausente_estado',
    'modo_ausente_violaciones'
  )
ORDER BY tablename, policyname;
