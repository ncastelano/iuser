-- "Chamar este motorista": o pedido de corrida pode nomear o motorista preferido (quem abriu a página dele).
-- Todos os motoristas continuam vendo o pedido; o escolhido recebe um aviso direto e o pedido aparece com o selo
-- "Chamou você". Quem decide continua sendo o cliente (escolhe entre os candidatos).
ALTER TABLE public.ride_requests ADD COLUMN IF NOT EXISTS preferred_driver_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS ride_requests_preferred_driver_idx ON public.ride_requests (preferred_driver_id) WHERE preferred_driver_id IS NOT NULL;

-- Corridas recentes de um motorista, sem endereço nem nome de quem pediu: data, distância e valor combinado.
CREATE OR REPLACE FUNCTION public.get_driver_recent_rides(p_driver uuid, p_limit integer DEFAULT 6)
RETURNS TABLE(ride_id uuid, rode_at timestamptz, distance_km numeric, price numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT r.id,
           COALESCE(r.ride_started_at, r.created_at),
           r.distance_km,
           COALESCE((SELECT a.proposed_price FROM public.ride_applications a
                     WHERE a.ride_request_id = r.id AND a.applicant_id = p_driver LIMIT 1), r.offered_price)
    FROM public.ride_requests r
    WHERE r.driver_id = p_driver AND r.status = 'completed'
    ORDER BY COALESCE(r.ride_started_at, r.created_at) DESC
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 6), 20));
$$;
REVOKE ALL ON FUNCTION public.get_driver_recent_rides(uuid, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.get_driver_recent_rides(uuid, integer) TO anon, authenticated;
