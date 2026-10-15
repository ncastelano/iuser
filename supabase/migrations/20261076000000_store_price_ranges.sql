-- Faixa de preço de cada loja ativa (menor e maior preço entre os itens à venda), pro card da loja em /lojas.
-- Só agregados: nenhum item individual é exposto por aqui.
CREATE OR REPLACE FUNCTION public.get_store_price_ranges()
RETURNS TABLE(store_id uuid, min_price numeric, max_price numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT p.store_id, min(p.price), max(p.price)
    FROM public.products p
    JOIN public.stores s ON s.id = p.store_id AND s.is_active
    WHERE p.store_id IS NOT NULL
      AND p.is_active IS NOT FALSE
      AND p.listing_type = 'sale'
      AND p.price IS NOT NULL AND p.price > 0
    GROUP BY p.store_id;
$$;
REVOKE ALL ON FUNCTION public.get_store_price_ranges() FROM public;
GRANT EXECUTE ON FUNCTION public.get_store_price_ranges() TO anon, authenticated;
