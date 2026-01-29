-- Crear bucket para comprobantes de pago
INSERT INTO storage.buckets (id, name, public)
VALUES ('comprobantes', 'comprobantes', true)
ON CONFLICT (id) DO NOTHING;

-- Política para permitir subir archivos (usuarios autenticados o anónimos)
CREATE POLICY "Allow public uploads" ON storage.objects
FOR INSERT TO public
WITH CHECK (bucket_id = 'comprobantes');

-- Política para permitir ver archivos públicamente
CREATE POLICY "Allow public reads" ON storage.objects
FOR SELECT TO public
USING (bucket_id = 'comprobantes');

-- Política para permitir actualizar archivos
CREATE POLICY "Allow public updates" ON storage.objects
FOR UPDATE TO public
USING (bucket_id = 'comprobantes');

-- Política para permitir eliminar archivos
CREATE POLICY "Allow public deletes" ON storage.objects
FOR DELETE TO public
USING (bucket_id = 'comprobantes');
