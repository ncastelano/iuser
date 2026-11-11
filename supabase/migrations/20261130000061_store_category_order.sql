-- 20261130000061_store_category_order.sql
--
-- ORDEM DAS CATEGORIAS DO CATÁLOGO, escolhida pela loja (Editar loja → Catálogo → "Ordenar categorias", 3.0; o desenho veio do
-- laboratório /painel-teste). Antes a ordem era fixa: "Promoções" primeiro e depois as categorias com mais itens.
--   · stores.category_order text[] — os nomes das categorias na ordem escolhida. NULL = a ordem de sempre.
--   · PÚBLICA (o catálogo do cliente precisa ler): entra nas três listas (esta migration, src/lib/publicColumns.ts e o teste de exposição).
--   · Gravável pelo dono como as outras colunas de apresentação da loja (o GRANT UPDATE por coluna do bloqueio 20261105 só exclui as de
--     sistema; coluna nova precisa do GRANT aqui).
--   · Categoria que não está na lista (nova, ou de outro ambiente) vai DEPOIS das escolhidas, pela regra de sempre (src/lib/categoryOrder.ts).
--   · Limite: até 60 nomes de até 60 letras (CHECK); nada além disso depende desta coluna.
DO $$
DECLARE
    order_cols text[] := ARRAY['category_order'];
    cols text;
BEGIN
    ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS category_order text[];
    SELECT string_agg(quote_ident(x), ', ') INTO cols FROM unnest(order_cols) x;
    EXECUTE format('GRANT SELECT (%s) ON public.stores TO anon, authenticated', cols);
    EXECUTE format('GRANT UPDATE (%s) ON public.stores TO authenticated', cols);
END $$;

-- a conferência do conteúdo mora numa função IMUTÁVEL (CHECK não aceita subconsulta)
CREATE OR REPLACE FUNCTION public._category_order_ok(p text[]) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
    SELECT p IS NULL OR (
        cardinality(p) <= 60
        AND array_position(p, NULL) IS NULL
        AND NOT EXISTS (SELECT 1 FROM unnest(p) c WHERE length(c) > 60 OR length(btrim(c)) = 0)
    )
$$;

ALTER TABLE public.stores DROP CONSTRAINT IF EXISTS stores_category_order_check;
ALTER TABLE public.stores ADD CONSTRAINT stores_category_order_check CHECK (public._category_order_ok(category_order));
