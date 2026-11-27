-- Rollback da 20261130000133: tira os avisos do dono da loja no celular e volta as funções anteriores.
DROP FUNCTION IF EXISTS public.notify_store_cart_add(text, uuid);
DROP FUNCTION IF EXISTS public._store_owner_push(uuid, text, text);
DROP TABLE IF EXISTS public.store_activity_push;
-- record_store_visit / increment_product_view_count / trg_ping_live_push: volte as versões de
-- supabase/migrations/20261130000079_security_hardening.sql e 20261130000010_live_push.sql (copie daí).
