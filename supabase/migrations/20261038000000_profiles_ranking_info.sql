-- Nível de hierarquia e pontos de uma lista de perfis (pra mostrar nos cartões do /social em qualquer aba)
CREATE OR REPLACE FUNCTION public.get_profiles_ranking_info(p_ids uuid[])
RETURNS TABLE(id uuid, status_level integer, status_name text, points integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT p.id,
           COALESCE(CASE WHEN s.is_active THEN s.level END, 0),
           COALESCE(CASE WHEN s.is_active THEN s.name END, 'Usuário'),
           COALESCE(pp.total, 0)
    FROM public.profiles p
    LEFT JOIN public.user_statuses s ON s.id = p.status_id
    LEFT JOIN public.profile_points pp ON pp.profile_id = p.id
    WHERE p.id = ANY (p_ids[1:200]);
$$;
REVOKE ALL ON FUNCTION public.get_profiles_ranking_info(uuid[]) FROM public;
GRANT EXECUTE ON FUNCTION public.get_profiles_ranking_info(uuid[]) TO anon, authenticated, service_role;
