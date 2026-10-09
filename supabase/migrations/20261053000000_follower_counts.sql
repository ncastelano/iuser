-- Quantos seguidores cada perfil tem, em lote (cartões do /social): uma chamada em vez de uma contagem por perfil.
CREATE OR REPLACE FUNCTION public.get_follower_counts(p_ids uuid[])
RETURNS TABLE (profile_id uuid, followers bigint)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
    SELECT f.following_id, count(*)::bigint
    FROM public.follows f
    WHERE f.following_id = ANY(p_ids)
    GROUP BY f.following_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_follower_counts(uuid[]) TO anon, authenticated;
