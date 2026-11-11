-- ROLLBACK do MOTOR ÚNICO DE PONTUAÇÃO (migration 20261130000051).
-- Volta ao desenho anterior: Outdoor das pessoas pelo livro-caixa e os outros quatro calculados na hora (outdoor_rules, sem "soma no dono").
-- CUIDADO: apaga as regras criadas pelo admin ("Nova tarefa"), os Outdoors de digitais e motoristas, o Placar e as configurações do bônus. Os pontos que
-- as regras novas (compra concluída, avaliação, campanhas, penalidades) já tinham dado são removidos do livro-caixa e os totais são recalculados.
-- Rodar: docker exec -i supabase_db_iuser-local psql -U postgres -v ON_ERROR_STOP=1 < supabase/rollbacks/points_engine_rollback.sql
BEGIN;

-- 0. agenda
DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'points-refresh'; END IF; END $$;

-- 1. gatilhos novos e o de "seguir" como era
DROP TRIGGER IF EXISTS orders_points ON public.orders;
DROP TRIGGER IF EXISTS product_reviews_points ON public.product_reviews;
DROP FUNCTION IF EXISTS public.trg_points_order();
DROP FUNCTION IF EXISTS public.trg_points_review();
CREATE OR REPLACE FUNCTION public.trg_points_follow() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NEW.follower_id IS DISTINCT FROM NEW.following_id THEN
        PERFORM public._award_points(NEW.follower_id, 'follow_given', NEW.following_id::text);
        PERFORM public._award_points(NEW.following_id, 'follow_received', NEW.follower_id::text);
    END IF;
    RETURN NEW;
END; $$;

-- 2. leituras como eram (antes de largar as tabelas que as novas usam)
CREATE OR REPLACE FUNCTION public.get_best_profiles(p_limit integer DEFAULT 100)
RETURNS TABLE(id uuid, points integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT p.id, COALESCE(pp.total, 0) AS points
    FROM public.profiles p
    LEFT JOIN public.profile_points pp ON pp.profile_id = p.id
    WHERE p.is_active
    ORDER BY COALESCE(pp.total, 0) DESC, COALESCE(p.view_count, 0) DESC, p.ratings_avg DESC NULLS LAST
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 200);
$$;
CREATE OR REPLACE FUNCTION public.get_profiles_ranking_info(p_ids uuid[])
RETURNS TABLE(id uuid, points integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT p.id, COALESCE(pp.total, 0)
    FROM public.profiles p
    LEFT JOIN public.profile_points pp ON pp.profile_id = p.id
    WHERE p.id = ANY (p_ids[1:200]);
$$;
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
DROP FUNCTION IF EXISTS public.get_profile_scoreboard(uuid);

-- 3. Outdoor como era (migration 20261130000035)
DROP FUNCTION IF EXISTS public.refresh_outdoor_scores();
DROP FUNCTION IF EXISTS public._outdoor_compute(text);
DROP FUNCTION IF EXISTS public._outdoor_units(text);
DROP FUNCTION IF EXISTS public._outdoor_scores(text);
CREATE OR REPLACE FUNCTION public._outdoor_scores(p_kind text)
RETURNS TABLE(id uuid, points numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF p_kind = 'lojas' THEN
        RETURN QUERY
        SELECT s.id,
               public._outdoor_w('lojas','sales')     * COALESCE(o.sales, 0)
             + public._outdoor_w('lojas','customers') * COALESCE(o.customers, 0)
             + public._outdoor_w('lojas','stars')     * COALESCE(s.ratings_avg, 0) * COALESCE(s.ratings_count, 0)
             + public._outdoor_w('lojas','followers') * COALESCE(f.n, 0)
             + public._outdoor_w('lojas','views')     * COALESCE(s.view_count, 0)
             + public._outdoor_w('lojas','listings')  * LEAST(COALESCE(l.n, 0), 50)
             + public._outdoor_w('lojas','shares')    * COALESCE(s.share_count, 0)
        FROM public.stores s
        JOIN public.profiles pr ON pr.id = s.owner_id AND pr.is_active AND NOT COALESCE(pr.is_blocked, false)
        LEFT JOIN (SELECT store_id, count(*) AS sales, count(DISTINCT buyer_id) AS customers FROM public.orders WHERE status = 'paid' GROUP BY store_id) o ON o.store_id = s.id
        LEFT JOIN (SELECT following_id, count(*) AS n FROM public.follows GROUP BY following_id) f ON f.following_id = s.id
        LEFT JOIN (SELECT store_id, count(*) AS n FROM public.products WHERE is_active AND listing_type = 'sale' GROUP BY store_id) l ON l.store_id = s.id
        WHERE s.is_active;
    ELSIF p_kind = 'pessoas' THEN
        RETURN QUERY
        SELECT p.id, COALESCE(pp.total, 0)::numeric
        FROM public.profiles p
        JOIN public.profile_points pp ON pp.profile_id = p.id
        WHERE p.is_active AND NOT COALESCE(p.is_blocked, false);
    ELSIF p_kind = 'servicos' THEN
        RETURN QUERY
        SELECT p.id,
               public._outdoor_w('servicos','views')    * COALESCE(p.view_count, 0)
             + public._outdoor_w('servicos','stars')    * COALESCE(p.ratings_avg, 0) * COALESCE(p.ratings_count, 0)
             + public._outdoor_w('servicos','bookings') * COALESCE(a.n, 0)
             + public._outdoor_w('servicos','shares')   * COALESCE(p.share_count, 0)
        FROM public.products p
        LEFT JOIN (SELECT service_id, count(*) AS n FROM public.appointments WHERE completed_at IS NOT NULL AND service_id IS NOT NULL GROUP BY service_id) a ON a.service_id = p.id
        WHERE p.is_active AND p.type = 'service';
    ELSIF p_kind = 'produtos' THEN
        RETURN QUERY
        SELECT p.id,
               public._outdoor_w('produtos','views')  * COALESCE(p.view_count, 0)
             + public._outdoor_w('produtos','stars')  * COALESCE(p.ratings_avg, 0) * COALESCE(p.ratings_count, 0)
             + public._outdoor_w('produtos','sold')   * COALESCE(i.n, 0)
             + public._outdoor_w('produtos','shares') * COALESCE(p.share_count, 0)
        FROM public.products p
        LEFT JOIN (SELECT oi.product_id, sum(oi.quantity) AS n FROM public.order_items oi JOIN public.orders o ON o.id = oi.order_id WHERE o.status = 'paid' GROUP BY oi.product_id) i ON i.product_id = p.id
        WHERE p.is_active AND p.type = 'physical' AND p.listing_type = 'sale';
    ELSIF p_kind = 'imoveis' THEN
        RETURN QUERY
        SELECT r.id,
               public._outdoor_w('imoveis','listed') + public._outdoor_w('imoveis','views') * COALESCE(r.view_count, 0)
             + public._outdoor_w('imoveis','visits') * COALESCE(a.n, 0)
        FROM public.rental_listings r
        LEFT JOIN (SELECT rental_listing_id, count(*) AS n FROM public.appointments WHERE completed_at IS NOT NULL AND rental_listing_id IS NOT NULL GROUP BY rental_listing_id) a ON a.rental_listing_id = r.id
        WHERE r.status = 'active';
    END IF;
END; $$;
REVOKE ALL ON FUNCTION public._outdoor_scores(text) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_outdoor(p_kind text, p_limit integer DEFAULT 12)
RETURNS TABLE(id uuid, slug text, owner_slug text, name text, image text, points integer, rank integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_lim integer := LEAST(GREATEST(COALESCE(p_limit, 12), 1), 200);
BEGIN
    IF p_kind NOT IN ('lojas','pessoas','servicos','produtos','imoveis') THEN RETURN; END IF;
    IF p_kind = 'lojas' THEN
        RETURN QUERY
        SELECT s.id, s."storeSlug"::text, NULL::text, s.name::text, s.logo_url::text, round(t.points)::integer,
               (row_number() OVER (ORDER BY t.points DESC, s.id))::integer
        FROM public._outdoor_scores('lojas') t JOIN public.stores s ON s.id = t.id
        WHERE t.points > 0 ORDER BY t.points DESC, s.id LIMIT v_lim;
    ELSIF p_kind = 'pessoas' THEN
        RETURN QUERY
        SELECT p.id, p."profileSlug"::text, NULL::text, p.name::text, p.avatar_url::text, round(t.points)::integer,
               (row_number() OVER (ORDER BY t.points DESC, COALESCE(p.view_count, 0) DESC, p.id))::integer
        FROM public._outdoor_scores('pessoas') t JOIN public.profiles p ON p.id = t.id
        WHERE t.points > 0 AND p."profileSlug" IS NOT NULL ORDER BY t.points DESC, COALESCE(p.view_count, 0) DESC, p.id LIMIT v_lim;
    ELSIF p_kind = 'imoveis' THEN
        RETURN QUERY
        SELECT r.id, r.slug::text, NULL::text, r.title::text, (r.photos)[1]::text, round(t.points)::integer,
               (row_number() OVER (ORDER BY t.points DESC, r.id))::integer
        FROM public._outdoor_scores('imoveis') t JOIN public.rental_listings r ON r.id = t.id
        WHERE t.points > 0 ORDER BY t.points DESC, r.id LIMIT v_lim;
    ELSE
        RETURN QUERY
        SELECT p.id, p.slug::text, COALESCE(s."storeSlug", o."profileSlug")::text, p.name::text, p.image_url::text, round(t.points)::integer,
               (row_number() OVER (ORDER BY t.points DESC, p.id))::integer
        FROM public._outdoor_scores(p_kind) t JOIN public.products p ON p.id = t.id
        LEFT JOIN public.stores s ON s.id = p.store_id
        LEFT JOIN public.profiles o ON o.id = p.owner_id
        WHERE t.points > 0 ORDER BY t.points DESC, p.id LIMIT v_lim;
    END IF;
END; $$;
REVOKE ALL ON FUNCTION public.get_outdoor(text, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.get_outdoor(text, integer) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_outdoor_rules(p_kind text)
RETURNS TABLE(label text, points numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT r.label::text, r.weight FROM public.outdoor_rules r
     WHERE p_kind <> 'pessoas' AND r.kind = p_kind AND r.is_active AND r.weight > 0
    UNION ALL
    SELECT r.label::text, r.points::numeric FROM public.point_rules r
     WHERE p_kind = 'pessoas' AND r.is_active AND r.points > 0;
$$;
REVOKE ALL ON FUNCTION public.get_outdoor_rules(text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_outdoor_rules(text) TO anon, authenticated, service_role;

-- 4. regras de evento: tira as novas e volta os limites
DELETE FROM public.profile_points_events e WHERE NOT EXISTS (SELECT 1 FROM public.point_rules r WHERE r.action = e.action AND r.action = r.event AND r.action IN ('invite_signup','service_published','follow_given','follow_received','publication_created'));
UPDATE public.profile_points pp SET total = COALESCE((SELECT sum(points) FROM public.profile_points_events e WHERE e.profile_id = pp.profile_id), 0), updated_at = now();
DELETE FROM public.point_rules WHERE action NOT IN ('invite_signup','service_published','follow_given','follow_received','publication_created');
UPDATE public.point_rules SET points = 5, daily_limit = 20 WHERE action = 'follow_given' AND points = 2 AND daily_limit = 10;
DROP INDEX IF EXISTS public.point_rules_event_idx;
ALTER TABLE public.point_rules DROP CONSTRAINT IF EXISTS point_rules_event_fkey, DROP CONSTRAINT IF EXISTS point_rules_window_check,
    DROP CONSTRAINT IF EXISTS point_rules_points_range, DROP CONSTRAINT IF EXISTS point_rules_action_check;
ALTER TABLE public.point_rules DROP COLUMN IF EXISTS event, DROP COLUMN IF EXISTS starts_at, DROP COLUMN IF EXISTS ends_at, DROP COLUMN IF EXISTS max_total;
ALTER TABLE public.point_rules ADD CONSTRAINT point_rules_points_check CHECK (points BETWEEN 0 AND 100000);
ALTER TABLE public.point_rules ADD CONSTRAINT point_rules_action_check CHECK (action ~ '^[a-z_]{3,40}$');
DROP TABLE IF EXISTS public.point_events;

-- 5. sinais: sem os tipos novos, sem os campos novos
DELETE FROM public.outdoor_rules WHERE kind IN ('digitais','motoristas') OR (kind = 'lojas' AND signal = 'rejected');
DO $$
DECLARE c record;
BEGIN
    FOR c IN SELECT conname FROM pg_constraint WHERE conrelid = 'public.outdoor_rules'::regclass AND contype = 'c' AND (pg_get_constraintdef(oid) ILIKE '%weight%' OR pg_get_constraintdef(oid) ILIKE '%kind%') LOOP
        EXECUTE format('ALTER TABLE public.outdoor_rules DROP CONSTRAINT %I', c.conname);
    END LOOP;
END $$;
ALTER TABLE public.outdoor_rules DROP COLUMN IF EXISTS rolls_up, DROP COLUMN IF EXISTS max_units, DROP COLUMN IF EXISTS updated_at, DROP COLUMN IF EXISTS updated_by;
ALTER TABLE public.outdoor_rules ADD CONSTRAINT outdoor_rules_kind_check CHECK (kind IN ('lojas','servicos','produtos','imoveis'));
ALTER TABLE public.outdoor_rules ADD CONSTRAINT outdoor_rules_weight_check CHECK (weight >= 0 AND weight <= 1000);

-- 6. _award_points como era (migration 20261042000000)
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

-- 7. tabelas novas
DROP TABLE IF EXISTS public.profile_scores;
DROP TABLE IF EXISTS public.outdoor_scores;
DROP TABLE IF EXISTS public.points_settings;

COMMIT;
