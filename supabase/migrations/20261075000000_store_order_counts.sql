-- "Mais comprados" em /lojas: quantos pedidos cada loja já recebeu (só o NÚMERO, agregado).
-- Os pedidos em si continuam privados (só o comprador e o dono da loja leem); esta função devolve apenas a contagem
-- por loja ativa, contando os pedidos que não foram recusados, cancelados nem ficaram parados em "pendente".
CREATE OR REPLACE FUNCTION public.get_store_order_counts()
RETURNS TABLE(store_id uuid, orders_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT o.store_id, count(*)::bigint
    FROM public.orders o
    JOIN public.stores s ON s.id = o.store_id AND s.is_active
    WHERE o.status NOT IN ('pending', 'rejected', 'cancelled', 'canceled')
    GROUP BY o.store_id;
$$;
REVOKE ALL ON FUNCTION public.get_store_order_counts() FROM public;
GRANT EXECUTE ON FUNCTION public.get_store_order_counts() TO anon, authenticated;
