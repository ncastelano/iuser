-- 20261130000070_flash_location.sql
--
-- FLASH COM LOCAL + FLASH NO RADAR (decisão do dono, 16/11/2026: "vamos poder adicionar localização para poder colocar no radar").
-- Ao postar, a pessoa pode (opcional) marcar ONDE: "📍 Rua, Bairro". O banco guarda só uma posição APROXIMADA (grade de ~330 m, a
-- mesma dos motoristas no mapa: `round(x / 0.003) * 0.003`), nunca a exata — o app manda a posição e o gatilho arredonda antes de
-- gravar; o texto do lugar é só rua e bairro (sem número; até 80 letras). Leitura pública como o resto do flash.
-- O Radar ganha o modo "Flash": `get_radar_flashes(lat, lng, raio, horas)` devolve os flashes COM local, recentes (padrão 72 h),
-- dentro do raio, de autor ativo e não bloqueado, sem os ocultados pela moderação — e só o que é público (nome, @, foto do autor).
-- O feed (`get_flash_feed`) passa a devolver também `place_label` (o "📍 lugar" no card).
-- Rollback: supabase/rollbacks/flash_location_rollback.sql. Cenários: supabase/tests/flash_location_scenarios.sql.

ALTER TABLE public.flashes
    ADD COLUMN IF NOT EXISTS place_lat   double precision,
    ADD COLUMN IF NOT EXISTS place_lng   double precision,
    ADD COLUMN IF NOT EXISTS place_label text;

DO $$ BEGIN
    ALTER TABLE public.flashes ADD CONSTRAINT flash_place_pair CHECK ((place_lat IS NULL) = (place_lng IS NULL));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE public.flashes ADD CONSTRAINT flash_place_range CHECK (place_lat IS NULL OR (place_lat BETWEEN -90 AND 90 AND place_lng BETWEEN -180 AND 180));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE public.flashes ADD CONSTRAINT flash_place_label_len CHECK (place_label IS NULL OR (char_length(place_label) BETWEEN 2 AND 80 AND place_lat IS NOT NULL));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS flashes_place_recent_idx ON public.flashes (created_at DESC) WHERE place_lat IS NOT NULL;

-- a posição nunca é gravada exata: grade de ~330 m (0,003°); o texto perde o número da casa ("Rua X, 123, Bairro" → "Rua X, Bairro")
CREATE OR REPLACE FUNCTION public.flashes_round_place() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.place_lat IS NOT NULL THEN
        NEW.place_lat := round((NEW.place_lat / 0.003)::numeric) * 0.003;
        NEW.place_lng := round((NEW.place_lng / 0.003)::numeric) * 0.003;
    END IF;
    IF NEW.place_label IS NOT NULL THEN
        NEW.place_label := btrim(regexp_replace(regexp_replace(NEW.place_label, ',\s*(n[ºo°.]?\s*)?\d+[A-Za-z]?\s*(?=,|$)', '', 'gi'), '\s{2,}', ' ', 'g'));
        IF NEW.place_label = '' THEN NEW.place_label := NULL; END IF;
    END IF;
    RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS flashes_round_place ON public.flashes;
CREATE TRIGGER flashes_round_place BEFORE INSERT OR UPDATE OF place_lat, place_lng, place_label ON public.flashes
    FOR EACH ROW EXECUTE FUNCTION public.flashes_round_place();

-- só quem posta escolhe o local, ao postar (como o resto do flash, escrita por coluna)
GRANT INSERT (place_lat, place_lng, place_label) ON public.flashes TO authenticated;

-- ===== o feed devolve também o lugar =====
DROP FUNCTION IF EXISTS public.get_flash_feed(text, integer, timestamptz, text);
CREATE FUNCTION public.get_flash_feed(p_mode text DEFAULT 'all'::text, p_limit integer DEFAULT 20, p_before timestamp with time zone DEFAULT NULL::timestamp with time zone, p_kind text DEFAULT NULL::text)
 RETURNS TABLE(kind text, id uuid, created_at timestamp with time zone, author_id uuid, author_name text, author_slug text, author_avatar text, title text, content text, media_url text, media_type text, like_count integer, comment_count integer, share_count integer, liked boolean, following boolean, link text, place_label text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    -- DEFINER: confere is_active/is_blocked do autor (colunas privadas de profiles) mas só DEVOLVE o que é público (nome, @, foto)
    WITH items AS (
        SELECT 'flash'::text AS kind, f.id, f.created_at, f.author_id, NULL::text AS title, f.content, f.media_url, f.media_type,
               f.like_count, f.comment_count, f.share_count,
               EXISTS (SELECT 1 FROM public.flash_likes l WHERE l.flash_id = f.id AND l.profile_id = (SELECT auth.uid())) AS liked,
               NULL::text AS link, f.place_label
          FROM public.flashes f
         WHERE NOT public._is_hidden('flash', f.id)
        UNION ALL
        SELECT 'publication', pr.id, pr.created_at, pr.owner_id, pr.name, pr.description, pr.image_url,
               CASE WHEN pr.image_url IS NOT NULL THEN 'image' END,
               (SELECT count(*)::int FROM public.likes l WHERE l.publication_id = pr.id),
               (SELECT count(*)::int FROM public.comments c WHERE c.publication_id = pr.id), 0,
               EXISTS (SELECT 1 FROM public.likes l WHERE l.publication_id = pr.id AND l.profile_id = (SELECT auth.uid())),
               pr.slug, NULL::text
          FROM public.products pr
         WHERE pr.listing_type = 'publication' AND pr.is_active AND pr.store_id IS NULL
    )
    SELECT i.kind, i.id, i.created_at, i.author_id, p.name, p."profileSlug", p.avatar_url, i.title, i.content, i.media_url, i.media_type,
           i.like_count, i.comment_count, i.share_count, i.liked,
           EXISTS (SELECT 1 FROM public.follows fo WHERE fo.follower_id = (SELECT auth.uid()) AND fo.following_id = i.author_id) AS following,
           i.link, i.place_label
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
$function$;
REVOKE ALL ON FUNCTION public.get_flash_feed(text, integer, timestamptz, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_flash_feed(text, integer, timestamptz, text) TO anon, authenticated;

-- ===== o Radar: flashes com local, perto e recentes =====
CREATE OR REPLACE FUNCTION public.get_radar_flashes(p_lat double precision, p_lng double precision, p_radius_km numeric DEFAULT 15, p_hours integer DEFAULT 72, p_limit integer DEFAULT 120)
 RETURNS TABLE(id uuid, created_at timestamptz, author_id uuid, author_name text, author_slug text, author_avatar text, content text,
               media_url text, media_type text, like_count integer, comment_count integer, place_label text, lat double precision, lng double precision, distance_km numeric)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
    WITH near AS (
        SELECT f.*, (6371 * 2 * asin(sqrt(power(sin(radians(f.place_lat - p_lat) / 2), 2)
                   + cos(radians(p_lat)) * cos(radians(f.place_lat)) * power(sin(radians(f.place_lng - p_lng) / 2), 2))))::numeric AS km
          FROM public.flashes f
         WHERE f.place_lat IS NOT NULL
           AND f.created_at > now() - make_interval(hours => LEAST(GREATEST(COALESCE(p_hours, 72), 1), 720))
           AND f.place_lat BETWEEN p_lat - 0.5 AND p_lat + 0.5 AND f.place_lng BETWEEN p_lng - 0.5 AND p_lng + 0.5
           AND NOT public._is_hidden('flash', f.id)
    )
    SELECT n.id, n.created_at, n.author_id, p.name, p."profileSlug", p.avatar_url, n.content, n.media_url, n.media_type,
           n.like_count, n.comment_count, n.place_label, n.place_lat, n.place_lng, round(n.km, 2)
      FROM near n JOIN public.profiles p ON p.id = n.author_id
     WHERE COALESCE(p.is_active, true) AND NOT COALESCE(p.is_blocked, false)
       AND n.km <= LEAST(GREATEST(COALESCE(p_radius_km, 15), 0.5), 50)
     ORDER BY n.created_at DESC
     LIMIT LEAST(GREATEST(COALESCE(p_limit, 120), 1), 200);
$$;
REVOKE ALL ON FUNCTION public.get_radar_flashes(double precision, double precision, numeric, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_radar_flashes(double precision, double precision, numeric, integer, integer) TO anon, authenticated;
