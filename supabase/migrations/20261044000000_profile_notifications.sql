-- Notificações do perfil: tudo o que acontece com o perfil de alguém — seguidor novo, curtida em publicação/serviço/produto,
-- comentário (na publicação, no perfil ou resposta a um comentário), curtida em comentário, visita ao perfil, alguém que
-- entrou por um link seu e alguém que se cadastrou pelo seu convite. Os gatilhos escrevem; a pessoa só lê as dela.

CREATE TABLE IF NOT EXISTS public.profile_notifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,      -- quem recebe
    kind text NOT NULL CHECK (kind IN ('follow', 'profile_view', 'link_visit', 'publication_like', 'service_like', 'product_like',
                                       'publication_comment', 'profile_comment', 'comment_reply', 'comment_like', 'invite_signup')),
    actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,                -- quem fez (null = visitante sem conta)
    ref_id uuid,                                                                    -- publicação / comentário
    meta jsonb NOT NULL DEFAULT '{}'::jsonb,                                        -- título, trecho do comentário, link...
    dedupe_key text,
    created_at timestamptz NOT NULL DEFAULT now(),
    read_at timestamptz,
    UNIQUE (profile_id, dedupe_key)
);
CREATE INDEX IF NOT EXISTS profile_notifications_profile_idx ON public.profile_notifications (profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS profile_notifications_unread_idx ON public.profile_notifications (profile_id) WHERE read_at IS NULL;

ALTER TABLE public.profile_notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "A pessoa vê as próprias notificações" ON public.profile_notifications;
CREATE POLICY "A pessoa vê as próprias notificações" ON public.profile_notifications FOR SELECT TO authenticated USING (profile_id = auth.uid());
-- Sem policy de escrita: só gatilhos e funções.

CREATE OR REPLACE FUNCTION public._notify(p_profile uuid, p_kind text, p_actor uuid, p_ref uuid, p_meta jsonb, p_dedupe text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF p_profile IS NULL OR p_profile IS NOT DISTINCT FROM p_actor THEN RETURN; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_profile) THEN RETURN; END IF;
    INSERT INTO public.profile_notifications (profile_id, kind, actor_id, ref_id, meta, dedupe_key)
    VALUES (p_profile, p_kind, p_actor, p_ref, COALESCE(p_meta, '{}'::jsonb), p_dedupe)
    ON CONFLICT (profile_id, dedupe_key) DO NOTHING;
END; $$;
REVOKE ALL ON FUNCTION public._notify(uuid, text, uuid, uuid, jsonb, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._notify(uuid, text, uuid, uuid, jsonb, text) TO service_role;

-- Seguidor novo (só perfil: loja não recebe aqui)
CREATE OR REPLACE FUNCTION public.trg_notify_follow() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    PERFORM public._notify(NEW.following_id, 'follow', NEW.follower_id, NULL, '{}'::jsonb, 'follow:' || NEW.follower_id);
    RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS follows_notify ON public.follows;
CREATE TRIGGER follows_notify AFTER INSERT ON public.follows FOR EACH ROW EXECUTE FUNCTION public.trg_notify_follow();

-- Curtida em publicação, serviço ou produto
CREATE OR REPLACE FUNCTION public.trg_notify_like() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.products; v_owner uuid; v_slug text; v_kind text;
BEGIN
    SELECT * INTO p FROM public.products WHERE id = NEW.publication_id;
    IF NOT FOUND THEN RETURN NEW; END IF;
    IF p.store_id IS NOT NULL THEN
        SELECT s.owner_id, s."storeSlug" INTO v_owner, v_slug FROM public.stores s WHERE s.id = p.store_id;
    ELSE
        v_owner := p.owner_id;
        SELECT "profileSlug" INTO v_slug FROM public.profiles WHERE id = p.owner_id;
    END IF;
    v_kind := CASE WHEN p.listing_type = 'publication' THEN 'publication_like'
                   WHEN p.listing_type = 'service_offer' OR p.type = 'service' THEN 'service_like'
                   ELSE 'product_like' END;
    PERFORM public._notify(v_owner, v_kind, NEW.profile_id, p.id,
        jsonb_build_object('title', p.name, 'slug', p.slug, 'owner_slug', v_slug), 'like:' || NEW.profile_id || ':' || p.id);
    RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS likes_notify ON public.likes;
CREATE TRIGGER likes_notify AFTER INSERT ON public.likes FOR EACH ROW EXECUTE FUNCTION public.trg_notify_like();

-- Comentários: na publicação, no perfil, ou resposta a outro comentário
CREATE OR REPLACE FUNCTION public.trg_notify_comment() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.products; v_owner uuid; v_slug text; par public.comments; v_snip text := left(NEW.content, 140);
BEGIN
    IF NEW.publication_id IS NOT NULL THEN
        SELECT * INTO p FROM public.products WHERE id = NEW.publication_id;
        IF FOUND THEN
            IF p.store_id IS NOT NULL THEN
                SELECT s.owner_id, s."storeSlug" INTO v_owner, v_slug FROM public.stores s WHERE s.id = p.store_id;
            ELSE
                v_owner := p.owner_id;
                SELECT "profileSlug" INTO v_slug FROM public.profiles WHERE id = p.owner_id;
            END IF;
        END IF;
    END IF;

    IF NEW.parent_comment_id IS NOT NULL THEN
        SELECT * INTO par FROM public.comments WHERE id = NEW.parent_comment_id;
        IF FOUND THEN
            PERFORM public._notify(par.profile_id, 'comment_reply', NEW.profile_id, NEW.id,
                jsonb_build_object('snippet', v_snip, 'title', p.name, 'slug', p.slug, 'owner_slug', v_slug), 'reply:' || NEW.id);
        END IF;
    ELSIF NEW.publication_id IS NOT NULL THEN
        PERFORM public._notify(v_owner, 'publication_comment', NEW.profile_id, NEW.id,
            jsonb_build_object('snippet', v_snip, 'title', p.name, 'slug', p.slug, 'owner_slug', v_slug), 'comment:' || NEW.id);
    ELSIF NEW.profile_target_id IS NOT NULL THEN
        PERFORM public._notify(NEW.profile_target_id, 'profile_comment', NEW.profile_id, NEW.id,
            jsonb_build_object('snippet', v_snip), 'comment:' || NEW.id);
    END IF;
    RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS comments_notify ON public.comments;
CREATE TRIGGER comments_notify AFTER INSERT ON public.comments FOR EACH ROW EXECUTE FUNCTION public.trg_notify_comment();

-- Curtida em comentário
CREATE OR REPLACE FUNCTION public.trg_notify_comment_like() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.comments; p public.products; v_slug text;
BEGIN
    SELECT * INTO c FROM public.comments WHERE id = NEW.comment_id;
    IF NOT FOUND THEN RETURN NEW; END IF;
    IF c.publication_id IS NOT NULL THEN
        SELECT * INTO p FROM public.products WHERE id = c.publication_id;
        IF p.store_id IS NOT NULL THEN SELECT "storeSlug" INTO v_slug FROM public.stores WHERE id = p.store_id;
        ELSE SELECT "profileSlug" INTO v_slug FROM public.profiles WHERE id = p.owner_id; END IF;
    END IF;
    PERFORM public._notify(c.profile_id, 'comment_like', NEW.profile_id, c.id,
        jsonb_build_object('snippet', left(c.content, 140), 'title', p.name, 'slug', p.slug, 'owner_slug', v_slug),
        'clike:' || NEW.profile_id || ':' || c.id);
    RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS comment_likes_notify ON public.comment_likes;
CREATE TRIGGER comment_likes_notify AFTER INSERT ON public.comment_likes FOR EACH ROW EXECUTE FUNCTION public.trg_notify_comment_like();

-- Alguém se cadastrou pelo meu convite
CREATE OR REPLACE FUNCTION public.trg_notify_invite() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NEW.upline_id IS NOT NULL AND NEW.upline_id <> NEW.id AND (TG_OP = 'INSERT' OR NEW.upline_id IS DISTINCT FROM OLD.upline_id) THEN
        PERFORM public._notify(NEW.upline_id, 'invite_signup', NEW.id, NULL, '{}'::jsonb, 'invite:' || NEW.id);
    END IF;
    RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS profiles_notify_invite ON public.profiles;
CREATE TRIGGER profiles_notify_invite AFTER INSERT OR UPDATE OF upline_id ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.trg_notify_invite();

-- Visita ao perfil (/slug). 1 por visitante por dia, pra não encher a lista
CREATE OR REPLACE FUNCTION public.trg_notify_profile_view() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_visitor text;
BEGIN
    IF NEW.path IS NULL OR NEW.path !~ '^/[^/?#]+$' THEN RETURN NEW; END IF;
    SELECT id INTO v_id FROM public.profiles WHERE "profileSlug" = substr(NEW.path, 2);
    IF v_id IS NULL THEN RETURN NEW; END IF;
    v_visitor := COALESCE(NEW.user_id::text, 'anon:' || COALESCE(NEW.anonymous_id, 'x'));
    PERFORM public._notify(v_id, 'profile_view', NEW.user_id, NULL, '{}'::jsonb,
        'view:' || v_visitor || ':' || to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD'));
    RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS site_visits_notify_profile_view ON public.site_visits;
CREATE TRIGGER site_visits_notify_profile_view AFTER INSERT ON public.site_visits FOR EACH ROW EXECUTE FUNCTION public.trg_notify_profile_view();

-- Alguém entrou por um link do perfil (loja, publicação, serviço, produto...). Quem chama é o app, quando captura o convite.
CREATE OR REPLACE FUNCTION public.track_link_visit(p_slug text, p_path text, p_anon text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_visitor text := COALESCE(auth.uid()::text, 'anon:' || COALESCE(left(p_anon, 60), 'x'));
BEGIN
    SELECT id INTO v_id FROM public.profiles WHERE "profileSlug" = lower(btrim(p_slug));
    IF v_id IS NULL THEN RETURN; END IF;
    -- A página do próprio perfil já gera "visitou seu perfil"
    IF p_path = '/' || lower(btrim(p_slug)) THEN RETURN; END IF;
    PERFORM public._notify(v_id, 'link_visit', auth.uid(), NULL, jsonb_build_object('path', left(COALESCE(p_path, ''), 200)),
        'link:' || v_visitor || ':' || left(COALESCE(p_path, ''), 120) || ':' || to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD'));
END; $$;
REVOKE ALL ON FUNCTION public.track_link_visit(text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.track_link_visit(text, text, text) TO anon, authenticated;

-- Lista (já com quem fez: nome, @ e foto), contagem de não lidas e marcar como lida
CREATE OR REPLACE FUNCTION public.get_my_notifications(p_limit integer DEFAULT 80)
RETURNS TABLE(id uuid, kind text, ref_id uuid, meta jsonb, created_at timestamptz, read_at timestamptz,
              actor_id uuid, actor_name text, actor_slug text, actor_avatar text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT n.id, n.kind, n.ref_id, n.meta, n.created_at, n.read_at, a.id, a.name, a."profileSlug", a.avatar_url
    FROM public.profile_notifications n
    LEFT JOIN public.profiles a ON a.id = n.actor_id
    WHERE n.profile_id = auth.uid()
    ORDER BY n.created_at DESC
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 80), 1), 200);
$$;
REVOKE ALL ON FUNCTION public.get_my_notifications(integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_my_notifications(integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_notifications_unread()
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT count(*) FROM public.profile_notifications WHERE profile_id = auth.uid() AND read_at IS NULL;
$$;
REVOKE ALL ON FUNCTION public.get_my_notifications_unread() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_my_notifications_unread() TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_notifications_read(p_ids uuid[] DEFAULT NULL)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
    UPDATE public.profile_notifications SET read_at = now()
    WHERE profile_id = auth.uid() AND read_at IS NULL AND (p_ids IS NULL OR id = ANY (p_ids));
$$;
REVOKE ALL ON FUNCTION public.mark_notifications_read(uuid[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.mark_notifications_read(uuid[]) TO authenticated;

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
       AND NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'profile_notifications') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.profile_notifications;
    END IF;
END $$;
