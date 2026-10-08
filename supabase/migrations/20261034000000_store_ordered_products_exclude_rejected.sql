-- "Outras pessoas pediram" não conta pedido recusado (rejected), só os que valeram.
CREATE OR REPLACE FUNCTION public.get_store_ordered_products(p_store_id uuid, p_exclude_product uuid DEFAULT NULL)
RETURNS TABLE(product_id uuid, buyers bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    SELECT oi.product_id, COUNT(DISTINCT COALESCE(o.buyer_id::text, o.id::text)) AS buyers
    FROM public.orders o
    JOIN public.order_items oi ON oi.order_id = o.id
    JOIN public.products p ON p.id = oi.product_id AND p.store_id = p_store_id AND p.is_active
    WHERE o.store_id = p_store_id
      AND o.status NOT IN ('cancelled', 'canceled', 'rejected')
      AND (p_exclude_product IS NULL OR oi.product_id <> p_exclude_product)
    GROUP BY oi.product_id
    ORDER BY buyers DESC, MAX(o.created_at) DESC
    LIMIT 12;
$$;
