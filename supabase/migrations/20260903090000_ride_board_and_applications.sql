-- Quadro de vagas pra pedidos de motorista, mesmo padrão de service_requests:
-- qualquer autenticado pode ver pedidos abertos (além do dono já poder ver
-- os seus, de qualquer status, pela policy existente), e se candidatar.
CREATE POLICY "Autenticados veem pedidos de motorista abertos" ON public.ride_requests
    FOR SELECT TO authenticated USING (status = 'pending');

CREATE TABLE IF NOT EXISTS public.ride_applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ride_request_id UUID NOT NULL REFERENCES public.ride_requests(id) ON DELETE CASCADE,
    applicant_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (ride_request_id, applicant_id)
);
CREATE INDEX IF NOT EXISTS ride_applications_request_idx ON public.ride_applications (ride_request_id);
CREATE INDEX IF NOT EXISTS ride_applications_applicant_idx ON public.ride_applications (applicant_id);

ALTER TABLE public.ride_applications ENABLE ROW LEVEL SECURITY;

-- Não pode se candidatar ao próprio pedido.
CREATE POLICY "Candidato se candidata a pedido de motorista de outra pessoa" ON public.ride_applications FOR INSERT
    WITH CHECK (
        auth.uid() = applicant_id
        AND EXISTS (SELECT 1 FROM public.ride_requests rr WHERE rr.id = ride_request_id AND rr.requester_id <> auth.uid())
    );
CREATE POLICY "Candidato vê suas candidaturas de motorista" ON public.ride_applications FOR SELECT USING (auth.uid() = applicant_id);
CREATE POLICY "Dono vê candidaturas do seu pedido de motorista" ON public.ride_applications FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.ride_requests rr WHERE rr.id = ride_request_id AND rr.requester_id = auth.uid())
);
CREATE POLICY "Candidato cancela candidatura de motorista" ON public.ride_applications FOR DELETE USING (auth.uid() = applicant_id);
CREATE POLICY "Dono decide candidaturas do seu pedido de motorista" ON public.ride_applications FOR UPDATE
    USING (EXISTS (SELECT 1 FROM public.ride_requests rr WHERE rr.id = ride_request_id AND rr.requester_id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM public.ride_requests rr WHERE rr.id = ride_request_id AND rr.requester_id = auth.uid()));
