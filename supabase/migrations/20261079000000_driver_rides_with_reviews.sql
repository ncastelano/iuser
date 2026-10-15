-- Corridas recentes de um motorista COM o que disseram dela (avaliação + comentário) e de onde pra onde foi.
-- Mostra o conteúdo que o próprio cliente publicou (avaliação pública) e o trajeto; o valor combinado NÃO sai daqui.
DROP FUNCTION IF EXISTS public.get_driver_recent_rides(uuid, integer);
CREATE OR REPLACE FUNCTION public.get_driver_recent_rides(p_driver uuid, p_limit integer DEFAULT 6)
RETURNS TABLE(
    ride_id uuid, rode_at timestamptz, distance_km numeric, origin_address text, destination_address text,
    rating integer, comment text, reviewer_name text, reviewer_slug text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT r.id,
           COALESCE(r.ride_started_at, r.created_at),
           r.distance_km,
           r.origin_address,
           r.destination_address,
           rv.rating,
           NULLIF(btrim(rv.comment), ''),
           p.name,
           p."profileSlug"
    FROM public.ride_requests r
    LEFT JOIN public.ride_reviews rv ON rv.ride_request_id = r.id AND rv.reviewee_id = p_driver
    LEFT JOIN public.profiles p ON p.id = rv.reviewer_id
    WHERE r.driver_id = p_driver AND r.status = 'completed'
    ORDER BY COALESCE(r.ride_started_at, r.created_at) DESC
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 6), 20));
$$;
REVOKE ALL ON FUNCTION public.get_driver_recent_rides(uuid, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.get_driver_recent_rides(uuid, integer) TO anon, authenticated;
