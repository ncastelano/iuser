-- Quadro de vagas: qualquer autenticado pode ver pedidos abertos
-- (além do dono já poder ver os seus, de qualquer status, pela
-- policy existente).
CREATE POLICY "Autenticados veem pedidos de serviço abertos" ON public.service_requests
    FOR SELECT TO authenticated USING (status = 'pending');

-- Candidaturas: quem oferece o serviço se candidata a um pedido aberto.
CREATE TABLE IF NOT EXISTS public.service_applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_request_id UUID NOT NULL REFERENCES public.service_requests(id) ON DELETE CASCADE,
    applicant_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (service_request_id, applicant_id)
);
CREATE INDEX IF NOT EXISTS service_applications_request_idx ON public.service_applications (service_request_id);
CREATE INDEX IF NOT EXISTS service_applications_applicant_idx ON public.service_applications (applicant_id);

ALTER TABLE public.service_applications ENABLE ROW LEVEL SECURITY;

-- Não pode se candidatar ao próprio pedido.
CREATE POLICY "Candidato se candidata a pedido de outra pessoa" ON public.service_applications FOR INSERT
    WITH CHECK (
        auth.uid() = applicant_id
        AND EXISTS (SELECT 1 FROM public.service_requests sr WHERE sr.id = service_request_id AND sr.requester_id <> auth.uid())
    );
CREATE POLICY "Candidato vê suas candidaturas" ON public.service_applications FOR SELECT USING (auth.uid() = applicant_id);
CREATE POLICY "Dono vê candidaturas do seu pedido" ON public.service_applications FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.service_requests sr WHERE sr.id = service_request_id AND sr.requester_id = auth.uid())
);
CREATE POLICY "Candidato cancela candidatura" ON public.service_applications FOR DELETE USING (auth.uid() = applicant_id);
