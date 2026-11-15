-- VITRINE DE PRODUTOS DIGITAIS (home 2.0 e 3.0, /digitais): lista pública dos produtos digitais ativos que JÁ têm conteúdo, com a contagem do que entregam (aulas em vídeo, áudios,
-- arquivos, links, duração total e quantos itens são grátis). Só dado público: nada de caminho de arquivo nem link do conteúdo. Mais vistos primeiro.
-- Rollback: supabase/rollbacks/digital_showcase_rollback.sql
CREATE OR REPLACE FUNCTION public.get_digital_showcase(p_limit integer DEFAULT 24, p_search text DEFAULT NULL)
RETURNS TABLE (id uuid, name text, slug text, description text, image_url text, price numeric, store_id uuid, store_slug text, store_name text, store_logo text,
               view_count integer, created_at timestamptz, videos integer, audios integer, docs integer, links integer, seconds bigint, free_items integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT p.id, p.name, p.slug, p.description, p.image_url, p.price, s.id, s."storeSlug", s.name, s.logo_url,
           COALESCE(p.view_count, 0), p.created_at,
           (count(*) FILTER (WHERE c.kind = 'video'))::integer, (count(*) FILTER (WHERE c.kind = 'audio'))::integer,
           (count(*) FILTER (WHERE c.kind = 'document'))::integer, (count(*) FILTER (WHERE c.kind = 'link'))::integer,
           COALESCE(sum(c.duration_seconds), 0)::bigint, (count(*) FILTER (WHERE c.is_preview))::integer
      FROM public.products p
      JOIN public.stores s ON s.id = p.store_id AND COALESCE(s.is_active, true)
      JOIN public.digital_contents c ON c.product_id = p.id
     WHERE p.type = 'digital' AND COALESCE(p.is_active, true) AND p.listing_type = 'sale'
       AND (p_search IS NULL OR btrim(p_search) = '' OR p.name ILIKE '%' || btrim(p_search) || '%' OR COALESCE(p.description, '') ILIKE '%' || btrim(p_search) || '%' OR s.name ILIKE '%' || btrim(p_search) || '%')
     GROUP BY p.id, s.id
     ORDER BY COALESCE(p.view_count, 0) DESC, p.created_at DESC
     LIMIT LEAST(GREATEST(COALESCE(p_limit, 24), 1), 100);
$$;
GRANT EXECUTE ON FUNCTION public.get_digital_showcase(integer, text) TO anon, authenticated;
