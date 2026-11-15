-- Desfaz 20261130000060: volta os 3 modelos de loja, o destaque e a prévia de livro (lojas nos modelos novos voltam a 'mixed').
UPDATE public.stores SET store_model = 'mixed' WHERE store_model IN ('studio', 'content', 'publisher');
ALTER TABLE public.stores DROP CONSTRAINT IF EXISTS stores_store_model_check;
ALTER TABLE public.stores ADD CONSTRAINT stores_store_model_check CHECK (store_model IN ('products', 'services', 'mixed'));
DROP FUNCTION IF EXISTS public.set_store_featured(uuid, uuid);
DROP INDEX IF EXISTS public.products_one_featured_per_store;
DROP FUNCTION IF EXISTS public.get_digital_book_preview(uuid);
DELETE FROM public.digital_contents WHERE is_teaser AND kind = 'document';
ALTER TABLE public.digital_contents DROP CONSTRAINT IF EXISTS digital_contents_preview_pages_check;
ALTER TABLE public.digital_contents DROP CONSTRAINT IF EXISTS digital_contents_teaser_check;
ALTER TABLE public.digital_contents ADD CONSTRAINT digital_contents_teaser_check CHECK (((NOT is_teaser) OR ((kind = ANY (ARRAY['video'::text, 'audio'::text])) AND ((COALESCE(duration_seconds, 0) >= 1) AND (COALESCE(duration_seconds, 0) <= 30)))));
ALTER TABLE public.digital_contents DROP COLUMN IF EXISTS preview_pages;
DROP FUNCTION IF EXISTS public.get_digital_showcase(integer, text, uuid);
CREATE OR REPLACE FUNCTION public.get_digital_showcase(p_limit integer DEFAULT 24, p_search text DEFAULT NULL::text, p_store uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, name text, slug text, description text, image_url text, price numeric, store_id uuid, store_slug text, store_name text, store_logo text, view_count integer, created_at timestamp with time zone, videos integer, audios integer, docs integer, links integer, apps integer, seconds bigint, free_items integer, preview_item_id uuid, preview_seconds integer, preview_source text, digital_kind text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT p.id, p.name, p.slug, p.description, p.image_url, p.price, s.id, s."storeSlug", s.name, s.logo_url,
           COALESCE(p.view_count, 0), p.created_at,
           (count(*) FILTER (WHERE c.kind = 'video'))::integer, (count(*) FILTER (WHERE c.kind = 'audio'))::integer,
           (count(*) FILTER (WHERE c.kind = 'document'))::integer, (count(*) FILTER (WHERE c.kind = 'link'))::integer, (count(*) FILTER (WHERE c.kind = 'app'))::integer,
           COALESCE(sum(c.duration_seconds), 0)::bigint, (count(*) FILTER (WHERE c.is_preview))::integer,
           pv.id, pv.duration_seconds, CASE WHEN pv.id IS NULL THEN NULL WHEN pv.is_teaser THEN 'teaser' ELSE 'lesson' END,
           p.digital_kind
      FROM public.products p
      JOIN public.stores s ON s.id = p.store_id AND COALESCE(s.is_active, true)
      JOIN public.digital_contents c ON c.product_id = p.id AND NOT c.is_teaser
      LEFT JOIN LATERAL (
            SELECT x.id, x.duration_seconds, x.is_teaser FROM public.digital_contents x
             WHERE x.product_id = p.id AND x.kind = 'video' AND (x.is_teaser OR x.is_preview)
             ORDER BY x.is_teaser DESC, x."position" LIMIT 1) pv ON true
     WHERE p.type = 'digital' AND COALESCE(p.is_active, true) AND p.listing_type = 'sale'
       AND (p_store IS NULL OR p.store_id = p_store)
       AND (p_search IS NULL OR btrim(p_search) = '' OR p.name ILIKE '%' || btrim(p_search) || '%' OR COALESCE(p.description, '') ILIKE '%' || btrim(p_search) || '%' OR s.name ILIKE '%' || btrim(p_search) || '%')
     GROUP BY p.id, s.id, pv.id, pv.duration_seconds, pv.is_teaser
     ORDER BY COALESCE(p.view_count, 0) DESC, p.created_at DESC
     LIMIT LEAST(GREATEST(COALESCE(p_limit, 24), 1), 100);
$function$;
REVOKE ALL ON FUNCTION public.get_digital_showcase(integer, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_digital_showcase(integer, text, uuid) TO anon, authenticated, service_role;
ALTER TABLE public.products DROP COLUMN IF EXISTS is_featured;
