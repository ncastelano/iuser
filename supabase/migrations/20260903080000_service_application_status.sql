-- Quem pediu o serviço pode aceitar ou recusar cada candidato.
ALTER TABLE public.service_applications
    ADD COLUMN status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected'));

CREATE POLICY "Dono decide candidaturas do seu pedido" ON public.service_applications FOR UPDATE
    USING (EXISTS (SELECT 1 FROM public.service_requests sr WHERE sr.id = service_request_id AND sr.requester_id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM public.service_requests sr WHERE sr.id = service_request_id AND sr.requester_id = auth.uid()));
