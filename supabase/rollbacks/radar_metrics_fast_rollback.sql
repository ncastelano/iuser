-- ROLLBACK de 20261130000053_radar_metrics_fast.sql: volta a função de métricas do Radar à versão por subconsulta (a de 20260928090000) e tira os 3 índices.
-- Atenção: a versão antiga estoura o tempo limite (8 s logado / 3 s visitante) quando há milhares de produtos. Só para emergência.
BEGIN;
CREATE OR REPLACE FUNCTION public.get_radar_metrics()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    SELECT jsonb_build_object(
        'stores', COALESCE((
            SELECT jsonb_object_agg(x.id::text, jsonb_build_object('sales', x.sales, 'comments', x.comments, 'followers', x.followers))
            FROM (
                SELECT st.id,
                    (SELECT count(*) FROM public.orders o WHERE o.store_id = st.id AND o.status = 'paid') AS sales,
                    (SELECT count(*) FROM public.comments c JOIN public.products p ON p.id = c.publication_id WHERE p.store_id = st.id)
                      + (SELECT count(*) FROM public.product_reviews r WHERE r.store_id = st.id AND btrim(COALESCE(r.comment, '')) <> '') AS comments,
                    (SELECT count(*) FROM public.follows f WHERE f.following_id = st.id) AS followers
                FROM public.stores st
            ) x
        ), '{}'::jsonb),
        'products', COALESCE((
            SELECT jsonb_object_agg(y.id::text, jsonb_build_object('sales', y.sales, 'comments', y.comments))
            FROM (
                SELECT p.id,
                    COALESCE((SELECT sum(oi.quantity) FROM public.order_items oi JOIN public.orders o ON o.id = oi.order_id
                              WHERE oi.product_id = p.id AND o.status = 'paid'), 0) AS sales,
                    (SELECT count(*) FROM public.comments c WHERE c.publication_id = p.id)
                      + (SELECT count(*) FROM public.product_reviews r WHERE r.product_id = p.id AND btrim(COALESCE(r.comment, '')) <> '') AS comments
                FROM public.products p
            ) y
        ), '{}'::jsonb)
    );
$$;
DROP INDEX IF EXISTS public.idx_order_items_product_id;
DROP INDEX IF EXISTS public.idx_product_reviews_product_id;
DROP INDEX IF EXISTS public.idx_product_reviews_store_id;
COMMIT;
