-- Rollback de 20261130000070_flash_location.sql: tira o local dos flashes e o modo Flash do Radar; o feed volta ao formato da ...13
-- (sem place_label). ATENÇÃO: apaga o local já marcado nos flashes.
DROP FUNCTION IF EXISTS public.get_radar_flashes(double precision, double precision, numeric, integer, integer);
DROP TRIGGER IF EXISTS flashes_round_place ON public.flashes;
DROP FUNCTION IF EXISTS public.flashes_round_place();
DROP FUNCTION IF EXISTS public.get_flash_feed(text, integer, timestamptz, text);
CREATE OR REPLACE FUNCTION public.get_flash_feed(p_mode text DEFAULT 'all'::text, p_limit integer DEFAULT 20, p_before timestamp with time zone DEFAULT NULL::timestamp with time zone, p_kind text DEFAULT NULL::text)
 RETURNS TABLE(kind text, id uuid, created_at timestamp with time zone, author_id uuid, author_name text, author_slug text, author_avatar text, title text, content text, media_url text, media_type text, like_count integer, comment_count integer, share_count integer, liked boolean, following boolean, link text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    -- DEFINER: confere is_active/is_blocked do autor (colunas privadas de profiles) mas só DEVOLVE o que é público (nome, @, foto)
    WITH items AS (
        SELECT 'flash'::text AS kind, f.id, f.created_at, f.author_id, NULL::text AS title, f.content, f.media_url, f.media_type,
               f.like_count, f.comment_count, f.share_count,
               EXISTS (SELECT 1 FROM public.flash_likes l WHERE l.flash_id = f.id AND l.profile_id = (SELECT auth.uid())) AS liked,
               NULL::text AS link
          FROM public.flashes f
         WHERE NOT public._is_hidden('flash', f.id)
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
$function$;
GRANT EXECUTE ON FUNCTION public.get_flash_feed(text, integer, timestamptz, text) TO anon, authenticated;
DROP INDEX IF EXISTS public.flashes_place_recent_idx;
ALTER TABLE public.flashes DROP CONSTRAINT IF EXISTS flash_place_label_len, DROP CONSTRAINT IF EXISTS flash_place_range, DROP CONSTRAINT IF EXISTS flash_place_pair;
ALTER TABLE public.flashes DROP COLUMN IF EXISTS place_label, DROP COLUMN IF EXISTS place_lng, DROP COLUMN IF EXISTS place_lat;
