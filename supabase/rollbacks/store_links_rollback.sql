-- Desfaz 20261113000000_store_links.sql (apaga os links das lojas)
ALTER TABLE public.stores DROP CONSTRAINT IF EXISTS stores_links_valid;
ALTER TABLE public.stores DROP COLUMN IF EXISTS links;
DROP FUNCTION IF EXISTS public.store_links_valid(jsonb);
