-- 20261130000133 — avisos do DONO da loja no celular (notificação do aparelho): alguém visitou a loja, viu um produto ou
-- colocou um item na sacola. Cada aviso vira uma linha em profile_notifications do dono; o push sai pelo gatilho já existente
-- (profile_notifications_live_push → /api/internal/delivery-events). Para não virar enxurrada: no máximo UM aviso por loja e por
-- tipo a cada 10 minutos (tabela store_activity_push). Pedido novo já tem push próprio (webhook de pedidos): não muda.
-- Rollback: supabase/rollbacks/store_owner_push_rollback.sql

-- 1) o banco aceita os três tipos novos
ALTER TABLE public.profile_notifications DROP CONSTRAINT IF EXISTS profile_notifications_kind_check;
ALTER TABLE public.profile_notifications ADD CONSTRAINT profile_notifications_kind_check CHECK (kind = ANY (ARRAY[
  'appointment_cancelled','appointment_changed','appointment_confirmed','appointment_new','comment_like','comment_reply','customer_review',
  'delivery_at_door','delivery_cancelled','delivery_completed','delivery_done','delivery_driver_accepted','delivery_driver_arrived',
  'delivery_driver_assigned','delivery_driver_cancelled','delivery_driver_idle','delivery_driver_waiting','delivery_issue','delivery_late',
  'delivery_message','delivery_order_preparing','delivery_order_ready','delivery_picked_up','delivery_quit_blocked','digital_access_released',
  'digital_order_new','dispute_update','dues_update','favorite_accepted','favorite_declined','favorite_invite','follow','group_invite',
  'invite_signup','link_visit','moderation_update','order_accepted','order_customer_cancelled','order_customer_update','order_delivered',
  'order_new','order_no_driver','order_payment','order_ready','order_rejected','order_store_timeout','order_waiting_store','product_like',
  'profile_comment','profile_view','publication_comment','publication_like','ride_application','ride_offer_agreed','ride_offer_declined',
  'ride_offer_expired','ride_offer_new','ride_review','ride_selected','ride_wait_declined','ride_wait_ended','ride_wait_requested',
  'ride_wait_started','service_application','service_completed','service_like','service_review','service_selected','store_reject_warning',
  'store_client_request','store_client_approved',
  'store_visit','store_product_view','store_cart_add'
]::text[]));

-- 2) o gatilho de push passa a conhecer os três tipos
CREATE OR REPLACE FUNCTION public.trg_ping_live_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    IF NEW.kind = ANY (ARRAY[
        'delivery_driver_assigned', 'delivery_picked_up', 'delivery_at_door', 'delivery_message', 'delivery_issue',
        'delivery_driver_accepted', 'delivery_driver_arrived', 'delivery_driver_cancelled', 'delivery_cancelled',
        'delivery_order_ready', 'delivery_completed',
        'favorite_invite', 'favorite_accepted', 'favorite_declined',
        'dues_update', 'dispute_update',
        'moderation_update',
        'ride_offer_new', 'ride_offer_declined', 'ride_offer_agreed', 'ride_offer_expired',
        'ride_wait_requested', 'ride_wait_started', 'ride_wait_declined', 'ride_wait_ended',
        'order_waiting_store', 'order_store_timeout', 'order_customer_cancelled',
        'delivery_driver_idle', 'delivery_driver_waiting', 'delivery_late', 'delivery_quit_blocked', 'store_reject_warning',
        'order_no_driver', 'order_payment',
        'store_client_request', 'store_client_approved',
        'store_visit', 'store_product_view', 'store_cart_add'
    ]) THEN
        PERFORM public._ping_delivery_events();
    END IF;
    RETURN NEW;
END; $function$;

-- 3) limite de um aviso por loja e tipo a cada 10 minutos (só o banco escreve)
CREATE TABLE IF NOT EXISTS public.store_activity_push (
    store_id uuid NOT NULL,
    kind text NOT NULL,
    last_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (store_id, kind)
);
ALTER TABLE public.store_activity_push ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.store_activity_push FROM PUBLIC, anon, authenticated;

-- 4) o aviso ao dono (uma vez a cada 10 min por loja e tipo). Não aponta para loja privada nem inativa.
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

-- 5) visita: quando a visita é contada de verdade (a regra dos 30 min continua a mesma)
CREATE OR REPLACE FUNCTION public.record_store_visit(p_store_id uuid, p_session_id text, p_viewer_id uuid DEFAULT NULL::uuid, p_anonymous_id text DEFAULT NULL::text, p_device_type text DEFAULT NULL::text, p_referrer text DEFAULT NULL::text, p_user_agent text DEFAULT NULL::text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    last_visit TIMESTAMP;
BEGIN
    IF p_viewer_id IS NULL AND p_anonymous_id IS NOT NULL THEN
        SELECT created_at INTO last_visit FROM public.store_visits
        WHERE store_id = p_store_id AND anonymous_id = p_anonymous_id ORDER BY created_at DESC LIMIT 1;
    ELSIF p_viewer_id IS NOT NULL THEN
        SELECT created_at INTO last_visit FROM public.store_visits
        WHERE store_id = p_store_id AND viewer_id = p_viewer_id ORDER BY created_at DESC LIMIT 1;
    ELSE
        last_visit := NULL;
    END IF;

    IF last_visit IS NOT NULL AND (NOW() - last_visit) < INTERVAL '30 minutes' THEN
        RETURN FALSE;
    END IF;

    INSERT INTO public.store_visits (store_id, viewer_id, anonymous_id, session_id, device_type, referrer, user_agent, created_at)
    VALUES (p_store_id, p_viewer_id, p_anonymous_id, p_session_id, p_device_type, p_referrer, p_user_agent, NOW());

    UPDATE public.stores SET view_count = COALESCE(view_count, 0) + 1 WHERE id = p_store_id;

    PERFORM public._store_owner_push(p_store_id, 'store_visit', 'Toque para ver o painel da loja.');
    RETURN TRUE;
END;
$function$;

-- 6) produto visto: conta (com o limite de sempre) e avisa o dono
CREATE OR REPLACE FUNCTION public.increment_product_view_count(p_product_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v int; v_store uuid; v_name text;
BEGIN
    IF public._counter_allow('product_view', p_product_id) THEN
        UPDATE public.products SET view_count = COALESCE(view_count, 0) + 1 WHERE id = p_product_id RETURNING view_count, store_id, name INTO v, v_store, v_name;
        IF v_store IS NOT NULL THEN
            PERFORM public._store_owner_push(v_store, 'store_product_view', COALESCE(v_name, 'Um produto'));
        END IF;
    ELSE
        SELECT view_count INTO v FROM public.products WHERE id = p_product_id;
    END IF;
    RETURN v;
END; $function$;

-- 7) item na sacola: o app chama ao adicionar (pela loja e pelo produto)
CREATE OR REPLACE FUNCTION public.notify_store_cart_add(p_store_slug text, p_product_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_store uuid; v_name text;
BEGIN
    SELECT id INTO v_store FROM public.stores WHERE "storeSlug" = p_store_slug LIMIT 1;
    IF v_store IS NULL THEN RETURN; END IF;
    SELECT name INTO v_name FROM public.products WHERE id = p_product_id AND store_id = v_store;
    IF v_name IS NULL THEN RETURN; END IF;
    PERFORM public._store_owner_push(v_store, 'store_cart_add', v_name);
END;
$$;
REVOKE ALL ON FUNCTION public.notify_store_cart_add(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_store_cart_add(text, uuid) TO anon, authenticated;
