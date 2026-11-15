-- NÍVEIS DE LOJA (borda do logo): a loja ganha um NÍVEL conforme os pontos que tem no Outdoor de lojas (`outdoor_scores`, kind 'lojas').
--
--  • `store_levels` = a escada (nome, pontos mínimos, cores, se a moldura é animada), editada pelo admin. Leitura pública (nomes e cores não são segredo).
--  • O nível ATUAL de cada loja fica em `stores.store_level` (coluna PÚBLICA, só leitura para o app: quem grava é `refresh_store_levels()`),
--    assim toda tela que já lê a loja (STORE_PUBLIC_SELECT) recebe o nível sem consulta extra.
--  • SOBE na hora (chegou aos pontos do nível, sobe); DESCE só UM degrau por vez e só depois de `drop_after_days` (7) dias seguidos abaixo
--    da linha do nível atual (a loja não perde a moldura por uma semana ruim). O estado do relógio fica em `store_level_state`.
--  • Loja inativa, dona bloqueada ou regra desligada (`store_level_settings.enabled`) = nível 0 na vista pública (o estado guardado não se perde).
--  • `get_outdoor` passa a devolver o nível da loja; `get_store_missions` passa a devolver o nível, os pontos e o que falta para o próximo.
-- Tudo só pelas funções e pelo servidor (tabelas de estado e de regra sem acesso do app). Rollback: supabase/rollbacks/store_levels_rollback.sql

-- ===== 1. A escada =====
CREATE TABLE IF NOT EXISTS public.store_levels (
    level       smallint PRIMARY KEY CHECK (level BETWEEN 0 AND 9),
    name        text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 24),
    min_points  integer NOT NULL CHECK (min_points >= 0),
    colors      text[] NOT NULL DEFAULT '{}' CHECK (array_length(colors, 1) IS NULL OR array_length(colors, 1) BETWEEN 1 AND 6),   -- vazio = sem moldura
    animated    boolean NOT NULL DEFAULT false,
    description text,
    is_active   boolean NOT NULL DEFAULT true,
    updated_at  timestamptz NOT NULL DEFAULT now(),
    updated_by  uuid
);
ALTER TABLE public.store_levels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS store_levels_read ON public.store_levels;
CREATE POLICY store_levels_read ON public.store_levels FOR SELECT TO anon, authenticated USING (is_active);
REVOKE ALL ON public.store_levels FROM anon, authenticated;
GRANT SELECT ON public.store_levels TO anon, authenticated;

INSERT INTO public.store_levels (level, name, min_points, colors, animated, description) VALUES
    (0, 'Iniciante', 0,    '{}',                                         false, 'Sem moldura: o logo limpo.'),
    (1, 'Ativa',     100,  '{#22c55e}',                                  false, 'Fio verde.'),
    (2, 'Destaque',  500,  '{#38bdf8,#3b82f6,#6366f1}',                  false, 'Degradê azul-violeta.'),
    (3, 'Estrela',   1500, '{#a855f7,#ec4899,#f472b6}',                  false, 'Degradê rosa, anel duplo e brilho.'),
    (4, 'Lenda',     4000, '{#f97316,#ef4444,#fbbf24,#f97316}',          true,  'Chama laranja que gira devagar e coroa.')
ON CONFLICT (level) DO NOTHING;

-- ===== 2. Regra de descida (uma linha só) e estado de cada loja =====
CREATE TABLE IF NOT EXISTS public.store_level_settings (
    id              boolean PRIMARY KEY DEFAULT true CHECK (id),
    enabled         boolean NOT NULL DEFAULT true,
    drop_after_days integer NOT NULL DEFAULT 7 CHECK (drop_after_days BETWEEN 1 AND 90),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    updated_by      uuid
);
INSERT INTO public.store_level_settings (id) VALUES (true) ON CONFLICT DO NOTHING;
ALTER TABLE public.store_level_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.store_level_settings FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.store_level_state (
    store_id    uuid PRIMARY KEY REFERENCES public.stores(id) ON DELETE CASCADE,
    level       smallint NOT NULL DEFAULT 0,
    below_since timestamptz,                -- desde quando os pontos estão abaixo da linha do nível atual (NULL = não está)
    updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.store_level_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.store_level_state FROM anon, authenticated;

-- ===== 3. A coluna pública da loja (só LEITURA para o app; nenhum GRANT UPDATE) =====
DO $$
DECLARE
    level_cols text[] := ARRAY['store_level'];
    cols text;
BEGIN
    ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS store_level smallint NOT NULL DEFAULT 0;
    SELECT string_agg(quote_ident(x), ', ') INTO cols FROM unnest(level_cols) x;
    EXECUTE format('GRANT SELECT (%s) ON public.stores TO anon, authenticated', cols);
END $$;

-- ===== 4. O cálculo (a cada 5 min, logo depois dos pontos do Outdoor) =====
-- nível-ALVO de cada loja ativa: o maior cujo mínimo os pontos do Outdoor alcançam
CREATE OR REPLACE FUNCTION public._store_level_targets()
RETURNS TABLE(store_id uuid, t smallint) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT st.id, COALESCE((SELECT max(l.level) FROM public.store_levels l WHERE l.is_active AND l.min_points <= COALESCE(o.points, 0)), 0)::smallint
      FROM public.stores st
      LEFT JOIN public.outdoor_scores o ON o.kind = 'lojas' AND o.subject_id = st.id
     WHERE st.is_active
$$;
REVOKE ALL ON FUNCTION public._store_level_targets() FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.refresh_store_levels()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.store_level_settings; v_interval interval; n integer;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('refresh_store_levels'));
    SELECT * INTO s FROM public.store_level_settings WHERE id;
    v_interval := make_interval(days => s.drop_after_days);

    -- loja nova no sistema entra JÁ no nível do alvo (a regra de descida só vale para quem já teve um nível)
    INSERT INTO public.store_level_state (store_id, level, below_since)
    SELECT t.store_id, t.t, NULL FROM public._store_level_targets() t ON CONFLICT (store_id) DO NOTHING;

    -- sobe na hora; desce 1 degrau por vez, depois de `drop_after_days` abaixo da linha (e o relógio recomeça a cada degrau)
    UPDATE public.store_level_state sl SET
        level = CASE WHEN t.t > sl.level THEN t.t
                     WHEN t.t < sl.level AND sl.below_since IS NOT NULL AND now() - sl.below_since >= v_interval THEN sl.level - 1
                     ELSE sl.level END,
        below_since = CASE WHEN t.t >= sl.level THEN NULL
                           WHEN sl.below_since IS NULL THEN now()
                           WHEN now() - sl.below_since >= v_interval THEN now()
                           ELSE sl.below_since END,
        updated_at = now()
      FROM public._store_level_targets() t
     WHERE t.store_id = sl.store_id
       AND (t.t > sl.level
            OR (t.t < sl.level AND (sl.below_since IS NULL OR now() - sl.below_since >= v_interval))
            OR (t.t = sl.level AND sl.below_since IS NOT NULL));

    -- vista pública: só o que mudou (inativa, dona bloqueada ou regra desligada = 0)
    UPDATE public.stores st SET store_level = x.lvl
      FROM (SELECT st2.id,
                   (CASE WHEN s.enabled AND st2.is_active AND NOT COALESCE(pr.is_blocked, false) AND COALESCE(pr.is_active, true) THEN COALESCE(sl.level, 0) ELSE 0 END)::smallint AS lvl
              FROM public.stores st2
              LEFT JOIN public.store_level_state sl ON sl.store_id = st2.id
              LEFT JOIN public.profiles pr ON pr.id = st2.owner_id) x
     WHERE x.id = st.id AND st.store_level IS DISTINCT FROM x.lvl;
    GET DIAGNOSTICS n = ROW_COUNT;
    RETURN n;
END; $$;
REVOKE ALL ON FUNCTION public.refresh_store_levels() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_store_levels() TO service_role;

-- ===== 5. get_outdoor: o nível da loja vem junto (a mesma função, com UMA coluna a mais no fim) =====
DROP FUNCTION IF EXISTS public.get_outdoor(text, integer);
CREATE FUNCTION public.get_outdoor(p_kind text, p_limit integer DEFAULT 12)
RETURNS TABLE(id uuid, slug text, owner_slug text, name text, image text, points integer, rank integer, level integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE v_lim integer := LEAST(GREATEST(COALESCE(p_limit, 12), 1), 200);
BEGIN
    IF p_kind NOT IN ('lojas','pessoas','servicos','produtos','digitais','imoveis','motoristas') THEN RETURN; END IF;
    IF p_kind = 'lojas' THEN
        RETURN QUERY
        SELECT s.id, s."storeSlug"::text, NULL::text, s.name::text, s.logo_url::text, round(o.points)::integer,
               (row_number() OVER (ORDER BY o.points DESC, s.id))::integer, s.store_level::integer
        FROM public.outdoor_scores o JOIN public.stores s ON s.id = o.subject_id
        WHERE o.kind = 'lojas' AND o.points > 0 AND s.is_active ORDER BY o.points DESC, s.id LIMIT v_lim;
    ELSIF p_kind = 'pessoas' THEN
        RETURN QUERY
        SELECT p.id, p."profileSlug"::text, NULL::text, p.name::text, p.avatar_url::text, round(t.points)::integer,
               (row_number() OVER (ORDER BY t.points DESC, COALESCE(p.view_count, 0) DESC, p.id))::integer, 0
        FROM public._outdoor_compute('pessoas') t JOIN public.profiles p ON p.id = t.id
        WHERE t.points > 0 AND p."profileSlug" IS NOT NULL ORDER BY t.points DESC, COALESCE(p.view_count, 0) DESC, p.id LIMIT v_lim;
    ELSIF p_kind = 'imoveis' THEN
        RETURN QUERY
        SELECT r.id, r.slug::text, NULL::text, r.title::text, (r.photos)[1]::text, round(o.points)::integer,
               (row_number() OVER (ORDER BY o.points DESC, r.id))::integer, 0
        FROM public.outdoor_scores o JOIN public.rental_listings r ON r.id = o.subject_id
        WHERE o.kind = 'imoveis' AND o.points > 0 AND r.status = 'active' ORDER BY o.points DESC, r.id LIMIT v_lim;
    ELSIF p_kind = 'motoristas' THEN
        RETURN QUERY
        SELECT p.id, v.vehicle_slug::text, NULL::text, p.name::text, p.avatar_url::text, round(o.points)::integer,
               (row_number() OVER (ORDER BY o.points DESC, p.id))::integer, 0
        FROM public.outdoor_scores o
        JOIN public.profiles p ON p.id = o.subject_id AND p.is_active AND NOT COALESCE(p.is_blocked, false)
        JOIN LATERAL (SELECT dv.vehicle_slug FROM public.driver_vehicles dv WHERE dv.driver_id = p.id AND dv.vehicle_slug IS NOT NULL ORDER BY dv.updated_at DESC LIMIT 1) v ON true
        WHERE o.kind = 'motoristas' AND o.points > 0 ORDER BY o.points DESC, p.id LIMIT v_lim;
    ELSE   -- servicos, produtos, digitais
        RETURN QUERY
        SELECT p.id, p.slug::text, COALESCE(s."storeSlug", ow."profileSlug")::text, p.name::text, p.image_url::text, round(o.points)::integer,
               (row_number() OVER (ORDER BY o.points DESC, p.id))::integer, 0
        FROM public.outdoor_scores o JOIN public.products p ON p.id = o.subject_id
        LEFT JOIN public.stores s ON s.id = p.store_id
        LEFT JOIN public.profiles ow ON ow.id = p.owner_id
        WHERE o.kind = p_kind AND o.points > 0 AND p.is_active ORDER BY o.points DESC, p.id LIMIT v_lim;
    END IF;
END; $$;
REVOKE ALL ON FUNCTION public.get_outdoor(text, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.get_outdoor(text, integer) TO anon, authenticated, service_role;

-- ===== 6. get_store_missions: acrescenta o NÍVEL (a mesma função da 055 + o bloco `level`) =====
CREATE OR REPLACE FUNCTION public.get_store_missions(p_store uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_owner uuid; v_today date := public._mission_day(); v_missions jsonb; v_today_pts integer; v_today_total integer; v_week integer;
    v_streak integer := 0; v_d date; v_units numeric; v_w numeric; v_max numeric; v_active boolean; v_rank integer; v_of integer; v_store_pts numeric;
    v_lvl smallint; v_cur public.store_levels; v_next public.store_levels; v_enabled boolean;
BEGIN
    SELECT owner_id, store_level INTO v_owner, v_lvl FROM public.stores WHERE id = p_store;
    IF v_owner IS NULL OR v_owner IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'só o dono da loja vê as missões' USING ERRCODE = '42501';
    END IF;
    PERFORM public.evaluate_store_missions(p_store);

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'code', st.code, 'kind', st.kind, 'title', st.title, 'hint', st.hint, 'points', st.points, 'dest', st.dest, 'done', st.done)
               ORDER BY (st.kind = 'daily') DESC, st.sort_order), '[]'::jsonb),
           COALESCE(sum(st.points) FILTER (WHERE st.kind = 'daily'), 0)
      INTO v_missions, v_today_total
      FROM public._store_mission_status(p_store) st WHERE st.applies;

    SELECT COALESCE(sum(points), 0) INTO v_today_pts FROM public.store_mission_awards WHERE store_id = p_store AND day = v_today;
    SELECT COALESCE(sum(points), 0) INTO v_week FROM public.store_mission_awards WHERE store_id = p_store AND day > v_today - 7;

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

    SELECT enabled INTO v_enabled FROM public.store_level_settings WHERE id;
    SELECT * INTO v_cur FROM public.store_levels WHERE level = COALESCE(v_lvl, 0);
    SELECT * INTO v_next FROM public.store_levels WHERE is_active AND level > COALESCE(v_lvl, 0) ORDER BY level LIMIT 1;

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
            'stores', v_of),
        'level', jsonb_build_object(
            'enabled', COALESCE(v_enabled, false),
            'level', COALESCE(v_lvl, 0),
            'name', v_cur.name,
            'next_name', v_next.name,
            'next_min', v_next.min_points,
            'points', round(COALESCE(v_store_pts, 0))));
END; $$;
REVOKE ALL ON FUNCTION public.get_store_missions(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_store_missions(uuid) TO authenticated, service_role;

-- ===== 7. Agenda e primeira carga =====
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'store-levels-refresh';
        PERFORM cron.schedule('store-levels-refresh', '1-59/5 * * * *', 'SELECT public.refresh_store_levels()');   -- 1 min depois dos pontos (points-refresh roda em :00, :05...)
    END IF;
END $$;
SELECT public.refresh_store_levels();
