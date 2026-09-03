-- Pedidos de corrida (motorista particular): ir a algum lugar, buscar/levar
-- alguém, ou entregar algo. Sem sistema de despacho ainda — só registra o
-- pedido (status pending) pra atender manualmente enquanto o recurso é "em breve".
CREATE TABLE IF NOT EXISTS public.ride_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requester_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    ride_type TEXT NOT NULL CHECK (ride_type IN ('para-mim', 'buscar-alguem', 'entregar-algo')),
    origin_address TEXT NOT NULL,
    destination_address TEXT NOT NULL,
    for_whom TEXT,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'completed', 'cancelled')),
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ride_requests_requester_idx ON public.ride_requests (requester_id);

ALTER TABLE public.ride_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Usuário vê seus próprios pedidos de corrida" ON public.ride_requests FOR SELECT USING (auth.uid() = requester_id);
CREATE POLICY "Usuário cria seus próprios pedidos de corrida" ON public.ride_requests FOR INSERT WITH CHECK (auth.uid() = requester_id);

-- Candidaturas pra ser parceiro (motorista, entregador ou qualquer outro
-- serviço prestado com uma ferramenta própria).
CREATE TABLE IF NOT EXISTS public.partner_applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    applicant_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    service_type TEXT NOT NULL CHECK (service_type IN ('motorista', 'entregador', 'outro')),
    custom_service TEXT,
    city TEXT NOT NULL,
    whatsapp TEXT NOT NULL,
    tool_description TEXT,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS partner_applications_applicant_idx ON public.partner_applications (applicant_id);

ALTER TABLE public.partner_applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Usuário vê suas próprias candidaturas" ON public.partner_applications FOR SELECT USING (auth.uid() = applicant_id);
CREATE POLICY "Usuário cria suas próprias candidaturas" ON public.partner_applications FOR INSERT WITH CHECK (auth.uid() = applicant_id);
