-- 20261130000092_order_agreement.sql
--
-- CADA PEDIDO É UM COMBINADO (22/11/2026, decisão do dono). O pedido chega como NOVO e a loja RESPONDE:
--   · "Aceitar como está"  → o de sempre (pending → preparing);
--   · "Responder"          → escreve uma mensagem; ela vai na conversa da loja com o cliente (com o pedido citado) e o pedido fica
--                            "COMBINANDO" (orders.store_replied_at). O CLIENTE é quem decide o pedido: pode tirar itens ou mudar a quantidade
--                            (customer_adjust_order — o banco recalcula o total) e dizer "Está bom assim" (customer_agree_order). Aí a loja aceita.
--   · ACEITE AUTOMÁTICO (opcional, por loja): store_order_settings.auto_accept — o pedido que chega à loja já vai para "Em preparo".
-- PAGAMENTO:
--   · o QR do Pix (e o link do cartão) só aparece DEPOIS do aceite: antes o valor ainda pode mudar (get_order_payment / report_order_paid);
--   · pedido com pagamento ANTECIPADO (Pix/link) só fica PRONTO com o pagamento CONFIRMADO pela loja (gatilho orders_ready_gate, HINT payment_required).
-- ENTREGADOR DO iUSER: pedido de entrega de loja que usa o Entregador do iUser só fica PRONTO com um entregador ACEITO na entrega
--   (HINT driver_required); com o fluxo "entregador primeiro" ele já vem aceito, e no pedido antigo a loja chama pelo botão de sempre.
-- Cada resposta da loja e cada mudança do cliente reinicia o relógio do "a loja não aceitou em 10 min" (store_visible_at).
-- Rollback: supabase/rollbacks/order_agreement_rollback.sql

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS store_replied_at timestamptz;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_agreed_at timestamptz;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_adjusted_at timestamptz;

CREATE TABLE IF NOT EXISTS public.store_order_settings (
    store_id    uuid PRIMARY KEY REFERENCES public.stores(id) ON DELETE CASCADE,
    auto_accept boolean NOT NULL DEFAULT false,
    updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.store_order_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.store_order_settings FROM anon, authenticated;
GRANT ALL ON public.store_order_settings TO service_role;

-- aviso novo: o cliente mexeu no pedido / disse que está bom (ilha da loja)
DO $$
DECLARE def text; kinds text[];
BEGIN
    SELECT pg_get_constraintdef(oid) INTO def FROM pg_constraint
     WHERE conrelid = 'public.profile_notifications'::regclass AND conname = 'profile_notifications_kind_check';
    SELECT array_agg(DISTINCT m[1]) INTO kinds FROM regexp_matches(COALESCE(def, ''), '([a-z][a-z0-9_]*)', 'g') AS m
     WHERE m[1] NOT IN ('kind', 'any', 'array', 'text', 'check');
    kinds := ARRAY(SELECT DISTINCT unnest(COALESCE(kinds, '{}') || ARRAY['order_customer_update']) ORDER BY 1);
    ALTER TABLE public.profile_notifications DROP CONSTRAINT IF EXISTS profile_notifications_kind_check;
    EXECUTE format('ALTER TABLE public.profile_notifications ADD CONSTRAINT profile_notifications_kind_check CHECK (kind = ANY (%L::text[]))', kinds);
END $$;

-- ---------------------------------------------------------------- aceite automático (a dona liga em Editar loja → Pedidos)
CREATE OR REPLACE FUNCTION public.get_store_order_settings(p_store uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NOT public._is_store_staff(p_store) THEN RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501'; END IF;
    RETURN jsonb_build_object('auto_accept', COALESCE((SELECT auto_accept FROM public.store_order_settings WHERE store_id = p_store), false));
END; $$;

CREATE OR REPLACE FUNCTION public.set_store_auto_accept(p_store uuid, p_on boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.stores WHERE id = p_store AND owner_id = auth.uid()) THEN RAISE EXCEPTION 'Essa loja não é sua' USING ERRCODE = '42501'; END IF;
    INSERT INTO public.store_order_settings (store_id, auto_accept, updated_at) VALUES (p_store, COALESCE(p_on, false), now())
    ON CONFLICT (store_id) DO UPDATE SET auto_accept = EXCLUDED.auto_accept, updated_at = now();
END; $$;

-- o pedido que chega à loja (visível) já vai para "Em preparo" se ela ligou o aceite automático
CREATE OR REPLACE FUNCTION public.orders_auto_accept() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NEW.status = 'pending' AND COALESCE(NEW.store_visible, true) AND NEW.buyer_id IS NOT NULL
       AND (TG_OP = 'INSERT' OR NOT COALESCE(OLD.store_visible, true))
       AND EXISTS (SELECT 1 FROM public.store_order_settings s WHERE s.store_id = NEW.store_id AND s.auto_accept) THEN
        UPDATE public.orders SET status = 'preparing', updated_at = now() WHERE id = NEW.id AND status = 'pending';
    END IF;
    RETURN NULL;
END; $$;
DROP TRIGGER IF EXISTS zz_orders_auto_accept ON public.orders;
CREATE TRIGGER zz_orders_auto_accept AFTER INSERT OR UPDATE OF store_visible ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.orders_auto_accept();

-- ---------------------------------------------------------------- a loja RESPONDE o pedido (vira "Combinando")
CREATE OR REPLACE FUNCTION public.store_reply_order(p_order uuid, p_message text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); o public.orders; v_conv uuid; v_slug text; v_owner uuid; v_msg text := btrim(COALESCE(p_message, ''));
BEGIN
    SELECT * INTO o FROM public.orders WHERE id = p_order FOR UPDATE;
    IF NOT FOUND OR NOT COALESCE(o.store_visible, true) OR NOT public._is_store_staff(o.store_id) THEN RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501'; END IF;
    IF o.buyer_id IS NULL THEN RAISE EXCEPTION 'Venda de balcão não tem cliente para conversar' USING ERRCODE = '22023'; END IF;
    IF o.status <> 'pending' THEN RAISE EXCEPTION 'Este pedido já foi respondido' USING ERRCODE = '22023', HINT = 'order_not_pending'; END IF;
    IF char_length(v_msg) < 2 OR char_length(v_msg) > 600 THEN RAISE EXCEPTION 'Escreva a mensagem (até 600 letras)' USING ERRCODE = '22023'; END IF;
    SELECT owner_id, "storeSlug" INTO v_owner, v_slug FROM public.stores WHERE id = o.store_id;
    SELECT id INTO v_conv FROM public.conversations WHERE customer_id = o.buyer_id AND store_id = o.store_id;
    IF v_conv IS NULL THEN
        INSERT INTO public.conversations (customer_id, store_id, owner_read_at) VALUES (o.buyer_id, o.store_id, now()) ON CONFLICT DO NOTHING;
        SELECT id INTO v_conv FROM public.conversations WHERE customer_id = o.buyer_id AND store_id = o.store_id;
    END IF;
    INSERT INTO public.direct_messages (conversation_id, sender_id, content, ref_store_id)
    VALUES (v_conv, v_owner, 'Sobre o seu pedido #' || upper(substr(replace(p_order::text, '-', ''), 1, 8)) || ': ' || v_msg, o.store_id);
    UPDATE public.orders SET store_replied_at = now(), customer_agreed_at = NULL, store_visible_at = now(), updated_at = now() WHERE id = p_order;
    RETURN jsonb_build_object('conversation_id', v_conv, 'store_slug', v_slug);
END; $$;

-- ---------------------------------------------------------------- o CLIENTE decide o pedido (enquanto a loja não aceitou)
-- p_lines = [{ "id": <order_items.id>, "quantity": 0..50 }]; 0 tira o item. O preço de cada item é o que o banco gravou no pedido.
CREATE OR REPLACE FUNCTION public.customer_adjust_order(p_order uuid, p_lines jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); o public.orders; l jsonb; v_qty int; v_items numeric; v_old_items numeric; v_disc numeric; v_total numeric; v_owner uuid; v_slug text; v_name text;
BEGIN
    SELECT * INTO o FROM public.orders WHERE id = p_order AND buyer_id = uid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501'; END IF;
    IF o.status <> 'pending' THEN RAISE EXCEPTION 'A loja já aceitou: o pedido não muda mais' USING ERRCODE = '22023', HINT = 'order_not_pending'; END IF;
    IF jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 OR jsonb_array_length(p_lines) > 100 THEN RAISE EXCEPTION 'Nada para mudar' USING ERRCODE = '22023'; END IF;
    SELECT COALESCE(sum(total_price), 0) INTO v_old_items FROM public.order_items WHERE order_id = p_order;
    FOR l IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
        v_qty := (l->>'quantity')::int;
        IF v_qty IS NULL OR v_qty < 0 OR v_qty > 50 THEN RAISE EXCEPTION 'Quantidade inválida' USING ERRCODE = '22023'; END IF;
        IF v_qty = 0 THEN
            DELETE FROM public.order_items WHERE id = (l->>'id')::uuid AND order_id = p_order;
        ELSE
            UPDATE public.order_items SET quantity = v_qty, total_price = round(unit_price * v_qty, 2) WHERE id = (l->>'id')::uuid AND order_id = p_order;
        END IF;
    END LOOP;
    SELECT COALESCE(sum(total_price), 0) INTO v_items FROM public.order_items WHERE order_id = p_order;
    IF v_items <= 0 THEN RAISE EXCEPTION 'O pedido precisa de pelo menos um item. Para desistir, cancele o pedido.' USING ERRCODE = '22023', HINT = 'order_empty'; END IF;
    -- o desconto que já estava no pedido (clube/cartão do iUser) segue, nunca maior que os itens
    v_disc := GREATEST(0, v_old_items + COALESCE(o.delivery_fee, 0) - COALESCE(o.total_amount, 0));
    v_total := round(GREATEST(0, v_items - LEAST(v_disc, v_items)) + COALESCE(o.delivery_fee, 0), 2);
    UPDATE public.orders SET total_amount = v_total, customer_adjusted_at = now(), customer_agreed_at = NULL, store_visible_at = now(), updated_at = now() WHERE id = p_order;
    IF COALESCE(o.store_visible, true) THEN
        SELECT owner_id, "storeSlug" INTO v_owner, v_slug FROM public.stores WHERE id = o.store_id;
        SELECT split_part(COALESCE(name, 'O cliente'), ' ', 1) INTO v_name FROM public.profiles WHERE id = uid;
        PERFORM public._notify(v_owner, 'order_customer_update', uid, p_order,
            jsonb_build_object('title', 'Pedido ajustado', 'text', v_name || ' mudou o pedido: agora ' || public._brl(v_total) || '.', 'path', '/painel-loja/' || v_slug || '/pedidos?pedido=' || p_order),
            'ord-adj:' || p_order || ':' || floor(extract(epoch FROM now()))::text);
    END IF;
    RETURN jsonb_build_object('total', v_total);
END; $$;

CREATE OR REPLACE FUNCTION public.customer_agree_order(p_order uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); o public.orders; v_owner uuid; v_slug text; v_name text;
BEGIN
    SELECT * INTO o FROM public.orders WHERE id = p_order AND buyer_id = uid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501'; END IF;
    IF o.status <> 'pending' THEN RETURN; END IF;
    UPDATE public.orders SET customer_agreed_at = now(), store_visible_at = now(), updated_at = now() WHERE id = p_order;
    SELECT owner_id, "storeSlug" INTO v_owner, v_slug FROM public.stores WHERE id = o.store_id;
    SELECT split_part(COALESCE(name, 'O cliente'), ' ', 1) INTO v_name FROM public.profiles WHERE id = uid;
    PERFORM public._notify(v_owner, 'order_customer_update', uid, p_order,
        jsonb_build_object('title', 'Cliente de acordo', 'text', v_name || ' está de acordo com o pedido (' || public._brl(o.total_amount) || '). Pode aceitar.', 'path', '/painel-loja/' || v_slug || '/pedidos?pedido=' || p_order),
        'ord-agree:' || p_order || ':' || floor(extract(epoch FROM now()))::text);
END; $$;

REVOKE ALL ON FUNCTION public.get_store_order_settings(uuid), public.set_store_auto_accept(uuid, boolean), public.store_reply_order(uuid, text),
    public.customer_adjust_order(uuid, jsonb), public.customer_agree_order(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_store_order_settings(uuid), public.set_store_auto_accept(uuid, boolean), public.store_reply_order(uuid, text),
    public.customer_adjust_order(uuid, jsonb), public.customer_agree_order(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.orders_auto_accept() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------- PRONTO só com o pagamento confirmado e (Entregador do iUser) com entregador
CREATE OR REPLACE FUNCTION public.orders_ready_gate() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.order_payments; v_iuser boolean;
BEGIN
    IF NEW.status NOT IN ('ready', 'paid') OR OLD.status = NEW.status OR OLD.status NOT IN ('pending', 'preparing') THEN RETURN NEW; END IF;
    -- vale para quem usa o app (a loja logada, direto ou por função); rotinas do servidor/serviço não passam por aqui
    IF COALESCE(auth.role(), '') <> 'authenticated' THEN RETURN NEW; END IF;
    -- concluir pela entrega (complete_ride marca 'paid') não passa por aqui: só o salto preparando → pronto/finalizado da LOJA
    IF NEW.status = 'paid' AND EXISTS (SELECT 1 FROM public.ride_requests r WHERE r.order_id = NEW.id AND r.status = 'completed') THEN RETURN NEW; END IF;
    SELECT * INTO p FROM public.order_payments WHERE order_id = NEW.id;
    IF FOUND AND p.method IN ('pix', 'link_cartao') AND p.status <> 'confirmed' THEN
        RAISE EXCEPTION 'Confirme o pagamento antes: o cliente paga por Pix e você toca "Recebi".' USING ERRCODE = '22023', HINT = 'payment_required';
    END IF;
    SELECT COALESCE(iuser_delivery_enabled, false) INTO v_iuser FROM public.stores WHERE id = NEW.store_id;
    IF v_iuser AND COALESCE(NEW.delivery_option, '') <> 'pickup' AND COALESCE(NEW.delivery_fee, 0) > 0 AND NEW.buyer_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.ride_requests r WHERE r.order_id = NEW.id AND r.driver_id IS NOT NULL AND r.status IN ('accepted', 'completed')) THEN
        RAISE EXCEPTION 'Chame o entregador do iUser antes de marcar pronto.' USING ERRCODE = '22023', HINT = 'driver_required';
    END IF;
    RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS orders_ready_gate ON public.orders;
CREATE TRIGGER orders_ready_gate BEFORE UPDATE OF status ON public.orders FOR EACH ROW EXECUTE FUNCTION public.orders_ready_gate();
REVOKE ALL ON FUNCTION public.orders_ready_gate() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------- Pix/link só depois do aceite
CREATE OR REPLACE FUNCTION public.get_order_payment(p_order uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE uid uuid := auth.uid(); o public.orders; p public.order_payments; s record; v_role text; v_link text; v_held boolean; v_show boolean; v_wait boolean;
BEGIN
    IF uid IS NULL THEN RETURN NULL; END IF;
    SELECT * INTO o FROM public.orders WHERE id = p_order;
    IF NOT FOUND THEN RETURN NULL; END IF;
    IF o.buyer_id = uid THEN v_role := 'buyer';
    ELSIF COALESCE(o.store_visible, true) AND public._is_store_staff(o.store_id) THEN v_role := 'store';
    ELSIF EXISTS (SELECT 1 FROM public.ride_requests r WHERE r.order_id = p_order AND r.driver_id = uid AND r.status IN ('accepted', 'completed')) THEN v_role := 'driver';
    ELSE RETURN NULL; END IF;
    SELECT * INTO p FROM public.order_payments WHERE order_id = p_order;
    IF NOT FOUND THEN RETURN jsonb_build_object('role', v_role, 'method', NULL, 'payment_method', o.payment_method, 'order_status', o.status); END IF;
    v_held := NOT COALESCE(o.store_visible, true) AND o.status = 'pending';
    -- a loja ainda não aceitou (o pedido pode mudar): ainda não se paga
    v_wait := o.status = 'pending';
    v_show := v_role IN ('buyer', 'store');
    SELECT name, pix_key, pix_key_type INTO s FROM public.stores WHERE id = o.store_id;
    IF p.method = 'link_cartao' AND v_role = 'buyer' THEN SELECT card_link INTO v_link FROM public.store_payment_links WHERE store_id = o.store_id; END IF;
    RETURN jsonb_build_object(
        'role', v_role, 'method', p.method, 'payment_method', o.payment_method, 'status', p.status, 'amount', p.amount,
        'reported_at', p.reported_at, 'confirmed_at', p.confirmed_at, 'store_name', s.name,
        'held', v_held, 'awaiting_store', v_wait, 'order_status', o.status, 'txid', upper(substr(replace(p_order::text, '-', ''), 1, 12)),
        'pix_key', CASE WHEN v_role = 'buyer' AND NOT v_held AND NOT v_wait AND p.method IN ('pix', 'pix_porta') AND p.status IN ('awaiting', 'not_received') THEN s.pix_key END,
        'pix_key_type', CASE WHEN v_role = 'buyer' AND p.method IN ('pix', 'pix_porta') THEN s.pix_key_type END,
        'card_link', CASE WHEN v_role = 'buyer' AND NOT v_held AND NOT v_wait AND p.status IN ('awaiting', 'not_received') THEN v_link END,
        'payer_name', CASE WHEN v_show THEN p.payer_name END,
        'payer_bank', CASE WHEN v_show THEN p.payer_bank END,
        'payer_e2e', CASE WHEN v_show THEN p.payer_e2e END,
        'receipt_path', CASE WHEN v_show THEN p.receipt_path END);
END; $function$;

DO $$
DECLARE def text;
BEGIN
    SELECT pg_get_functiondef('public.report_order_paid(uuid, text, text, text, text)'::regprocedure) INTO def;
    IF position('order_not_agreed' IN def) = 0 THEN
        def := replace(def, '    -- o comprovante precisa estar na pasta',
            E'    IF o.status = ''pending'' THEN\n        RAISE EXCEPTION ''Espere a loja aceitar o pedido: o valor ainda pode mudar'' USING ERRCODE = ''22023'', HINT = ''order_not_agreed'';\n    END IF;\n    -- o comprovante precisa estar na pasta');
        EXECUTE def;
    END IF;
END $$;

-- ---------------------------------------------------------------- novidade no Fórum
INSERT INTO public.forum_releases (version, title, summary, added, improved, removed, released_at)
SELECT '3.0.5', 'Cada pedido é um combinado',
       'A loja responde o seu pedido antes de preparar, e você decide o que quer. O Pix só aparece depois que a loja aceita.',
       ARRAY['A loja pode aceitar o pedido como está ou responder com uma mensagem (por exemplo: acabou um item)',
             'Enquanto a loja não aceita, você pode tirar itens ou mudar a quantidade, e dizer "Está bom assim"',
             'A loja pode ligar o aceite automático: o pedido já entra em preparo',
             'Pedido pago por Pix só fica pronto depois que a loja confirma que recebeu'],
       ARRAY['O Pix (e o link do cartão) só aparece depois que a loja aceita: ninguém paga um valor que ainda pode mudar',
             'Loja com o Entregador do iUser só marca pronto com um entregador confirmado'],
       ARRAY[]::text[],
       now() + interval '4 seconds'
WHERE NOT EXISTS (SELECT 1 FROM public.forum_releases WHERE version = '3.0.5');
