-- Flash: o feed de PESSOAS (estilo reels/tiktok + twitter + instagram). Um "flash" é uma postagem curta (texto e/ou foto/vídeo) de uma pessoa;
-- o feed mistura os flashes com as PUBLICAÇÕES das pessoas (products.listing_type = 'publication', sem loja). Tudo público para ler;
-- só a própria pessoa cria, edita o texto e apaga o que é dela; contadores só pelos gatilhos do banco.
-- Rollback: supabase/rollbacks/flash_rollback.sql

-- ===== Mídia: bucket público (leitura por URL), envio só na própria pasta <uid>/... =====
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('flash-media', 'flash-media', true, 15728640,
        ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'video/quicktime'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "storage_insert_flash_media" ON storage.objects;
CREATE POLICY "storage_insert_flash_media" ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'flash-media' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);

-- ===== Flashes =====
CREATE TABLE IF NOT EXISTS public.flashes (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    author_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    content       text NOT NULL DEFAULT '' CHECK (char_length(content) <= 500),
    media_url     text,
    media_type    text CHECK (media_type IN ('image', 'video')),
    like_count    integer NOT NULL DEFAULT 0,
    comment_count integer NOT NULL DEFAULT 0,
    share_count   integer NOT NULL DEFAULT 0,
    created_at    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT flash_not_empty CHECK (btrim(content) <> '' OR media_url IS NOT NULL),
    CONSTRAINT flash_media_pair CHECK ((media_url IS NULL) = (media_type IS NULL)),
    -- só caminho dentro do bucket flash-media, na pasta da própria pessoa (nunca link externo)
    CONSTRAINT flash_media_path CHECK (media_url IS NULL OR (media_url ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,120}$' AND media_url LIKE author_id::text || '/%'))
);
CREATE INDEX IF NOT EXISTS flashes_created_idx ON public.flashes (created_at DESC);
CREATE INDEX IF NOT EXISTS flashes_author_idx ON public.flashes (author_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.flash_likes (
    flash_id   uuid NOT NULL REFERENCES public.flashes(id) ON DELETE CASCADE,
    profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (flash_id, profile_id)
);

CREATE TABLE IF NOT EXISTS public.flash_comments (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    flash_id   uuid NOT NULL REFERENCES public.flashes(id) ON DELETE CASCADE,
    author_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    content    text NOT NULL CHECK (char_length(btrim(content)) BETWEEN 1 AND 300),
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS flash_comments_flash_idx ON public.flash_comments (flash_id, created_at);

ALTER TABLE public.flashes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flash_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flash_comments ENABLE ROW LEVEL SECURITY;

-- Privilégio mínimo: leitura pública; escrita só nas colunas da própria pessoa (contadores nunca)
REVOKE ALL ON public.flashes, public.flash_likes, public.flash_comments FROM anon, authenticated;
GRANT SELECT ON public.flashes, public.flash_likes, public.flash_comments TO anon, authenticated;
GRANT INSERT (author_id, content, media_url, media_type) ON public.flashes TO authenticated;
GRANT UPDATE (content) ON public.flashes TO authenticated;
GRANT DELETE ON public.flashes TO authenticated;
GRANT INSERT (flash_id, profile_id) ON public.flash_likes TO authenticated;
GRANT DELETE ON public.flash_likes TO authenticated;
GRANT INSERT (flash_id, author_id, content) ON public.flash_comments TO authenticated;
GRANT DELETE ON public.flash_comments TO authenticated;

DROP POLICY IF EXISTS flashes_read ON public.flashes;
CREATE POLICY flashes_read ON public.flashes FOR SELECT USING (true);
DROP POLICY IF EXISTS flashes_insert ON public.flashes;
CREATE POLICY flashes_insert ON public.flashes FOR INSERT TO authenticated WITH CHECK (author_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS flashes_update ON public.flashes;
CREATE POLICY flashes_update ON public.flashes FOR UPDATE TO authenticated USING (author_id = (SELECT auth.uid())) WITH CHECK (author_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS flashes_delete ON public.flashes;
CREATE POLICY flashes_delete ON public.flashes FOR DELETE TO authenticated USING (author_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS flash_likes_read ON public.flash_likes;
CREATE POLICY flash_likes_read ON public.flash_likes FOR SELECT USING (true);
DROP POLICY IF EXISTS flash_likes_insert ON public.flash_likes;
CREATE POLICY flash_likes_insert ON public.flash_likes FOR INSERT TO authenticated WITH CHECK (profile_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS flash_likes_delete ON public.flash_likes;
CREATE POLICY flash_likes_delete ON public.flash_likes FOR DELETE TO authenticated USING (profile_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS flash_comments_read ON public.flash_comments;
CREATE POLICY flash_comments_read ON public.flash_comments FOR SELECT USING (true);
DROP POLICY IF EXISTS flash_comments_insert ON public.flash_comments;
CREATE POLICY flash_comments_insert ON public.flash_comments FOR INSERT TO authenticated WITH CHECK (author_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS flash_comments_delete ON public.flash_comments;
CREATE POLICY flash_comments_delete ON public.flash_comments FOR DELETE TO authenticated
    USING (author_id = (SELECT auth.uid()) OR EXISTS (SELECT 1 FROM public.flashes f WHERE f.id = flash_id AND f.author_id = (SELECT auth.uid())));

-- ===== Contadores (só por gatilho) e limites de abuso =====
CREATE OR REPLACE FUNCTION public.flash_like_counter() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN UPDATE public.flashes SET like_count = like_count + 1 WHERE id = NEW.flash_id;
    ELSE UPDATE public.flashes SET like_count = GREATEST(like_count - 1, 0) WHERE id = OLD.flash_id; END IF;
    RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS flash_likes_count ON public.flash_likes;
CREATE TRIGGER flash_likes_count AFTER INSERT OR DELETE ON public.flash_likes FOR EACH ROW EXECUTE FUNCTION public.flash_like_counter();

CREATE OR REPLACE FUNCTION public.flash_comment_counter() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN UPDATE public.flashes SET comment_count = comment_count + 1 WHERE id = NEW.flash_id;
    ELSE UPDATE public.flashes SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = OLD.flash_id; END IF;
    RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS flash_comments_count ON public.flash_comments;
CREATE TRIGGER flash_comments_count AFTER INSERT OR DELETE ON public.flash_comments FOR EACH ROW EXECUTE FUNCTION public.flash_comment_counter();

CREATE OR REPLACE FUNCTION public.flash_rate_limit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF TG_TABLE_NAME = 'flashes' THEN
        IF (SELECT count(*) FROM public.flashes WHERE author_id = NEW.author_id AND created_at > now() - interval '1 hour') >= 20 THEN
            RAISE EXCEPTION 'Você postou muitos flashes agora há pouco. Espere um pouco para postar de novo.' USING ERRCODE = '53400';
        END IF;
    ELSE
        IF (SELECT count(*) FROM public.flash_comments WHERE author_id = NEW.author_id AND created_at > now() - interval '1 hour') >= 120 THEN
            RAISE EXCEPTION 'Você comentou muito agora há pouco. Espere um pouco.' USING ERRCODE = '53400';
        END IF;
    END IF;
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS flashes_rate ON public.flashes;
CREATE TRIGGER flashes_rate BEFORE INSERT ON public.flashes FOR EACH ROW EXECUTE FUNCTION public.flash_rate_limit();
DROP TRIGGER IF EXISTS flash_comments_rate ON public.flash_comments;
CREATE TRIGGER flash_comments_rate BEFORE INSERT ON public.flash_comments FOR EACH ROW EXECUTE FUNCTION public.flash_rate_limit();

-- Compartilhamento: só soma o contador (o app chama quando a pessoa compartilha de verdade)
CREATE OR REPLACE FUNCTION public.increment_flash_share_count(p_flash uuid) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
    UPDATE public.flashes SET share_count = share_count + 1 WHERE id = p_flash;
$$;
REVOKE ALL ON FUNCTION public.increment_flash_share_count(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.increment_flash_share_count(uuid) TO authenticated;

-- ===== O feed: flashes + publicações das pessoas, do mais novo para o mais antigo =====
-- p_mode: 'all' (Para você) | 'following' (quem eu sigo, e eu); p_kind: só 'flash', só 'publication' ou (nulo) os dois. Só dado público do autor (nome, @, foto).
DROP FUNCTION IF EXISTS public.get_flash_feed(text, integer, timestamptz);
CREATE OR REPLACE FUNCTION public.get_flash_feed(p_mode text DEFAULT 'all', p_limit integer DEFAULT 20, p_before timestamptz DEFAULT NULL, p_kind text DEFAULT NULL)
RETURNS TABLE (
    kind text, id uuid, created_at timestamptz, author_id uuid, author_name text, author_slug text, author_avatar text,
    title text, content text, media_url text, media_type text, like_count integer, comment_count integer, share_count integer,
    liked boolean, following boolean, link text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    -- DEFINER: confere is_active/is_blocked do autor (colunas privadas de profiles) mas só DEVOLVE o que é público (nome, @, foto)
    WITH items AS (
        SELECT 'flash'::text AS kind, f.id, f.created_at, f.author_id, NULL::text AS title, f.content, f.media_url, f.media_type,
               f.like_count, f.comment_count, f.share_count,
               EXISTS (SELECT 1 FROM public.flash_likes l WHERE l.flash_id = f.id AND l.profile_id = (SELECT auth.uid())) AS liked,
               NULL::text AS link
          FROM public.flashes f
        UNION ALL
        SELECT 'publication', pr.id, pr.created_at, pr.owner_id, pr.name, pr.description, pr.image_url,
               CASE WHEN pr.image_url IS NOT NULL THEN 'image' END,
               (SELECT count(*)::int FROM public.likes l WHERE l.publication_id = pr.id),
               (SELECT count(*)::int FROM public.comments c WHERE c.publication_id = pr.id), 0,
               EXISTS (SELECT 1 FROM public.likes l WHERE l.publication_id = pr.id AND l.profile_id = (SELECT auth.uid())),
               pr.slug
          FROM public.products pr
         WHERE pr.listing_type = 'publication' AND pr.is_active AND pr.store_id IS NULL
    )
    SELECT i.kind, i.id, i.created_at, i.author_id, p.name, p."profileSlug", p.avatar_url, i.title, i.content, i.media_url, i.media_type,
           i.like_count, i.comment_count, i.share_count, i.liked,
           EXISTS (SELECT 1 FROM public.follows fo WHERE fo.follower_id = (SELECT auth.uid()) AND fo.following_id = i.author_id) AS following,
           i.link
      FROM items i
      JOIN public.profiles p ON p.id = i.author_id
     WHERE COALESCE(p.is_active, true) AND NOT COALESCE(p.is_blocked, false)
       AND (p_before IS NULL OR i.created_at < p_before)
       AND (p_kind IS NULL OR i.kind = p_kind)   -- 'flash' | 'publication' | todos
       AND (p_mode <> 'following'
            OR i.author_id = (SELECT auth.uid())
            OR EXISTS (SELECT 1 FROM public.follows fo WHERE fo.follower_id = (SELECT auth.uid()) AND fo.following_id = i.author_id))
     ORDER BY i.created_at DESC
     LIMIT LEAST(GREATEST(p_limit, 1), 50);
$$;
GRANT EXECUTE ON FUNCTION public.get_flash_feed(text, integer, timestamptz, text) TO anon, authenticated;

-- Realtime: novos flashes e comentários aparecem ao vivo
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.flashes; EXCEPTION WHEN duplicate_object THEN NULL; END;
        BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.flash_comments; EXCEPTION WHEN duplicate_object THEN NULL; END;
    END IF;
END $$;
