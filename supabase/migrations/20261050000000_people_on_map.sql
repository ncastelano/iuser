-- Radar → filtro "Pessoas": quem escolheu aparecer no mapa. Só entra quem mostra a localização no perfil E ligou
-- "Aparecer no mapa". A posição é a de tempo real (se ligada e recente) ou a do endereço salvo, arredondada (~100 m).
CREATE OR REPLACE FUNCTION public.get_people_on_map(p_limit integer DEFAULT 200)
RETURNS TABLE(id uuid, name text, profile_slug text, avatar_url text, lat double precision, lng double precision, is_live boolean, points integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT p.id, p.name, p."profileSlug", p.avatar_url,
           round(COALESCE(CASE WHEN live.ok THEN live.lat END, p.store_lat)::numeric, 3)::double precision,
           round(COALESCE(CASE WHEN live.ok THEN live.lng END, p.store_lng)::numeric, 3)::double precision,
           COALESCE(live.ok, false),
           COALESCE(pp.total, 0)
    FROM public.profiles p
    LEFT JOIN public.profile_points pp ON pp.profile_id = p.id
    LEFT JOIN LATERAL (
        SELECT true AS ok, l.lat, l.lng FROM public.profile_live_location l
        WHERE l.profile_id = p.id AND p.live_location AND l.updated_at > now() - interval '6 hours'
    ) live ON true
    WHERE p.is_active
      AND COALESCE(p.show_location, true)
      AND p.show_on_map
      AND COALESCE(CASE WHEN live.ok THEN live.lat END, p.store_lat) IS NOT NULL
      AND COALESCE(CASE WHEN live.ok THEN live.lng END, p.store_lng) IS NOT NULL
      AND p.id IS DISTINCT FROM auth.uid()
    ORDER BY COALESCE(pp.total, 0) DESC
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 200), 1), 300);
$$;
REVOKE ALL ON FUNCTION public.get_people_on_map(integer) FROM public;
GRANT EXECUTE ON FUNCTION public.get_people_on_map(integer) TO anon, authenticated, service_role;
