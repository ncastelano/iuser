-- Desfaz 20261130000061_store_category_order.sql (a ordem escolhida pelas lojas se perde; o catálogo volta à ordem de sempre)
ALTER TABLE public.stores DROP CONSTRAINT IF EXISTS stores_category_order_check;
ALTER TABLE public.stores DROP COLUMN IF EXISTS category_order;
DROP FUNCTION IF EXISTS public._category_order_ok(text[]);
