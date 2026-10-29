-- PRÉVIA EM VÍDEO na vitrine dos produtos digitais: o vendedor marca UM vídeo curto (até 30 s) como "prévia da vitrine" (`is_teaser`). Ele é público (qualquer pessoa vê),
-- NÃO faz parte do conteúdo vendido (some do sumário, da contagem e da biblioteca) e a vitrine só toca os primeiros 15 s. Sem prévia curta, a vitrine usa a primeira aula
-- GRÁTIS em vídeo (is_preview). Sem nenhuma das duas o produto não tem prévia: o cartão mostra só a capa — "se o curso permitir".
-- Rollback: supabase/rollbacks/digital_preview_rollback.sql
ALTER TABLE public.digital_contents ADD COLUMN IF NOT EXISTS is_teaser boolean NOT NULL DEFAULT false;
ALTER TABLE public.digital_contents DROP CONSTRAINT IF EXISTS digital_contents_teaser_check;
ALTER TABLE public.digital_contents ADD CONSTRAINT digital_contents_teaser_check CHECK (NOT is_teaser OR (kind = 'video' AND COALESCE(duration_seconds, 0) BETWEEN 1 AND 30));

-- sumário da vitrine/produto: a prévia curta não faz parte do que se compra
CREATE OR REPLACE FUNCTION public.get_digital_curriculum(p_product uuid)
RETURNS TABLE (id uuid, module_title text, title text, kind text, duration_seconds integer, size_bytes bigint, "position" integer, is_preview boolean, unlocked boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    WITH me AS (SELECT public._digital_access(p_product, auth.uid()) AS ok)
    SELECT c.id, c.module_title, c.title, c.kind, c.duration_seconds, c.size_bytes, c."position", c.is_preview, (c.is_preview OR (SELECT ok FROM me)) AS unlocked
      FROM public.digital_contents c
      JOIN public.products p ON p.id = c.product_id
     WHERE c.product_id = p_product AND p.type = 'digital' AND NOT c.is_teaser AND (p.is_active OR (SELECT ok FROM me))
     ORDER BY c."position", c.created_at;
$$;

-- a prévia curta abre para qualquer pessoa (é pública de propósito)
CREATE OR REPLACE FUNCTION public.get_digital_item_access(p_item uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.digital_contents;
BEGIN
    SELECT * INTO c FROM public.digital_contents WHERE id = p_item;
    IF NOT FOUND THEN RETURN jsonb_build_object('allowed', false); END IF;
    IF NOT (c.is_preview OR c.is_teaser OR public._digital_access(c.product_id, auth.uid())) THEN RETURN jsonb_build_object('allowed', false); END IF;
    RETURN jsonb_build_object('allowed', true, 'kind', c.kind, 'title', c.title, 'storage_path', c.storage_path, 'external_url', c.external_url, 'mime_type', c.mime_type);
END $$;

CREATE OR REPLACE FUNCTION public.get_my_digital_library()
RETURNS TABLE (product_id uuid, product_name text, product_slug text, store_slug text, store_name text, image_url text, purchased_at timestamptz, items_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT p.id, p.name, p.slug, s."storeSlug", s.name, p.image_url, max(o.created_at),
           (SELECT count(*) FROM public.digital_contents c WHERE c.product_id = p.id AND NOT c.is_teaser)
      FROM public.order_items oi
      JOIN public.orders o ON o.id = oi.order_id AND o.buyer_id = auth.uid() AND o.status = 'paid'
      JOIN public.products p ON p.id = oi.product_id AND p.type = 'digital'
      LEFT JOIN public.stores s ON s.id = p.store_id
     WHERE auth.uid() IS NOT NULL
     GROUP BY p.id, p.name, p.slug, s."storeSlug", s.name, p.image_url
     ORDER BY max(o.created_at) DESC;
$$;

-- vitrine: contagens sem a prévia curta + qual vídeo toca como prévia (a curta primeiro; senão a primeira aula grátis em vídeo)
DROP FUNCTION IF EXISTS public.get_digital_showcase(integer, text);
CREATE FUNCTION public.get_digital_showcase(p_limit integer DEFAULT 24, p_search text DEFAULT NULL)
RETURNS TABLE (id uuid, name text, slug text, description text, image_url text, price numeric, store_id uuid, store_slug text, store_name text, store_logo text,
               view_count integer, created_at timestamptz, videos integer, audios integer, docs integer, links integer, seconds bigint, free_items integer,
               preview_item_id uuid, preview_seconds integer, preview_source text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT p.id, p.name, p.slug, p.description, p.image_url, p.price, s.id, s."storeSlug", s.name, s.logo_url,
           COALESCE(p.view_count, 0), p.created_at,
           (count(*) FILTER (WHERE c.kind = 'video'))::integer, (count(*) FILTER (WHERE c.kind = 'audio'))::integer,
           (count(*) FILTER (WHERE c.kind = 'document'))::integer, (count(*) FILTER (WHERE c.kind = 'link'))::integer,
           COALESCE(sum(c.duration_seconds), 0)::bigint, (count(*) FILTER (WHERE c.is_preview))::integer,
           pv.id, pv.duration_seconds, CASE WHEN pv.id IS NULL THEN NULL WHEN pv.is_teaser THEN 'teaser' ELSE 'lesson' END
      FROM public.products p
      JOIN public.stores s ON s.id = p.store_id AND COALESCE(s.is_active, true)
      JOIN public.digital_contents c ON c.product_id = p.id AND NOT c.is_teaser
      LEFT JOIN LATERAL (
            SELECT x.id, x.duration_seconds, x.is_teaser FROM public.digital_contents x
             WHERE x.product_id = p.id AND x.kind = 'video' AND (x.is_teaser OR x.is_preview)
             ORDER BY x.is_teaser DESC, x."position" LIMIT 1) pv ON true
     WHERE p.type = 'digital' AND COALESCE(p.is_active, true) AND p.listing_type = 'sale'
       AND (p_search IS NULL OR btrim(p_search) = '' OR p.name ILIKE '%' || btrim(p_search) || '%' OR COALESCE(p.description, '') ILIKE '%' || btrim(p_search) || '%' OR s.name ILIKE '%' || btrim(p_search) || '%')
     GROUP BY p.id, s.id, pv.id, pv.duration_seconds, pv.is_teaser
     ORDER BY COALESCE(p.view_count, 0) DESC, p.created_at DESC
     LIMIT LEAST(GREATEST(COALESCE(p_limit, 24), 1), 100);
$$;
GRANT EXECUTE ON FUNCTION public.get_digital_showcase(integer, text) TO anon, authenticated;
