-- Desfaz 20261130000017_store_promotions.sql (os combos já criados viram produtos comuns da categoria Promoções: apague-os antes se não quiser mantê-los)
DROP FUNCTION IF EXISTS public.get_store_promotions(integer);
DROP FUNCTION IF EXISTS public.save_store_combo(uuid, uuid, text, text, numeric, jsonb, text, boolean);
DROP TRIGGER IF EXISTS trg_deactivate_combo_on_item_removed ON public.product_bundle_items;
DROP FUNCTION IF EXISTS public.deactivate_combo_on_item_removed();
DROP TRIGGER IF EXISTS trg_refresh_combos_on_item_price ON public.products;
DROP FUNCTION IF EXISTS public.refresh_combos_on_item_price();
DROP TRIGGER IF EXISTS trg_guard_products_combo ON public.products;
DROP FUNCTION IF EXISTS public.guard_products_combo();
DROP TABLE IF EXISTS public.product_bundle_items;
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_compare_at_check;
ALTER TABLE public.products DROP COLUMN IF EXISTS combo_image_uploaded;
ALTER TABLE public.products DROP COLUMN IF EXISTS compare_at_price;
ALTER TABLE public.products DROP COLUMN IF EXISTS is_combo;
