-- El motor de automatizaciones pasa de cada 1 minuto a cada 5 minutos.
--
-- Por qué: cada vez que hay una escritura, Supabase cierra y archiva un
-- archivo de WAL de 16 MB a los 2 minutos (archive_timeout = 120 s) para sus
-- copias de seguridad. Con el motor cada minuto siempre había escrituras, así
-- que se archivaban ~720 archivos por día y se agotaba el presupuesto de
-- Disk IO del proyecto. Cada 5 minutos son ~290 por día.
--
-- lib/automations/engine.ts (CADENCIA_MOTOR_MS) ya evalúa las condiciones
-- sostenidas con lecturas cada 5 minutos. Correr esto DESPUÉS de publicar ese
-- cambio.
--
-- Volver a cada minuto: mismo cron.schedule con '* * * * *'.

SELECT cron.schedule('motor-automatizaciones', '*/5 * * * *', 'SELECT public.disparar_motor_automatizaciones()');
