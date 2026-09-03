-- Pessoa ou Objeto substitui os 3 tipos antigos de pedido (para-mim /
-- buscar-alguem / entregar-algo): agora o pedido é feito por etapas,
-- começando por "pra que é o motorista".
ALTER TABLE public.ride_requests DROP CONSTRAINT IF EXISTS ride_requests_ride_type_check;
ALTER TABLE public.ride_requests ADD CONSTRAINT ride_requests_ride_type_check
    CHECK (ride_type IN ('pessoa', 'objeto'));

-- Adicionais de quando o motorista é pra uma pessoa.
ALTER TABLE public.ride_requests
    ADD COLUMN has_shopping BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN has_extra_object BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN has_child BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN has_pet BOOLEAN NOT NULL DEFAULT false;

-- Detalhes de quando o motorista é pra um objeto.
ALTER TABLE public.ride_requests
    ADD COLUMN object_description TEXT,
    ADD COLUMN object_is_sensitive BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN object_size TEXT CHECK (object_size IN ('pequeno', 'medio', 'grande')),
    ADD COLUMN object_photo_url TEXT,
    ADD COLUMN sender_name TEXT,
    ADD COLUMN sender_whatsapp TEXT;

-- recipient_phone (da migration anterior) vira recipient_whatsapp, mesmo significado.
ALTER TABLE public.ride_requests RENAME COLUMN recipient_phone TO recipient_whatsapp;

-- Bucket pra foto do objeto (mesmo padrão do mural-images).
INSERT INTO storage.buckets (id, name, public)
VALUES ('ride-object-photos', 'ride-object-photos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public Read" ON storage.objects FOR SELECT
    USING (bucket_id = 'ride-object-photos');
CREATE POLICY "Authenticated Upload" ON storage.objects FOR INSERT
    TO authenticated WITH CHECK (bucket_id = 'ride-object-photos');
CREATE POLICY "Owner Update" ON storage.objects FOR UPDATE
    TO authenticated USING (bucket_id = 'ride-object-photos' AND (auth.uid())::text = (storage.foldername(name))[1]);
CREATE POLICY "Owner Delete" ON storage.objects FOR DELETE
    TO authenticated USING (bucket_id = 'ride-object-photos' AND (auth.uid())::text = (storage.foldername(name))[1]);
