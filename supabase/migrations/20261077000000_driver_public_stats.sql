-- Números públicos de um motorista, pra página do veículo (cliente): corridas feitas, avaliação, desde quando está no
-- iUser e se tem loja. Só agregados e nomes públicos: nenhuma corrida individual é exposta.
CREATE OR REPLACE FUNCTION public.get_driver_public_stats(p_driver uuid)
RETURNS TABLE(
    rides_completed bigint, rating_avg numeric, rating_count bigint, member_since timestamptz,
    store_name text, store_slug text, store_logo text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT
        (SELECT count(*) FROM public.ride_requests r WHERE r.driver_id = p_driver AND r.status = 'completed'),
        (SELECT round(avg(rv.rating)::numeric, 2) FROM public.ride_reviews rv WHERE rv.reviewee_id = p_driver),
        (SELECT count(*) FROM public.ride_reviews rv WHERE rv.reviewee_id = p_driver),
        (SELECT p.created_at FROM public.profiles p WHERE p.id = p_driver),
        s.name, s."storeSlug", s.logo_url
    FROM (SELECT 1) one
    LEFT JOIN LATERAL (
        SELECT name, "storeSlug", logo_url FROM public.stores
        WHERE owner_id = p_driver AND is_active ORDER BY created_at LIMIT 1
    ) s ON true;
$$;
REVOKE ALL ON FUNCTION public.get_driver_public_stats(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_driver_public_stats(uuid) TO anon, authenticated;
