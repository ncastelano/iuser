-- 20261130000060_creator_store_models.sql
--
-- MODELOS DE LOJA PARA CRIADORES (decisão do dono, 09/11/2026). Além de produtos / atendimento / mista, a loja pode ser:
--   · studio    — produtores de ÁUDIO (beats, samples, mixagens): sem botão principal; no topo a FAIXA ou o ÁLBUM principal;
--   · content   — produtores de MÚSICA e AUDIOLIVRO: a página abre nos conteúdos;
--   · publisher — EDITORA: venda de LIVROS em PDF, com PRÉVIA de algumas páginas (ou o livro todo, se for grátis).
-- Como os outros modelos, isto é SÓ apresentação: nenhuma permissão, preço ou pedido depende do modelo.
--
-- Peças:
--   1) o CHECK de stores.store_model aceita os três novos;
--   2) products.is_featured = o DESTAQUE da loja (a faixa/álbum principal do Studio). Um por loja (índice único parcial).
--      Quem marca é set_store_featured (só o dono da loja; troca atomicamente o anterior);
--   3) PRÉVIA DE LIVRO: um item de digital_contents com is_teaser = true e kind = 'document' (um PDF com as primeiras páginas, gerado
--      pelo servidor a partir do livro). Antes o "teaser" só podia ser vídeo/áudio de até 30 s. preview_pages guarda quantas páginas.
--      get_digital_book_preview(produto) entrega o item da prévia a qualquer pessoa (como get_digital_audio_preview);
--      o arquivo continua no bucket PRIVADO e só abre por link assinado (/api/digital/open já libera teaser).

-- 1) modelos
ALTER TABLE public.stores DROP CONSTRAINT IF EXISTS stores_store_model_check;
ALTER TABLE public.stores ADD CONSTRAINT stores_store_model_check
    CHECK (store_model IN ('products', 'services', 'mixed', 'studio', 'content', 'publisher'));

-- 2) destaque da loja
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS is_featured boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS products_one_featured_per_store ON public.products (store_id) WHERE is_featured AND store_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.set_store_featured(p_store uuid, p_product uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM public.stores s WHERE s.id = p_store AND s.owner_id = auth.uid()) THEN
        RAISE EXCEPTION 'Só a dona da loja escolhe o destaque.' USING ERRCODE = '42501';
    END IF;
    IF p_product IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.id = p_product AND p.store_id = p_store) THEN
        RAISE EXCEPTION 'Este item não é da sua loja.' USING ERRCODE = '22023';
    END IF;
    UPDATE public.products SET is_featured = false WHERE store_id = p_store AND is_featured AND id IS DISTINCT FROM p_product;
    IF p_product IS NOT NULL THEN UPDATE public.products SET is_featured = true WHERE id = p_product; END IF;
END $$;
REVOKE ALL ON FUNCTION public.set_store_featured(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_store_featured(uuid, uuid) TO authenticated, service_role;

-- 3) prévia de livro (PDF)
ALTER TABLE public.digital_contents ADD COLUMN IF NOT EXISTS preview_pages integer;
ALTER TABLE public.digital_contents DROP CONSTRAINT IF EXISTS digital_contents_preview_pages_check;
ALTER TABLE public.digital_contents ADD CONSTRAINT digital_contents_preview_pages_check
    CHECK (preview_pages IS NULL OR (preview_pages BETWEEN 1 AND 50 AND kind = 'document' AND is_teaser));
ALTER TABLE public.digital_contents DROP CONSTRAINT IF EXISTS digital_contents_teaser_check;
ALTER TABLE public.digital_contents ADD CONSTRAINT digital_contents_teaser_check CHECK (
    NOT is_teaser
    OR (kind IN ('video', 'audio') AND COALESCE(duration_seconds, 0) BETWEEN 1 AND 30)
    OR (kind = 'document' AND preview_pages IS NOT NULL)
);

CREATE OR REPLACE FUNCTION public.get_digital_book_preview(p_product uuid)
RETURNS TABLE(item_id uuid, pages integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT c.id, c.preview_pages
      FROM public.digital_contents c
      JOIN public.products p ON p.id = c.product_id
     WHERE c.product_id = p_product AND p.type = 'digital' AND p.is_active AND c.is_teaser AND c.kind = 'document'
       AND NOT public._is_hidden('digital_product', p.id)
     ORDER BY c.created_at DESC LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.get_digital_book_preview(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_digital_book_preview(uuid) TO anon, authenticated, service_role;

-- a vitrine passa a devolver o destaque e se o livro tem prévia (a aba da loja usa os dois)
DROP FUNCTION IF EXISTS public.get_digital_showcase(integer, text, uuid);
CREATE OR REPLACE FUNCTION public.get_digital_showcase(p_limit integer DEFAULT 24, p_search text DEFAULT NULL::text, p_store uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, name text, slug text, description text, image_url text, price numeric, store_id uuid, store_slug text, store_name text, store_logo text, view_count integer, created_at timestamp with time zone, videos integer, audios integer, docs integer, links integer, apps integer, seconds bigint, free_items integer, preview_item_id uuid, preview_seconds integer, preview_source text, digital_kind text, is_featured boolean, book_preview_pages integer)
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
           p.digital_kind, p.is_featured,
           (SELECT b.preview_pages FROM public.digital_contents b WHERE b.product_id = p.id AND b.is_teaser AND b.kind = 'document' ORDER BY b.created_at DESC LIMIT 1)
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
     ORDER BY p.is_featured DESC, COALESCE(p.view_count, 0) DESC, p.created_at DESC
     LIMIT LEAST(GREATEST(COALESCE(p_limit, 24), 1), 100);
$function$;
REVOKE ALL ON FUNCTION public.get_digital_showcase(integer, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_digital_showcase(integer, text, uuid) TO anon, authenticated, service_role;
