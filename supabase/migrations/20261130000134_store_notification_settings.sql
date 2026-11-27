-- 20261130000134 — interruptores dos avisos do DONO da loja no celular (visita, produto visto, item na sacola).
-- Cada loja tem a sua escolha (padrão: ligado). Só o dono lê e altera (RPCs). O pedido novo NÃO tem interruptor aqui (é o aviso de venda).
-- Rollback: supabase/rollbacks/store_notification_settings_rollback.sql

CREATE TABLE IF NOT EXISTS public.store_notification_settings (
    store_id uuid PRIMARY KEY REFERENCES public.stores(id) ON DELETE CASCADE,
    visit_push boolean NOT NULL DEFAULT true,
    product_view_push boolean NOT NULL DEFAULT true,
    cart_push boolean NOT NULL DEFAULT true,
    updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.store_notification_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.store_notification_settings FROM PUBLIC, anon, authenticated;

-- o dono lê as escolhas da própria loja
CREATE OR REPLACE FUNCTION public.get_store_notification_settings(p_store uuid)
RETURNS TABLE (visit_push boolean, product_view_push boolean, cart_push boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM public.stores WHERE id = p_store AND owner_id = auth.uid()) THEN
        RAISE EXCEPTION 'Só o dono da loja vê estes avisos' USING ERRCODE = '42501';
    END IF;
    RETURN QUERY
    SELECT COALESCE(s.visit_push, true), COALESCE(s.product_view_push, true), COALESCE(s.cart_push, true)
    FROM (SELECT 1) AS one
    LEFT JOIN public.store_notification_settings s ON s.store_id = p_store;
END;
$$;

-- o dono liga/desliga cada aviso (só a própria loja)
CREATE OR REPLACE FUNCTION public.set_store_notification_settings(p_store uuid, p_visit boolean, p_product_view boolean, p_cart boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM public.stores WHERE id = p_store AND owner_id = auth.uid()) THEN
        RAISE EXCEPTION 'Só o dono da loja altera estes avisos' USING ERRCODE = '42501';
    END IF;
    INSERT INTO public.store_notification_settings (store_id, visit_push, product_view_push, cart_push, updated_at)
    VALUES (p_store, COALESCE(p_visit, true), COALESCE(p_product_view, true), COALESCE(p_cart, true), now())
    ON CONFLICT (store_id) DO UPDATE SET visit_push = EXCLUDED.visit_push, product_view_push = EXCLUDED.product_view_push,
        cart_push = EXCLUDED.cart_push, updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.get_store_notification_settings(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_store_notification_settings(uuid, boolean, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_store_notification_settings(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_store_notification_settings(uuid, boolean, boolean, boolean) TO authenticated;

-- o aviso respeita a escolha da loja ANTES de gastar a janela de 10 minutos
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
    v_on boolean := true;
BEGIN
    SELECT owner_id, "storeSlug" INTO v_owner, v_slug
    FROM public.stores
    WHERE id = p_store AND is_active = true AND COALESCE(is_private, false) = false;
    IF v_owner IS NULL THEN RETURN; END IF;

    SELECT CASE p_kind
             WHEN 'store_visit' THEN s.visit_push
             WHEN 'store_product_view' THEN s.product_view_push
             WHEN 'store_cart_add' THEN s.cart_push
             ELSE true END
      INTO v_on
    FROM (SELECT 1) AS one
    LEFT JOIN public.store_notification_settings s ON s.store_id = p_store;
    IF COALESCE(v_on, true) = false THEN RETURN; END IF;

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
