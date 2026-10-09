-- Pontuação dos perfis. Cada ação vale uma quantidade de pontos (peso) que o admin ajusta em Admin → Pontuação.
-- Os pontos entram num livro-caixa (profile_points_events, o peso fica congelado na linha) e somam em profile_points.
-- Hoje "Melhores perfis" ordena por nível de hierarquia e, dentro de cada nível, por pontos. Os pontos ainda NÃO
-- promovem ninguém de nível: a hierarquia continua sendo concedida pelo admin.

CREATE TABLE IF NOT EXISTS public.point_rules (
    action text PRIMARY KEY CHECK (action ~ '^[a-z_]{3,40}$'),
    label text NOT NULL,
    description text,
    points integer NOT NULL DEFAULT 0 CHECK (points BETWEEN 0 AND 100000),
    -- Quantas vezes por dia a mesma pessoa pode ganhar por esta ação (null = sem limite): evita "fazer pontos" em série
    daily_limit integer CHECK (daily_limit IS NULL OR daily_limit > 0),
    is_active boolean NOT NULL DEFAULT true,
    sort_order integer NOT NULL DEFAULT 0,
    updated_at timestamptz NOT NULL DEFAULT now(),
    updated_by uuid
);

CREATE TABLE IF NOT EXISTS public.profile_points_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    action text NOT NULL REFERENCES public.point_rules(action) ON UPDATE CASCADE,
    points integer NOT NULL,                -- o peso da regra NA HORA (mudar a regra depois não reescreve o passado)
    ref text NOT NULL,                      -- de onde veio (convidado, publicação, perfil seguido...): garante 1 vez só
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (profile_id, action, ref)
);
CREATE INDEX IF NOT EXISTS profile_points_events_profile_idx ON public.profile_points_events (profile_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.profile_points (
    profile_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    total integer NOT NULL DEFAULT 0,
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS profile_points_total_idx ON public.profile_points (total DESC);

-- O cliente nunca lê nem escreve estas tabelas direto: só pelas funções abaixo e pelas rotas do admin (service role)
ALTER TABLE public.point_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_points_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_points ENABLE ROW LEVEL SECURITY;

INSERT INTO public.point_rules (action, label, description, points, daily_limit, sort_order) VALUES
    ('invite_signup',       'Convidar alguém',              'Uma pessoa criou a conta pelo seu convite',        50, NULL, 1),
    ('service_published',   'Publicar um serviço',          'Publicar um serviço no perfil ou na loja',         20, 5,    2),
    ('follow_given',        'Adicionar (seguir) alguém',    'Seguir um perfil ou uma loja',                      5, 20,   3),
    ('follow_received',     'Ganhar um seguidor',           'Alguém passou a te seguir',                         3, NULL, 4),
    ('publication_created', 'Compartilhar imagem no perfil','Publicar uma imagem/publicação no seu perfil',     5, 5,    5)
ON CONFLICT (action) DO NOTHING;

-- Dá os pontos de uma ação (idempotente por p_ref). p_enforce_limit = false no preenchimento do passado.
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
REVOKE ALL ON FUNCTION public._award_points(uuid, text, text, timestamptz, boolean) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._award_points(uuid, text, text, timestamptz, boolean) TO service_role;

-- ===== Gatilhos =====
-- Convidar: a pessoa entrou com este perfil como quem indicou
CREATE OR REPLACE FUNCTION public.trg_points_invite() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NEW.upline_id IS NOT NULL AND NEW.upline_id <> NEW.id
       AND (TG_OP = 'INSERT' OR NEW.upline_id IS DISTINCT FROM OLD.upline_id) THEN
        PERFORM public._award_points(NEW.upline_id, 'invite_signup', NEW.id::text);
    END IF;
    RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS profiles_points_invite ON public.profiles;
CREATE TRIGGER profiles_points_invite AFTER INSERT OR UPDATE OF upline_id ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.trg_points_invite();

-- Seguir
CREATE OR REPLACE FUNCTION public.trg_points_follow() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NEW.follower_id IS DISTINCT FROM NEW.following_id THEN
        PERFORM public._award_points(NEW.follower_id, 'follow_given', NEW.following_id::text);
        PERFORM public._award_points(NEW.following_id, 'follow_received', NEW.follower_id::text);   -- só vale se for um perfil (loja não tem pontos)
    END IF;
    RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS follows_points ON public.follows;
CREATE TRIGGER follows_points AFTER INSERT ON public.follows
    FOR EACH ROW EXECUTE FUNCTION public.trg_points_follow();

-- Publicações no perfil e serviços (do perfil ou da loja)
CREATE OR REPLACE FUNCTION public.trg_points_product() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_owner uuid;
BEGIN
    IF NEW.listing_type = 'publication' AND NEW.store_id IS NULL AND NEW.owner_id IS NOT NULL THEN
        PERFORM public._award_points(NEW.owner_id, 'publication_created', NEW.id::text);
    ELSIF NEW.listing_type = 'service_offer' AND NEW.owner_id IS NOT NULL THEN
        PERFORM public._award_points(NEW.owner_id, 'service_published', NEW.id::text);
    ELSIF NEW.type = 'service' AND NEW.store_id IS NOT NULL THEN
        SELECT owner_id INTO v_owner FROM public.stores WHERE id = NEW.store_id;
        PERFORM public._award_points(v_owner, 'service_published', NEW.id::text);
    END IF;
    RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS products_points ON public.products;
CREATE TRIGGER products_points AFTER INSERT ON public.products
    FOR EACH ROW EXECUTE FUNCTION public.trg_points_product();

-- ===== O que já aconteceu até hoje também conta (sem o limite diário; cada ref só uma vez) =====
DO $$
DECLARE r record;
BEGIN
    FOR r IN SELECT id, upline_id, created_at FROM public.profiles WHERE upline_id IS NOT NULL AND upline_id <> id LOOP
        PERFORM public._award_points(r.upline_id, 'invite_signup', r.id::text, COALESCE(r.created_at, now()), false);
    END LOOP;
    FOR r IN SELECT follower_id, following_id, created_at FROM public.follows WHERE follower_id <> following_id LOOP
        PERFORM public._award_points(r.follower_id, 'follow_given', r.following_id::text, COALESCE(r.created_at, now()), false);
        PERFORM public._award_points(r.following_id, 'follow_received', r.follower_id::text, COALESCE(r.created_at, now()), false);
    END LOOP;
    FOR r IN SELECT id, owner_id, created_at FROM public.products WHERE listing_type = 'publication' AND store_id IS NULL AND owner_id IS NOT NULL LOOP
        PERFORM public._award_points(r.owner_id, 'publication_created', r.id::text, COALESCE(r.created_at, now()), false);
    END LOOP;
    FOR r IN SELECT id, owner_id, created_at FROM public.products WHERE listing_type = 'service_offer' AND owner_id IS NOT NULL LOOP
        PERFORM public._award_points(r.owner_id, 'service_published', r.id::text, COALESCE(r.created_at, now()), false);
    END LOOP;
    FOR r IN SELECT p.id, s.owner_id, p.created_at FROM public.products p JOIN public.stores s ON s.id = p.store_id WHERE p.type = 'service' AND p.store_id IS NOT NULL LOOP
        PERFORM public._award_points(r.owner_id, 'service_published', r.id::text, COALESCE(r.created_at, now()), false);
    END LOOP;
END $$;

-- ===== Ranking: "Melhores perfis" = nível de hierarquia, depois pontos, depois visitas/avaliação =====
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
    ORDER BY COALESCE(CASE WHEN s.is_active THEN s.level END, 0) DESC,
             COALESCE(pp.total, 0) DESC,
             COALESCE(p.view_count, 0) DESC,
             p.ratings_avg DESC NULLS LAST
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 200);
$$;
REVOKE ALL ON FUNCTION public.get_best_profiles(integer) FROM public;
GRANT EXECUTE ON FUNCTION public.get_best_profiles(integer) TO anon, authenticated, service_role;

-- Pontos de quem pediu (pra "Minha pontuação"): total, quanto de cada ação e como ganhar mais
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
REVOKE ALL ON FUNCTION public.get_my_points() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_my_points() TO authenticated;
