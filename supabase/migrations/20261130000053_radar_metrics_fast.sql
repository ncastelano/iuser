-- Radar: `get_radar_metrics()` (vendas, comentários e seguidores de cada loja/produto, usados para ordenar e filtrar o Radar) estourava o tempo limite do servidor
-- (11,5 s no banco local com 4,6 mil produtos e 47 mil itens de pedido; o limite é 8 s para quem está logado e 3 s para visitante → erro 500 e o Radar ficava sem
-- "mais vendidos/comentados/seguidos"). Causa: para CADA produto ela varria `order_items` inteira (não há índice por produto) e fazia contagens em `product_reviews`
-- (sem índice por produto/loja); o custo crescia loja × pedidos. Conserto:
--   1) índices que faltavam: order_items(product_id), product_reviews(product_id), product_reviews(store_id);
--   2) a conta agora é feita UMA vez, agrupando (em vez de uma subconsulta por produto);
--   3) produto sem nenhum número não entra no resultado (o Radar já trata o que falta como 0: `Number(m?.sales) || 0`), o que também encolhe a resposta.
-- O resultado das lojas e de todos os produtos com algum número é o MESMO de antes (conferido). Reaplicável. Rollback: supabase/rollbacks/radar_metrics_fast_rollback.sql

CREATE INDEX IF NOT EXISTS idx_order_items_product_id     ON public.order_items (product_id);
CREATE INDEX IF NOT EXISTS idx_product_reviews_product_id ON public.product_reviews (product_id);
CREATE INDEX IF NOT EXISTS idx_product_reviews_store_id   ON public.product_reviews (store_id);

CREATE OR REPLACE FUNCTION public.get_radar_metrics()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    WITH
    store_sales AS (SELECT o.store_id AS id, count(*) AS n FROM public.orders o WHERE o.status = 'paid' GROUP BY o.store_id),
    store_pub_comments AS (SELECT p.store_id AS id, count(*) AS n FROM public.comments c JOIN public.products p ON p.id = c.publication_id WHERE p.store_id IS NOT NULL GROUP BY p.store_id),
    store_reviews AS (SELECT r.store_id AS id, count(*) AS n FROM public.product_reviews r WHERE r.store_id IS NOT NULL AND btrim(COALESCE(r.comment, '')) <> '' GROUP BY r.store_id),
    store_followers AS (SELECT f.following_id AS id, count(*) AS n FROM public.follows f GROUP BY f.following_id),
    prod_sales AS (SELECT oi.product_id AS id, sum(oi.quantity) AS n FROM public.order_items oi JOIN public.orders o ON o.id = oi.order_id WHERE o.status = 'paid' GROUP BY oi.product_id),
    prod_pub_comments AS (SELECT c.publication_id AS id, count(*) AS n FROM public.comments c GROUP BY c.publication_id),
    prod_reviews AS (SELECT r.product_id AS id, count(*) AS n FROM public.product_reviews r WHERE btrim(COALESCE(r.comment, '')) <> '' GROUP BY r.product_id)
    SELECT jsonb_build_object(
        'stores', COALESCE((
            SELECT jsonb_object_agg(st.id::text, jsonb_build_object(
                'sales', COALESCE(ss.n, 0),
                'comments', COALESCE(sc.n, 0) + COALESCE(sr.n, 0),
                'followers', COALESCE(sf.n, 0)))
            FROM public.stores st
            LEFT JOIN store_sales ss ON ss.id = st.id
            LEFT JOIN store_pub_comments sc ON sc.id = st.id
            LEFT JOIN store_reviews sr ON sr.id = st.id
            LEFT JOIN store_followers sf ON sf.id = st.id
        ), '{}'::jsonb),
        'products', COALESCE((
            SELECT jsonb_object_agg(p.id::text, jsonb_build_object(
                'sales', COALESCE(ps.n, 0),
                'comments', COALESCE(pc.n, 0) + COALESCE(pr.n, 0)))
            FROM public.products p
            LEFT JOIN prod_sales ps ON ps.id = p.id
            LEFT JOIN prod_pub_comments pc ON pc.id = p.id
            LEFT JOIN prod_reviews pr ON pr.id = p.id
            WHERE COALESCE(ps.n, 0) + COALESCE(pc.n, 0) + COALESCE(pr.n, 0) > 0
        ), '{}'::jsonb)
    );
$$;
