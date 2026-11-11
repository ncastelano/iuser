-- ROLLBACK dos NÍVEIS DE LOJA (migration 20261130000056): tira a moldura/nível, devolve get_outdoor e get_store_missions como eram.
-- O estado de descida (store_level_state) e a escada editada SE PERDEM.
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'store-levels-refresh';
    END IF;
END $$;

-- 1) get_outdoor sem a coluna `level` (a assinatura volta a 7 colunas)
DROP FUNCTION IF EXISTS public.get_outdoor(text, integer);
CREATE FUNCTION public.get_outdoor(p_kind text, p_limit integer DEFAULT 12)
RETURNS TABLE(id uuid, slug text, owner_slug text, name text, image text, points integer, rank integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE v_lim integer := LEAST(GREATEST(COALESCE(p_limit, 12), 1), 200);
BEGIN
    IF p_kind NOT IN ('lojas','pessoas','servicos','produtos','digitais','imoveis','motoristas') THEN RETURN; END IF;
    IF p_kind = 'lojas' THEN
        RETURN QUERY
        SELECT s.id, s."storeSlug"::text, NULL::text, s.name::text, s.logo_url::text, round(o.points)::integer,
               (row_number() OVER (ORDER BY o.points DESC, s.id))::integer
        FROM public.outdoor_scores o JOIN public.stores s ON s.id = o.subject_id
        WHERE o.kind = 'lojas' AND o.points > 0 AND s.is_active ORDER BY o.points DESC, s.id LIMIT v_lim;
    ELSIF p_kind = 'pessoas' THEN
        RETURN QUERY
        SELECT p.id, p."profileSlug"::text, NULL::text, p.name::text, p.avatar_url::text, round(t.points)::integer,
               (row_number() OVER (ORDER BY t.points DESC, COALESCE(p.view_count, 0) DESC, p.id))::integer
        FROM public._outdoor_compute('pessoas') t JOIN public.profiles p ON p.id = t.id
        WHERE t.points > 0 AND p."profileSlug" IS NOT NULL ORDER BY t.points DESC, COALESCE(p.view_count, 0) DESC, p.id LIMIT v_lim;
    ELSIF p_kind = 'imoveis' THEN
        RETURN QUERY
        SELECT r.id, r.slug::text, NULL::text, r.title::text, (r.photos)[1]::text, round(o.points)::integer,
               (row_number() OVER (ORDER BY o.points DESC, r.id))::integer
        FROM public.outdoor_scores o JOIN public.rental_listings r ON r.id = o.subject_id
        WHERE o.kind = 'imoveis' AND o.points > 0 AND r.status = 'active' ORDER BY o.points DESC, r.id LIMIT v_lim;
    ELSIF p_kind = 'motoristas' THEN
        RETURN QUERY
        SELECT p.id, v.vehicle_slug::text, NULL::text, p.name::text, p.avatar_url::text, round(o.points)::integer,
               (row_number() OVER (ORDER BY o.points DESC, p.id))::integer
        FROM public.outdoor_scores o
        JOIN public.profiles p ON p.id = o.subject_id AND p.is_active AND NOT COALESCE(p.is_blocked, false)
        JOIN LATERAL (SELECT dv.vehicle_slug FROM public.driver_vehicles dv WHERE dv.driver_id = p.id AND dv.vehicle_slug IS NOT NULL ORDER BY dv.updated_at DESC LIMIT 1) v ON true
        WHERE o.kind = 'motoristas' AND o.points > 0 ORDER BY o.points DESC, p.id LIMIT v_lim;
    ELSE   -- servicos, produtos, digitais
        RETURN QUERY
        SELECT p.id, p.slug::text, COALESCE(s."storeSlug", ow."profileSlug")::text, p.name::text, p.image_url::text, round(o.points)::integer,
               (row_number() OVER (ORDER BY o.points DESC, p.id))::integer
        FROM public.outdoor_scores o JOIN public.products p ON p.id = o.subject_id
        LEFT JOIN public.stores s ON s.id = p.store_id
        LEFT JOIN public.profiles ow ON ow.id = p.owner_id
        WHERE o.kind = p_kind AND o.points > 0 AND p.is_active ORDER BY o.points DESC, p.id LIMIT v_lim;
    END IF;
END; $$;
REVOKE ALL ON FUNCTION public.get_outdoor(text, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.get_outdoor(text, integer) TO anon, authenticated, service_role;

-- 2) get_store_missions sem o bloco `level` (a da 055)
CREATE OR REPLACE FUNCTION public.get_store_missions(p_store uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_owner uuid; v_today date := public._mission_day(); v_missions jsonb; v_today_pts integer; v_today_total integer; v_week integer;
    v_streak integer := 0; v_d date; v_units numeric; v_w numeric; v_max numeric; v_active boolean; v_rank integer; v_of integer; v_store_pts numeric;
BEGIN
    SELECT owner_id INTO v_owner FROM public.stores WHERE id = p_store;
    IF v_owner IS NULL OR v_owner IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'só o dono da loja vê as missões' USING ERRCODE = '42501';
    END IF;
    PERFORM public.evaluate_store_missions(p_store);       -- o que foi cumprido agora já entra no livro

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'code', st.code, 'kind', st.kind, 'title', st.title, 'hint', st.hint, 'points', st.points, 'dest', st.dest, 'done', st.done)
               ORDER BY (st.kind = 'daily') DESC, st.sort_order), '[]'::jsonb),
           COALESCE(sum(st.points) FILTER (WHERE st.kind = 'daily'), 0)
      INTO v_missions, v_today_total
      FROM public._store_mission_status(p_store) st WHERE st.applies;

    SELECT COALESCE(sum(points), 0) INTO v_today_pts FROM public.store_mission_awards WHERE store_id = p_store AND day = v_today;
    SELECT COALESCE(sum(points), 0) INTO v_week FROM public.store_mission_awards WHERE store_id = p_store AND day > v_today - 7;

    -- sequência: dias seguidos com ao menos uma missão do dia cumprida (hoje ainda sem nada não quebra a sequência)
    v_d := v_today;
    IF NOT EXISTS (SELECT 1 FROM public.store_mission_awards WHERE store_id = p_store AND day = v_d) THEN v_d := v_d - 1; END IF;
    WHILE v_streak < 120 AND EXISTS (SELECT 1 FROM public.store_mission_awards WHERE store_id = p_store AND day = v_d) LOOP
        v_streak := v_streak + 1; v_d := v_d - 1;
    END LOOP;

    SELECT COALESCE(sum(units), 0) INTO v_units FROM public._store_mission_units() WHERE store_id = p_store;
    SELECT COALESCE(weight, 0), max_units, COALESCE(is_active, false) INTO v_w, v_max, v_active
      FROM public.outdoor_rules WHERE kind = 'lojas' AND signal = 'missions';
    SELECT COALESCE(points, 0) INTO v_store_pts FROM public.outdoor_scores WHERE kind = 'lojas' AND subject_id = p_store;
    SELECT count(*) + 1 INTO v_rank FROM public.outdoor_scores WHERE kind = 'lojas' AND points > COALESCE(v_store_pts, 0);
    SELECT count(*) INTO v_of FROM public.outdoor_scores WHERE kind = 'lojas';

    RETURN jsonb_build_object(
        'missions', v_missions,
        'today', jsonb_build_object('points', v_today_pts, 'total', v_today_total),
        'week_points', v_week,
        'streak_days', v_streak,
        'outdoor', jsonb_build_object(
            'active', COALESCE(v_active, false),
            'weight', COALESCE(v_w, 0),
            'mission_units', v_units,
            'points_from_missions', CASE WHEN v_active THEN round(COALESCE(v_w, 0) * LEAST(v_units, COALESCE(v_max, v_units)), 1) ELSE 0 END,
            'store_points', round(COALESCE(v_store_pts, 0), 1),
            'rank', v_rank,
            'stores', v_of));
END; $$;
REVOKE ALL ON FUNCTION public.get_store_missions(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_store_missions(uuid) TO authenticated, service_role;

-- 3) o que a migration criou
DROP FUNCTION IF EXISTS public.refresh_store_levels();
DROP FUNCTION IF EXISTS public._store_level_targets();
ALTER TABLE public.stores DROP COLUMN IF EXISTS store_level;
DROP TABLE IF EXISTS public.store_level_state;
DROP TABLE IF EXISTS public.store_level_settings;
DROP TABLE IF EXISTS public.store_levels;
