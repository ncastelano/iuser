-- "Melhores perfis" agora é sempre do que tem MAIS pontos pro que tem menos. O nível de hierarquia só desempata
-- (empate de pontos: nível mais alto primeiro, depois visitas e avaliação).
CREATE OR REPLACE FUNCTION public.get_best_profiles(p_limit integer DEFAULT 100)
RETURNS TABLE(id uuid, status_level integer, status_name text, points integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT p.id,
           COALESCE(CASE WHEN s.is_active THEN s.level END, 0) AS status_level,
           COALESCE(CASE WHEN s.is_active THEN s.name END, 'Usuário') AS status_name,
           COALESCE(pp.total, 0) AS points
    FROM public.profiles p
    LEFT JOIN public.user_statuses s ON s.id = p.status_id
    LEFT JOIN public.profile_points pp ON pp.profile_id = p.id
    WHERE p.is_active
    ORDER BY COALESCE(pp.total, 0) DESC,
             COALESCE(CASE WHEN s.is_active THEN s.level END, 0) DESC,
             COALESCE(p.view_count, 0) DESC,
             p.ratings_avg DESC NULLS LAST
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 200);
$$;
