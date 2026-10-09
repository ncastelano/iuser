-- Decisão: "Melhores perfis" é SÓ pontuação (do maior pro menor). A hierarquia sai do ranking e os pontos NÃO
-- promovem ninguém de nível. Desfaz a promoção automática (20261041) e tira o nível do ranking.

DROP FUNCTION IF EXISTS public.recheck_points_promotions();
DROP FUNCTION IF EXISTS public._apply_points_promotion(uuid);
ALTER TABLE public.user_statuses DROP COLUMN IF EXISTS min_points;

-- _award_points volta a só dar os pontos
CREATE OR REPLACE FUNCTION public._award_points(p_profile uuid, p_action text, p_ref text, p_at timestamptz DEFAULT now(), p_enforce_limit boolean DEFAULT true)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.point_rules; v_today int; v_new int;
BEGIN
    IF p_profile IS NULL THEN RETURN; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_profile) THEN RETURN; END IF;
    SELECT * INTO r FROM public.point_rules WHERE action = p_action;
    IF NOT FOUND OR NOT r.is_active OR r.points <= 0 THEN RETURN; END IF;

    IF p_enforce_limit AND r.daily_limit IS NOT NULL THEN
        SELECT count(*) INTO v_today FROM public.profile_points_events
         WHERE profile_id = p_profile AND action = p_action AND created_at >= date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo';
        IF v_today >= r.daily_limit THEN RETURN; END IF;
    END IF;

    INSERT INTO public.profile_points_events (profile_id, action, points, ref, created_at) VALUES (p_profile, p_action, r.points, p_ref, p_at)
    ON CONFLICT (profile_id, action, ref) DO NOTHING;
    GET DIAGNOSTICS v_new = ROW_COUNT;
    IF v_new > 0 THEN
        INSERT INTO public.profile_points (profile_id, total) VALUES (p_profile, r.points)
        ON CONFLICT (profile_id) DO UPDATE SET total = public.profile_points.total + EXCLUDED.total, updated_at = now();
    END IF;
END; $$;

-- Ranking só por pontos (empate: visitas, depois avaliação)
DROP FUNCTION IF EXISTS public.get_best_profiles(integer);
CREATE FUNCTION public.get_best_profiles(p_limit integer DEFAULT 100)
RETURNS TABLE(id uuid, points integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT p.id, COALESCE(pp.total, 0) AS points
    FROM public.profiles p
    LEFT JOIN public.profile_points pp ON pp.profile_id = p.id
    WHERE p.is_active
    ORDER BY COALESCE(pp.total, 0) DESC, COALESCE(p.view_count, 0) DESC, p.ratings_avg DESC NULLS LAST
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 200);
$$;
REVOKE ALL ON FUNCTION public.get_best_profiles(integer) FROM public;
GRANT EXECUTE ON FUNCTION public.get_best_profiles(integer) TO anon, authenticated, service_role;

DROP FUNCTION IF EXISTS public.get_profiles_ranking_info(uuid[]);
CREATE FUNCTION public.get_profiles_ranking_info(p_ids uuid[])
RETURNS TABLE(id uuid, points integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT p.id, COALESCE(pp.total, 0)
    FROM public.profiles p
    LEFT JOIN public.profile_points pp ON pp.profile_id = p.id
    WHERE p.id = ANY (p_ids[1:200]);
$$;
REVOKE ALL ON FUNCTION public.get_profiles_ranking_info(uuid[]) FROM public;
GRANT EXECUTE ON FUNCTION public.get_profiles_ranking_info(uuid[]) TO anon, authenticated, service_role;

-- "Minha pontuação" sem nível
CREATE OR REPLACE FUNCTION public.get_my_points()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT jsonb_build_object(
        'total', COALESCE((SELECT total FROM public.profile_points WHERE profile_id = auth.uid()), 0),
        'rules', COALESCE((SELECT jsonb_agg(jsonb_build_object('action', r.action, 'label', r.label, 'description', r.description,
                    'points', r.points, 'daily_limit', r.daily_limit) ORDER BY r.sort_order) FROM public.point_rules r WHERE r.is_active AND r.points > 0), '[]'::jsonb),
        'by_action', COALESCE((SELECT jsonb_agg(jsonb_build_object('action', e.action, 'times', e.times, 'points', e.pts)) FROM (
                    SELECT action, count(*) AS times, sum(points) AS pts FROM public.profile_points_events WHERE profile_id = auth.uid() GROUP BY action) e), '[]'::jsonb)
    ) WHERE auth.uid() IS NOT NULL;
$$;
