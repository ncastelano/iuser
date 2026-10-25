-- Links da loja: a própria loja escreve o texto e o endereço (ex.: "Cardápio completo" → https://...) e eles aparecem sob a descrição.
-- Substitui o desenho de uma coluna por rede social (instagram/youtube/facebook/x das lojas): aqui é uma lista livre, no máximo 8 itens.
-- É dado público da página da loja (entra nas três listas de colunas públicas: esta migration, src/lib/publicColumns.ts e o teste).
-- Segurança: só http(s) (nunca javascript:/data:), texto até 40 e endereço até 300 caracteres, cada item só com `label` e `url`.

CREATE OR REPLACE FUNCTION public.store_links_valid(p jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
    SELECT jsonb_typeof(p) = 'array' AND jsonb_array_length(p) <= 8 AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(p) e
        WHERE jsonb_typeof(e) <> 'object'
           OR (SELECT count(*) FROM jsonb_object_keys(e)) <> 2
           OR jsonb_typeof(e->'label') IS DISTINCT FROM 'string'
           OR jsonb_typeof(e->'url') IS DISTINCT FROM 'string'
           OR char_length(btrim(e->>'label')) NOT BETWEEN 1 AND 40
           OR char_length(e->>'url') > 300
           OR (e->>'url') !~* '^https?://[^[:space:]]+\.[^[:space:]]+$'
    );
$$;

DO $$
DECLARE
    links_cols text[] := ARRAY['links'];
    cols text;
BEGIN
    ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS links jsonb NOT NULL DEFAULT '[]'::jsonb;
    ALTER TABLE public.stores DROP CONSTRAINT IF EXISTS stores_links_valid;
    ALTER TABLE public.stores ADD CONSTRAINT stores_links_valid CHECK (public.store_links_valid(links));
    SELECT string_agg(quote_ident(x), ', ') INTO cols FROM unnest(links_cols) x;
    EXECUTE format('GRANT SELECT (%s) ON public.stores TO anon, authenticated', cols);
    EXECUTE format('GRANT UPDATE (%s) ON public.stores TO authenticated', cols);
END $$;
