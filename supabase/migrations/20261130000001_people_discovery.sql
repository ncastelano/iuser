-- Descoberta de PESSOAS (página /pessoas da 3.0): "locais com mais pessoas" e "pessoas em um local".
-- Só entra quem ESCOLHEU aparecer (show_on_map, o "Visível no Radar") e deixou o local público (show_location); o local é só o BAIRRO
-- (profiles.public_address). Devolve só nome, @, foto e pontos — nada de endereço, coordenada ou telefone.
-- Rollback: supabase/rollbacks/people_discovery_rollback.sql

CREATE OR REPLACE FUNCTION public.get_people_places(p_limit integer DEFAULT 8)
RETURNS TABLE (place text, people_count integer, avatars text[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT p.public_address,
           count(*)::int,
           (array_agg(p.avatar_url ORDER BY COALESCE(pp.total, 0) DESC) FILTER (WHERE p.avatar_url IS NOT NULL))[1:5]
      FROM public.profiles p
      LEFT JOIN public.profile_points pp ON pp.profile_id = p.id
     WHERE p.is_active AND NOT COALESCE(p.is_blocked, false)
       AND COALESCE(p.show_location, true) AND p.show_on_map
       AND p.public_address IS NOT NULL AND btrim(p.public_address) <> ''
     GROUP BY p.public_address
     ORDER BY count(*) DESC, p.public_address
     LIMIT LEAST(GREATEST(COALESCE(p_limit, 8), 1), 20);
$$;

CREATE OR REPLACE FUNCTION public.get_people_in_place(p_place text, p_limit integer DEFAULT 24)
RETURNS TABLE (id uuid, name text, profile_slug text, avatar_url text, points integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT p.id, p.name, p."profileSlug", p.avatar_url, COALESCE(pp.total, 0)
      FROM public.profiles p
      LEFT JOIN public.profile_points pp ON pp.profile_id = p.id
     WHERE p.is_active AND NOT COALESCE(p.is_blocked, false)
       AND COALESCE(p.show_location, true) AND p.show_on_map
       AND p.public_address = p_place
     ORDER BY COALESCE(pp.total, 0) DESC, p.name
     LIMIT LEAST(GREATEST(COALESCE(p_limit, 24), 1), 60);
$$;

GRANT EXECUTE ON FUNCTION public.get_people_places(integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_people_in_place(text, integer) TO anon, authenticated;
