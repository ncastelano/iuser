-- Números públicos (só contagens agregadas) usados pelo Radar pra ordenar e
-- filtrar lojas/produtos: vendas (pedidos pagos), comentários e seguidores.
CREATE OR REPLACE FUNCTION public.get_radar_metrics()
RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
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
REVOKE ALL ON FUNCTION public.get_radar_metrics() FROM public;
GRANT EXECUTE ON FUNCTION public.get_radar_metrics() TO anon, authenticated;
