-- Onde o serviço vai acontecer, de verdade: a coordenada EXATA do pedido fica numa tabela PRIVADA (service_request_private). Só quem pediu e o
-- profissional que o cliente ESCOLHEU (candidatura aceita) a recebem, por get_service_request_location. A lista pública continua só com a posição
-- aproximada (service_requests.approx_*, ~1 km) e o endereço sem número na tela. Rollback: supabase/rollbacks/service_request_exact_location_rollback.sql.
CREATE TABLE IF NOT EXISTS public.service_request_private (
    request_id uuid PRIMARY KEY REFERENCES public.service_requests(id) ON DELETE CASCADE,
    lat double precision NOT NULL CHECK (lat BETWEEN -90 AND 90),
    lng double precision NOT NULL CHECK (lng BETWEEN -180 AND 180)
);
ALTER TABLE public.service_request_private ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.service_request_private FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_request_private TO authenticated;

-- Só quem pediu mexe (e lê) na própria coordenada; ninguém mais lê direto
DROP POLICY IF EXISTS "Quem pediu cuida da coordenada exata" ON public.service_request_private;
CREATE POLICY "Quem pediu cuida da coordenada exata" ON public.service_request_private FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.service_requests r WHERE r.id = request_id AND r.requester_id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM public.service_requests r WHERE r.id = request_id AND r.requester_id = auth.uid()));

-- A localização completa (endereço + coordenada exata): para quem pediu e para o profissional ESCOLHIDO por ele
CREATE OR REPLACE FUNCTION public.get_service_request_location(p_request uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := auth.uid(); r public.service_requests; p public.service_request_private;
BEGIN
    IF v_user IS NULL THEN RETURN NULL; END IF;
    SELECT * INTO r FROM public.service_requests WHERE id = p_request;
    IF NOT FOUND THEN RETURN NULL; END IF;
    IF r.requester_id <> v_user AND NOT EXISTS (
        SELECT 1 FROM public.service_applications a WHERE a.service_request_id = p_request AND a.applicant_id = v_user AND a.status = 'accepted'
    ) THEN RETURN NULL; END IF;
    SELECT * INTO p FROM public.service_request_private WHERE request_id = p_request;
    RETURN jsonb_build_object('address', r.location_address, 'lat', p.lat, 'lng', p.lng,
                              'needs_access', r.location_needs_access, 'access_notes', r.location_access_notes);
END; $$;
REVOKE ALL ON FUNCTION public.get_service_request_location(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_service_request_location(uuid) TO authenticated;
