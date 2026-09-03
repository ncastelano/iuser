-- Pedidos de serviço (pintor, encanador, jardineiro, eletricista,
-- diarista, montador de móveis, ou outro serviço customizado).
-- Mesmo padrão de ride_requests: sem despacho automático ainda, só
-- registra o pedido (status pending) pra atender manualmente.
CREATE TABLE IF NOT EXISTS public.service_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requester_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    service_type TEXT NOT NULL CHECK (service_type IN ('pintor', 'encanador', 'jardineiro', 'eletricista', 'diarista', 'montador', 'outro')),
    custom_service TEXT,
    location_address TEXT NOT NULL,
    location_needs_access BOOLEAN NOT NULL DEFAULT false,
    location_access_notes TEXT,
    description TEXT NOT NULL,
    photo_urls TEXT[] NOT NULL DEFAULT '{}',
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'completed', 'cancelled')),
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS service_requests_requester_idx ON public.service_requests (requester_id);

ALTER TABLE public.service_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Usuário vê seus próprios pedidos de serviço" ON public.service_requests FOR SELECT USING (auth.uid() = requester_id);
CREATE POLICY "Usuário cria seus próprios pedidos de serviço" ON public.service_requests FOR INSERT WITH CHECK (auth.uid() = requester_id);

-- Bucket pra foto do problema/local (mesmo padrão de ride-object-photos).
INSERT INTO storage.buckets (id, name, public)
VALUES ('service-request-photos', 'service-request-photos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Service Request Photos Public Read" ON storage.objects FOR SELECT
    USING (bucket_id = 'service-request-photos');
CREATE POLICY "Service Request Photos Authenticated Upload" ON storage.objects FOR INSERT
    TO authenticated WITH CHECK (bucket_id = 'service-request-photos');
CREATE POLICY "Service Request Photos Owner Update" ON storage.objects FOR UPDATE
    TO authenticated USING (bucket_id = 'service-request-photos' AND (auth.uid())::text = (storage.foldername(name))[1]);
CREATE POLICY "Service Request Photos Owner Delete" ON storage.objects FOR DELETE
    TO authenticated USING (bucket_id = 'service-request-photos' AND (auth.uid())::text = (storage.foldername(name))[1]);
