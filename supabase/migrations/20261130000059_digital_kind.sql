-- 20261130000059_digital_kind.sql
--
-- O LOJISTA ESCOLHE O TIPO DO CONTEÚDO DIGITAL. Até aqui o sistema adivinhava o tipo pelo que o produto entrega e pelo NOME ("audiolivro..." virava
-- curso). Agora o produto digital tem `products.digital_kind` (curso, aula, playlist, música, álbum, audiolivro, podcast, filme, e-book, arquivo,
-- programa). NULL = não escolhido: continua valendo o jeito antigo (adivinhar), então nada do que já existe muda.
-- Também: a vitrine `get_digital_showcase` passa a devolver o tipo escolhido e a aceitar `p_store` (só os digitais de uma loja), que alimenta a
-- aba "Digitais" da página da loja.

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS digital_kind text;
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_digital_kind_check;
ALTER TABLE public.products ADD CONSTRAINT products_digital_kind_check CHECK (
    digital_kind IS NULL OR (type = 'digital' AND digital_kind IN ('curso','aula','playlist','musica','album','audiolivro','podcast','filme','ebook','arquivo','programa'))
);

DROP FUNCTION IF EXISTS public.get_digital_showcase(integer, text);
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
