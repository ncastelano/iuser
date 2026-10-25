DROP FUNCTION IF EXISTS public.increment_product_share_count(uuid);
ALTER TABLE public.products DROP COLUMN IF EXISTS share_count;
