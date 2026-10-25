-- Modelo da loja: como a página se apresenta e qual é o botão central.
--   products = vende produtos        → botão central COMPRAR
--   services = atende com serviços   → botão central AGENDAR (serviços em linhas com duração e preço)
--   mixed    = os dois               → COMPRAR e AGENDAR lado a lado
-- É só apresentação (nenhuma permissão, preço ou regra de pedido depende disso) e é dado público da página da loja:
-- entra nas três listas de colunas públicas (esta migration, src/lib/publicColumns.ts e o teste). O dono escolhe ao criar e pode trocar depois.
-- Lojas que já existem recebem o modelo que o catálogo delas indica (só serviços com agenda = services; só produtos = products; senão mixed).

DO $$
DECLARE
    model_cols text[] := ARRAY['store_model'];
    cols text;
BEGIN
    ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS store_model text NOT NULL DEFAULT 'mixed';
    ALTER TABLE public.stores DROP CONSTRAINT IF EXISTS stores_store_model_check;
    ALTER TABLE public.stores ADD CONSTRAINT stores_store_model_check CHECK (store_model IN ('products', 'services', 'mixed'));
    SELECT string_agg(quote_ident(x), ', ') INTO cols FROM unnest(model_cols) x;
    EXECUTE format('GRANT SELECT (%s) ON public.stores TO anon, authenticated', cols);
    EXECUTE format('GRANT UPDATE (%s) ON public.stores TO authenticated', cols);
END $$;

UPDATE public.stores s SET store_model = CASE
    WHEN c.goods = 0 AND c.services > 0 THEN 'services'
    WHEN c.goods > 0 AND c.services = 0 THEN 'products'
    ELSE 'mixed' END
FROM (
    SELECT st.id,
           count(*) FILTER (WHERE p.type <> 'service') AS goods,
           count(*) FILTER (WHERE p.type = 'service') AS services
    FROM public.stores st
    LEFT JOIN public.products p ON p.store_id = st.id AND p.listing_type = 'sale' AND COALESCE(p.is_active, true)
    GROUP BY st.id
) c
WHERE c.id = s.id AND s.store_model = 'mixed';
