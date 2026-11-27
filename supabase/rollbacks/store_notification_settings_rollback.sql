-- Rollback da 20261130000134: volta a função de aviso da 20261130000133 (sem interruptor) e apaga os interruptores.
CREATE OR REPLACE FUNCTION public._store_owner_push(p_store uuid, p_kind text, p_text text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_owner uuid;
    v_slug text;
    v_last timestamptz;
BEGIN
    SELECT owner_id, "storeSlug" INTO v_owner, v_slug
    FROM public.stores
    WHERE id = p_store AND is_active = true AND COALESCE(is_private, false) = false;
    IF v_owner IS NULL THEN RETURN; END IF;
    SELECT last_at INTO v_last FROM public.store_activity_push WHERE store_id = p_store AND kind = p_kind;
    IF v_last IS NOT NULL AND now() - v_last < interval '10 minutes' THEN RETURN; END IF;
    INSERT INTO public.store_activity_push (store_id, kind, last_at) VALUES (p_store, p_kind, now())
    ON CONFLICT (store_id, kind) DO UPDATE SET last_at = EXCLUDED.last_at;
    INSERT INTO public.profile_notifications (profile_id, kind, meta)
    VALUES (v_owner, p_kind, jsonb_build_object(
        'title', CASE p_kind
            WHEN 'store_visit' THEN 'Alguém visitou sua loja'
            WHEN 'store_product_view' THEN 'Alguém está vendo um produto'
            WHEN 'store_cart_add' THEN 'Alguém colocou um item na sacola'
            ELSE 'Movimento na sua loja' END,
        'text', p_text,
        'path', '/painel-loja/' || v_slug));
END;
$$;
REVOKE ALL ON FUNCTION public._store_owner_push(uuid, text, text) FROM PUBLIC, anon, authenticated;
DROP FUNCTION IF EXISTS public.set_store_notification_settings(uuid, boolean, boolean, boolean);
DROP FUNCTION IF EXISTS public.get_store_notification_settings(uuid);
DROP TABLE IF EXISTS public.store_notification_settings;
