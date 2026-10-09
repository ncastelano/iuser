-- Os pontos sobem o perfil na hierarquia sozinhos. Cada status (Líder, Supervisor, Gestor...) pode ter `min_points`:
-- ao chegar nesse total, a pessoa sobe pra ele. Só sobe, nunca desce (como a graduação); `min_points` vazio = só o admin concede.
-- O Administrador (nível 4 ou mais) NUNCA é automático. O admin ajusta os números em Admin → Pontuação.

ALTER TABLE public.user_statuses ADD COLUMN IF NOT EXISTS min_points integer CHECK (min_points IS NULL OR min_points > 0);

-- Valores iniciais (editáveis). O Gestor fica manual de propósito: concede a maioria dos benefícios.
UPDATE public.user_statuses SET min_points = 500  WHERE slug = 'lider'      AND min_points IS NULL;
UPDATE public.user_statuses SET min_points = 1500 WHERE slug = 'supervisor' AND min_points IS NULL;

-- Sobe a pessoa pro maior status que os pontos dela alcançam (e que seja MAIOR que o atual)
CREATE OR REPLACE FUNCTION public._apply_points_promotion(p_profile uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_total integer; v_cur_level integer; v_cur_status uuid; v_target public.user_statuses;
BEGIN
    SELECT total INTO v_total FROM public.profile_points WHERE profile_id = p_profile;
    IF COALESCE(v_total, 0) <= 0 THEN RETURN; END IF;

    SELECT p.status_id, COALESCE(CASE WHEN s.is_active THEN s.level END, 0)
      INTO v_cur_status, v_cur_level
      FROM public.profiles p LEFT JOIN public.user_statuses s ON s.id = p.status_id
     WHERE p.id = p_profile;

    SELECT * INTO v_target FROM public.user_statuses
     WHERE is_active AND min_points IS NOT NULL AND min_points <= v_total AND level < 4 AND level > COALESCE(v_cur_level, 0)
     ORDER BY level DESC LIMIT 1;
    IF NOT FOUND THEN RETURN; END IF;

    UPDATE public.profiles SET status_id = v_target.id WHERE id = p_profile;
    INSERT INTO public.system_logs (actor_id, target_user_id, action, entity, entity_id, old_value, new_value, reason)
    VALUES (NULL, p_profile, 'points_promotion', 'user_status', v_target.id,
            jsonb_build_object('status_id', v_cur_status, 'level', v_cur_level),
            jsonb_build_object('status_id', v_target.id, 'status', v_target.name, 'level', v_target.level),
            'Chegou a ' || v_total || ' pontos');
END; $$;
REVOKE ALL ON FUNCTION public._apply_points_promotion(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._apply_points_promotion(uuid) TO service_role;

-- Depois de mudar os números no admin: reavalia todo mundo que tem pontos
CREATE OR REPLACE FUNCTION public.recheck_points_promotions()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_changed integer := 0;
BEGIN
    FOR r IN SELECT profile_id FROM public.profile_points WHERE total > 0 LOOP
        PERFORM public._apply_points_promotion(r.profile_id);
    END LOOP;
    SELECT count(*) INTO v_changed FROM public.system_logs WHERE action = 'points_promotion' AND created_at >= now() - interval '1 minute';
    RETURN v_changed;
END; $$;
REVOKE ALL ON FUNCTION public.recheck_points_promotions() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recheck_points_promotions() TO service_role;

-- Cada ponto novo reavalia a promoção
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
        PERFORM public._apply_points_promotion(p_profile);
    END IF;
END; $$;

-- "Minha pontuação": nível atual e quanto falta pro próximo
CREATE OR REPLACE FUNCTION public.get_my_points()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT jsonb_build_object(
        'total', COALESCE((SELECT total FROM public.profile_points WHERE profile_id = auth.uid()), 0),
        'rules', COALESCE((SELECT jsonb_agg(jsonb_build_object('action', r.action, 'label', r.label, 'description', r.description,
                    'points', r.points, 'daily_limit', r.daily_limit) ORDER BY r.sort_order) FROM public.point_rules r WHERE r.is_active AND r.points > 0), '[]'::jsonb),
        'by_action', COALESCE((SELECT jsonb_agg(jsonb_build_object('action', e.action, 'times', e.times, 'points', e.pts)) FROM (
                    SELECT action, count(*) AS times, sum(points) AS pts FROM public.profile_points_events WHERE profile_id = auth.uid() GROUP BY action) e), '[]'::jsonb),
        'level', (SELECT jsonb_build_object('name', COALESCE(CASE WHEN s.is_active THEN s.name END, 'Usuário'), 'level', COALESCE(CASE WHEN s.is_active THEN s.level END, 0))
                    FROM public.profiles p LEFT JOIN public.user_statuses s ON s.id = p.status_id WHERE p.id = auth.uid()),
        'next', (SELECT jsonb_build_object('name', n.name, 'min_points', n.min_points)
                    FROM public.user_statuses n
                   WHERE n.is_active AND n.min_points IS NOT NULL AND n.level < 4
                     AND n.level > COALESCE((SELECT CASE WHEN s.is_active THEN s.level END FROM public.profiles p LEFT JOIN public.user_statuses s ON s.id = p.status_id WHERE p.id = auth.uid()), 0)
                   ORDER BY n.level LIMIT 1)
    ) WHERE auth.uid() IS NOT NULL;
$$;
