-- 20261130000074_order_payments.sql
--
-- PAGAMENTO DO PEDIDO DE LOJA SEM O ENTREGADOR VOLTAR À LOJA (18/11/2026; estudo docs/estudos/2026-11-18-delivery-concorrencia-dinheiro.md).
-- O iUser continua SEM movimentar dinheiro: só mostra para onde pagar e registra o que cada um DECLARA.
--
-- (1) O cliente paga ANTES, direto na conta da loja:
--     · Pix  → o app mostra o QR Pix da própria loja com o valor exato (a chave sai só para o comprador daquele pedido, por get_order_payment);
--     · Cartão → o LINK de pagamento da loja (Mercado Pago, InfinitePay...), cadastrado por ela (store_payment_links, privado).
--     O cliente toca "Já paguei" (report_order_paid) e a loja (dona ou funcionário) confirma "Recebi" (confirm_order_payment). Pedido só digital: confirmar já libera o acesso.
-- (2) Pix NA PORTA: no pedido em dinheiro/cartão, o entregador pode mostrar o QR da loja (start_door_pix) e o cliente paga a loja ali; o entregador avisa (driver_report_door_pix).
--     Assim ele não segura dinheiro nem leva maquininha.
-- (3) FRETE que a LOJA deve ao entregador (store_dues kind 'freight'): todo pedido entregue pelo entregador iUser que NÃO foi pago em dinheiro a ele (Pix antes, link, Pix na porta,
--     maquininha da loja) — antes isso não era registrado em lugar nenhum. A loja paga por Pix (a chave do entregador sai só para ela, get_freight_pay_target) e ele confirma.
-- (4) ACERTO PELO SALDO (dues_settlements): entre a mesma loja e o mesmo entregador o que ele deve (dinheiro recebido) e o que ela deve (fretes) se compensam; quem deve o saldo faz
--     UM Pix (ou nada, se zerar) e o outro confirma (settle_dues_pair / confirm_dues_settlement).
-- (5) O pedido de entrega leva a forma de pagamento e o troco para a corrida (antes ride_requests.payment_method ficava vazio e a oferta não dizia "dinheiro, troco para R$ X").
-- Rollback: supabase/rollbacks/order_payments_rollback.sql. Cenários: supabase/tests/order_payments_scenarios.sql.

-- ===== avisos =====
ALTER TABLE public.profile_notifications DROP CONSTRAINT IF EXISTS profile_notifications_kind_check;
ALTER TABLE public.profile_notifications ADD CONSTRAINT profile_notifications_kind_check CHECK (kind = ANY (ARRAY[
    'appointment_cancelled','appointment_changed','appointment_confirmed','appointment_new','comment_like','comment_reply','customer_review','delivery_at_door',
    'delivery_cancelled','delivery_completed','delivery_done','delivery_driver_accepted','delivery_driver_arrived','delivery_driver_assigned','delivery_driver_cancelled',
    'delivery_driver_idle','delivery_driver_waiting','delivery_issue','delivery_late','delivery_message','delivery_order_preparing','delivery_order_ready','delivery_picked_up',
    'delivery_quit_blocked','digital_access_released','digital_order_new','dispute_update','dues_update','favorite_accepted','favorite_declined','favorite_invite','follow',
    'group_invite','invite_signup','link_visit','moderation_update','order_accepted','order_customer_cancelled','order_delivered','order_new','order_no_driver','order_ready',
    'order_rejected','order_store_timeout','order_waiting_store','product_like','profile_comment','profile_view','publication_comment','publication_like','ride_application',
    'ride_offer_agreed','ride_offer_declined','ride_offer_expired','ride_offer_new','ride_review','ride_selected','ride_wait_declined','ride_wait_ended','ride_wait_requested',
    'ride_wait_started','service_application','service_completed','service_like','service_review','service_selected','store_reject_warning',
    'order_payment'
]));

-- push do aparelho: o pagamento do pedido e o cancelamento por falta de entregador (antes só a ilha)
CREATE OR REPLACE FUNCTION public.trg_ping_live_push() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
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
        'order_no_driver', 'order_payment'
    ]) THEN
        PERFORM public._ping_delivery_events();
    END IF;
    RETURN NEW;
END; $function$;

-- ===== (5) a corrida da entrega leva a forma de pagamento do pedido =====
CREATE OR REPLACE FUNCTION public.fill_delivery_ride_payment() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o record;
BEGIN
    IF NEW.order_id IS NULL OR NEW.payment_method IS NOT NULL THEN RETURN NEW; END IF;
    SELECT payment_method, cash_change_for INTO o FROM public.orders WHERE id = NEW.order_id;
    IF FOUND THEN
        NEW.payment_method := CASE WHEN o.payment_method IN ('pix', 'cartao', 'dinheiro') THEN o.payment_method ELSE NEW.payment_method END;
        NEW.cash_change_for := CASE WHEN o.payment_method = 'dinheiro' THEN o.cash_change_for ELSE NULL END;
    END IF;
    RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.fill_delivery_ride_payment() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS ride_requests_zz_fill_payment ON public.ride_requests;
CREATE TRIGGER ride_requests_zz_fill_payment BEFORE INSERT ON public.ride_requests FOR EACH ROW EXECUTE FUNCTION public.fill_delivery_ride_payment();

UPDATE public.ride_requests r
   SET payment_method = o.payment_method, cash_change_for = CASE WHEN o.payment_method = 'dinheiro' THEN o.cash_change_for END
  FROM public.orders o
 WHERE r.order_id = o.id AND r.payment_method IS NULL AND r.status IN ('pending', 'accepted') AND o.payment_method IN ('pix', 'cartao', 'dinheiro');

-- ===== link de pagamento por cartão da loja (privado: só a dona edita; o comprador recebe no pedido) =====
CREATE TABLE IF NOT EXISTS public.store_payment_links (
    store_id   uuid PRIMARY KEY REFERENCES public.stores(id) ON DELETE CASCADE,
    card_link  text CHECK (card_link IS NULL OR (card_link ~ '^https://[^\s]+$' AND char_length(card_link) <= 300)),
    updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.store_payment_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.store_payment_links FROM anon, authenticated;
GRANT ALL ON public.store_payment_links TO service_role;

CREATE OR REPLACE FUNCTION public.get_store_payment_link(p_store uuid) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.stores WHERE id = p_store AND owner_id = auth.uid()) THEN RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501'; END IF;
    RETURN (SELECT card_link FROM public.store_payment_links WHERE store_id = p_store);
END; $$;

CREATE OR REPLACE FUNCTION public.set_store_payment_link(p_store uuid, p_link text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v text := NULLIF(btrim(COALESCE(p_link, '')), '');
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.stores WHERE id = p_store AND owner_id = auth.uid()) THEN RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501'; END IF;
    IF v IS NOT NULL AND (v !~ '^https://[^\s]+$' OR char_length(v) > 300) THEN
        RAISE EXCEPTION 'Use o link https de pagamento da sua conta (Mercado Pago, InfinitePay, PagBank...)' USING ERRCODE = '22023', HINT = 'invalid_link';
    END IF;
    INSERT INTO public.store_payment_links (store_id, card_link, updated_at) VALUES (p_store, v, now())
    ON CONFLICT (store_id) DO UPDATE SET card_link = EXCLUDED.card_link, updated_at = now();
END; $$;

-- ===== (1)(2) o pagamento do pedido =====
CREATE TABLE IF NOT EXISTS public.order_payments (
    order_id     uuid PRIMARY KEY REFERENCES public.orders(id) ON DELETE CASCADE,
    store_id     uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    method       text NOT NULL CHECK (method IN ('pix', 'link_cartao', 'pix_porta')),
    amount       numeric NOT NULL CHECK (amount > 0),
    status       text NOT NULL DEFAULT 'awaiting' CHECK (status IN ('awaiting', 'reported', 'confirmed', 'not_received')),
    reported_by  uuid,
    reported_at  timestamptz,
    confirmed_by uuid,
    confirmed_at timestamptz,
    note         text CHECK (note IS NULL OR char_length(note) <= 300),
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS order_payments_store_idx ON public.order_payments (store_id, status);
ALTER TABLE public.order_payments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.order_payments FROM anon, authenticated;
GRANT ALL ON public.order_payments TO service_role;

-- nasce com o pedido: Pix (loja com chave) ou cartão (loja com link). Pedido de balcão (sem comprador) e o V2 ("combinar") ficam de fora.
-- (create_store_order grava o pedido com total 0 e acerta o total logo depois: por isso também na mudança do total, se ainda não existe)
CREATE OR REPLACE FUNCTION public._order_payment_ensure(o public.orders) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_key text; v_link text;
BEGIN
    IF o.buyer_id IS NULL OR o.store_id IS NULL OR COALESCE(o.total_amount, 0) <= 0 OR o.status = 'rejected' THEN RETURN; END IF;
    IF o.payment_method = 'pix' THEN
        SELECT NULLIF(btrim(COALESCE(pix_key, '')), '') INTO v_key FROM public.stores WHERE id = o.store_id;
        IF v_key IS NOT NULL THEN
            INSERT INTO public.order_payments (order_id, store_id, method, amount) VALUES (o.id, o.store_id, 'pix', o.total_amount) ON CONFLICT DO NOTHING;
        END IF;
    ELSIF o.payment_method = 'cartao' THEN
        SELECT card_link INTO v_link FROM public.store_payment_links WHERE store_id = o.store_id;
        IF v_link IS NOT NULL THEN
            INSERT INTO public.order_payments (order_id, store_id, method, amount) VALUES (o.id, o.store_id, 'link_cartao', o.total_amount) ON CONFLICT DO NOTHING;
        END IF;
    END IF;
END; $$;
REVOKE ALL ON FUNCTION public._order_payment_ensure(public.orders) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.trg_order_payment_create() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    PERFORM public._order_payment_ensure(NEW);
    RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.trg_order_payment_create() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS orders_zz_payment_create ON public.orders;
CREATE TRIGGER orders_zz_payment_create AFTER INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION public.trg_order_payment_create();

-- o total mudou (virou retirada, sem frete) antes de pagar: o valor a pagar acompanha; pedido recusado/cancelado com dinheiro já pago: avisa para devolver
CREATE OR REPLACE FUNCTION public.trg_order_payment_follow() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.order_payments; v_owner uuid; v_name text;
BEGIN
    SELECT * INTO p FROM public.order_payments WHERE order_id = NEW.id;
    IF NOT FOUND THEN
        IF NEW.total_amount IS DISTINCT FROM OLD.total_amount THEN PERFORM public._order_payment_ensure(NEW); END IF;
        RETURN NEW;
    END IF;
    IF NEW.total_amount IS DISTINCT FROM OLD.total_amount AND p.status = 'awaiting' AND COALESCE(NEW.total_amount, 0) > 0 THEN
        UPDATE public.order_payments SET amount = NEW.total_amount, updated_at = now() WHERE order_id = NEW.id;
    END IF;
    IF NEW.status = 'rejected' AND OLD.status IS DISTINCT FROM 'rejected' AND p.status IN ('reported', 'confirmed') THEN
        SELECT owner_id, name INTO v_owner, v_name FROM public.stores WHERE id = NEW.store_id;
        PERFORM public._notify(v_owner, 'order_payment', NEW.buyer_id, NEW.id,
            jsonb_build_object('title', 'Devolva o pagamento', 'text', 'O pedido foi cancelado, mas o cliente diz que pagou ' || public._brl(p.amount) || '. Devolva o valor a ele.', 'path', '/painel-loja/' || (SELECT "storeSlug" FROM public.stores WHERE id = NEW.store_id) || '/pedidos'),
            'pay-refund-s:' || NEW.id);
        PERFORM public._notify(NEW.buyer_id, 'order_payment', v_owner, NEW.id,
            jsonb_build_object('title', 'Pedido cancelado', 'text', COALESCE(v_name, 'A loja') || ' foi avisada para devolver os ' || public._brl(p.amount) || ' que você pagou.', 'path', '/atividade?aba=pedidos'),
            'pay-refund-c:' || NEW.id);
    END IF;
    RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.trg_order_payment_follow() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS orders_zz_payment_follow ON public.orders;
CREATE TRIGGER orders_zz_payment_follow AFTER UPDATE OF total_amount, status ON public.orders FOR EACH ROW EXECUTE FUNCTION public.trg_order_payment_follow();

-- a vista de cada um: o COMPRADOR recebe para onde pagar (chave Pix da loja ou o link); a LOJA vê o estado; o ENTREGADOR do pedido vê só o estado
CREATE OR REPLACE FUNCTION public.get_order_payment(p_order uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); o public.orders; p public.order_payments; s record; v_role text; v_link text;
BEGIN
    IF uid IS NULL THEN RETURN NULL; END IF;
    SELECT * INTO o FROM public.orders WHERE id = p_order;
    IF NOT FOUND THEN RETURN NULL; END IF;
    IF o.buyer_id = uid THEN v_role := 'buyer';
    ELSIF COALESCE(o.store_visible, true) AND public._is_store_staff(o.store_id) THEN v_role := 'store';
    ELSIF EXISTS (SELECT 1 FROM public.ride_requests r WHERE r.order_id = p_order AND r.driver_id = uid AND r.status IN ('accepted', 'completed')) THEN v_role := 'driver';
    ELSE RETURN NULL; END IF;
    SELECT * INTO p FROM public.order_payments WHERE order_id = p_order;
    IF NOT FOUND THEN RETURN jsonb_build_object('role', v_role, 'method', NULL, 'payment_method', o.payment_method); END IF;
    SELECT name, pix_key, pix_key_type INTO s FROM public.stores WHERE id = o.store_id;
    IF p.method = 'link_cartao' AND v_role = 'buyer' THEN SELECT card_link INTO v_link FROM public.store_payment_links WHERE store_id = o.store_id; END IF;
    RETURN jsonb_build_object(
        'role', v_role, 'method', p.method, 'payment_method', o.payment_method, 'status', p.status, 'amount', p.amount,
        'reported_at', p.reported_at, 'confirmed_at', p.confirmed_at, 'store_name', s.name,
        'txid', upper(substr(replace(p_order::text, '-', ''), 1, 12)),
        -- a chave e o link só para quem paga, e só enquanto há o que pagar
        'pix_key', CASE WHEN v_role = 'buyer' AND p.method IN ('pix', 'pix_porta') AND p.status IN ('awaiting', 'not_received') THEN s.pix_key END,
        'pix_key_type', CASE WHEN v_role = 'buyer' AND p.method IN ('pix', 'pix_porta') THEN s.pix_key_type END,
        'card_link', CASE WHEN v_role = 'buyer' AND p.status IN ('awaiting', 'not_received') THEN v_link END);
END; $$;

-- o COMPRADOR avisa que pagou
CREATE OR REPLACE FUNCTION public.report_order_paid(p_order uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); o public.orders; p public.order_payments; v_owner uuid; v_slug text; v_name text;
BEGIN
    SELECT * INTO o FROM public.orders WHERE id = p_order AND buyer_id = uid;
    IF NOT FOUND THEN RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501'; END IF;
    SELECT * INTO p FROM public.order_payments WHERE order_id = p_order FOR UPDATE;
    IF NOT FOUND OR p.method = 'pix_porta' THEN RAISE EXCEPTION 'Este pedido não tem pagamento antecipado' USING ERRCODE = '22023'; END IF;
    IF o.status = 'rejected' THEN RAISE EXCEPTION 'Este pedido foi cancelado' USING ERRCODE = '22023'; END IF;
    IF p.status NOT IN ('awaiting', 'not_received') THEN RETURN; END IF;
    UPDATE public.order_payments SET status = 'reported', reported_by = uid, reported_at = now(), updated_at = now() WHERE order_id = p_order;
    IF COALESCE(o.store_visible, true) THEN
        SELECT owner_id, "storeSlug" INTO v_owner, v_slug FROM public.stores WHERE id = o.store_id;
        SELECT split_part(COALESCE(name, 'O cliente'), ' ', 1) INTO v_name FROM public.profiles WHERE id = uid;
        PERFORM public._notify(v_owner, 'order_payment', uid, p_order,
            jsonb_build_object('title', 'Pagamento a conferir', 'text', v_name || ' diz que pagou ' || public._brl(p.amount) || CASE WHEN p.method = 'pix' THEN ' por Pix' ELSE ' pelo seu link' END || '. Confira na sua conta e confirme.', 'path', '/painel-loja/' || v_slug || '/pedidos?pedido=' || p_order),
            'pay-rep:' || p_order || ':' || floor(extract(epoch FROM now()))::text);
    END IF;
END; $$;

-- a LOJA (dona ou funcionário) confirma que o dinheiro caiu (ou que não caiu)
CREATE OR REPLACE FUNCTION public.confirm_order_payment(p_order uuid, p_ok boolean, p_note text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); o public.orders; p public.order_payments; v_name text; v_digital boolean; v_driver uuid;
BEGIN
    SELECT * INTO o FROM public.orders WHERE id = p_order;
    IF NOT FOUND OR NOT public._is_store_staff(o.store_id) OR NOT COALESCE(o.store_visible, true) THEN RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501'; END IF;
    SELECT * INTO p FROM public.order_payments WHERE order_id = p_order FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Este pedido não tem pagamento a conferir' USING ERRCODE = '22023'; END IF;
    IF p.status = 'confirmed' AND p_ok THEN RETURN jsonb_build_object('ok', true, 'already', true); END IF;
    SELECT name INTO v_name FROM public.stores WHERE id = o.store_id;
    IF p_ok THEN
        UPDATE public.order_payments SET status = 'confirmed', confirmed_by = uid, confirmed_at = now(), note = NULL, updated_at = now() WHERE order_id = p_order;
        IF o.buyer_id IS NOT NULL THEN
            PERFORM public._notify(o.buyer_id, 'order_payment', uid, p_order,
                jsonb_build_object('title', 'Pagamento confirmado', 'text', COALESCE(v_name, 'A loja') || ' confirmou o seu pagamento de ' || public._brl(p.amount) || '.', 'path', '/atividade?aba=pedidos'),
                'pay-ok:' || p_order);
        END IF;
        -- pedido SÓ de produto digital: o pagamento confirmado já libera o acesso (como o "Liberar acesso")
        SELECT NOT EXISTS (SELECT 1 FROM public.order_items oi LEFT JOIN public.products pr ON pr.id = oi.product_id WHERE oi.order_id = p_order AND COALESCE(pr.type, 'physical') <> 'digital')
          INTO v_digital;
        IF v_digital AND o.status IN ('pending', 'preparing', 'ready') AND EXISTS (SELECT 1 FROM public.order_items WHERE order_id = p_order) THEN
            UPDATE public.orders SET status = 'paid' WHERE id = p_order;
        END IF;
    ELSE
        IF btrim(COALESCE(p_note, '')) = '' THEN RAISE EXCEPTION 'Diga o que aconteceu' USING ERRCODE = '22023'; END IF;
        UPDATE public.order_payments SET status = 'not_received', note = left(btrim(p_note), 300), confirmed_by = uid, confirmed_at = NULL, updated_at = now() WHERE order_id = p_order;
        IF o.buyer_id IS NOT NULL THEN
            PERFORM public._notify(o.buyer_id, 'order_payment', uid, p_order,
                jsonb_build_object('title', 'Pagamento não encontrado', 'text', COALESCE(v_name, 'A loja') || ' não encontrou o seu pagamento de ' || public._brl(p.amount) || ': ' || left(btrim(p_note), 120), 'path', '/atividade?aba=pedidos'),
                'pay-no:' || p_order || ':' || floor(extract(epoch FROM now()))::text);
        END IF;
        IF p.method = 'pix_porta' THEN
            SELECT driver_id INTO v_driver FROM public.ride_requests WHERE order_id = p_order AND driver_id IS NOT NULL ORDER BY created_at DESC LIMIT 1;
            IF v_driver IS NOT NULL THEN
                PERFORM public._notify(v_driver, 'order_payment', uid, p_order,
                    jsonb_build_object('title', 'Pix na porta não caiu', 'text', COALESCE(v_name, 'A loja') || ' diz que o Pix de ' || public._brl(p.amount) || ' que o cliente fez na porta não caiu.', 'path', '/entregas'),
                    'pay-no-d:' || p_order || ':' || floor(extract(epoch FROM now()))::text);
            END IF;
        END IF;
    END IF;
    RETURN jsonb_build_object('ok', true);
END; $$;

-- o ENTREGADOR, já com o pedido, mostra o QR Pix da LOJA na porta (pedido em dinheiro ou cartão que ainda não foi pago)
CREATE OR REPLACE FUNCTION public.start_door_pix(p_ride uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); r public.ride_requests; o public.orders; p public.order_payments; s record;
BEGIN
    SELECT * INTO r FROM public.ride_requests WHERE id = p_ride;
    IF NOT FOUND OR r.driver_id IS DISTINCT FROM uid OR r.order_id IS NULL OR r.status <> 'accepted' THEN RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501'; END IF;
    IF r.ride_started_at IS NULL THEN RAISE EXCEPTION 'Retire o pedido na loja antes de cobrar' USING ERRCODE = '22023'; END IF;
    SELECT * INTO o FROM public.orders WHERE id = r.order_id;
    SELECT name, NULLIF(btrim(COALESCE(pix_key, '')), '') AS pix_key, pix_key_type INTO s FROM public.stores WHERE id = o.store_id;
    IF s.pix_key IS NULL THEN RAISE EXCEPTION 'A loja não cadastrou uma chave Pix' USING ERRCODE = '22023', HINT = 'store_no_pix'; END IF;
    SELECT * INTO p FROM public.order_payments WHERE order_id = o.id FOR UPDATE;
    IF FOUND AND p.method <> 'pix_porta' AND p.status IN ('reported', 'confirmed') THEN RAISE EXCEPTION 'Este pedido já foi pago antes' USING ERRCODE = '22023', HINT = 'already_paid'; END IF;
    IF FOUND AND p.method = 'pix_porta' AND p.status IN ('reported', 'confirmed') THEN NULL;
    ELSIF FOUND THEN
        UPDATE public.order_payments SET method = 'pix_porta', amount = o.total_amount, status = 'awaiting', reported_by = NULL, reported_at = NULL, updated_at = now() WHERE order_id = o.id;
    ELSE
        INSERT INTO public.order_payments (order_id, store_id, method, amount) VALUES (o.id, o.store_id, 'pix_porta', o.total_amount);
    END IF;
    RETURN jsonb_build_object('store_name', s.name, 'pix_key', s.pix_key, 'pix_key_type', s.pix_key_type, 'amount', o.total_amount,
                              'txid', upper(substr(replace(o.id::text, '-', ''), 1, 12)));
END; $$;

-- o ENTREGADOR avisa que o cliente pagou o Pix da loja na porta (a loja confere e confirma)
CREATE OR REPLACE FUNCTION public.driver_report_door_pix(p_ride uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); r public.ride_requests; p public.order_payments; v_owner uuid; v_slug text; v_name text;
BEGIN
    SELECT * INTO r FROM public.ride_requests WHERE id = p_ride;
    IF NOT FOUND OR r.driver_id IS DISTINCT FROM uid OR r.order_id IS NULL OR r.status NOT IN ('accepted', 'completed') THEN RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501'; END IF;
    SELECT * INTO p FROM public.order_payments WHERE order_id = r.order_id FOR UPDATE;
    IF NOT FOUND OR p.method <> 'pix_porta' THEN RAISE EXCEPTION 'Mostre o QR da loja antes' USING ERRCODE = '22023'; END IF;
    IF p.status IN ('reported', 'confirmed') THEN RETURN; END IF;
    UPDATE public.order_payments SET status = 'reported', reported_by = uid, reported_at = now(), updated_at = now() WHERE order_id = r.order_id;
    SELECT owner_id, "storeSlug" INTO v_owner, v_slug FROM public.stores WHERE id = p.store_id;
    SELECT split_part(COALESCE(name, 'O entregador'), ' ', 1) INTO v_name FROM public.profiles WHERE id = uid;
    PERFORM public._notify(v_owner, 'order_payment', uid, r.order_id,
        jsonb_build_object('title', 'Pix na porta a conferir', 'text', 'O cliente pagou ' || public._brl(p.amount) || ' por Pix na porta (entrega de ' || v_name || '). Confira na sua conta e confirme.', 'path', '/painel-loja/' || v_slug || '/pedidos?pedido=' || r.order_id),
        'pay-door:' || r.order_id);
END; $$;

-- a LOJA vê, de uma vez, o estado do pagamento dos pedidos recentes (para a lista de pedidos e o "Precisa de você agora")
CREATE OR REPLACE FUNCTION public.get_store_order_payments(p_store uuid) RETURNS TABLE(order_id uuid, method text, status text, amount numeric, reported_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NOT public._is_store_staff(p_store) THEN RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501'; END IF;
    RETURN QUERY SELECT p.order_id, p.method, p.status, p.amount, p.reported_at
      FROM public.order_payments p JOIN public.orders o ON o.id = p.order_id
     WHERE p.store_id = p_store AND COALESCE(o.store_visible, true) AND o.created_at > now() - interval '7 days'
     ORDER BY o.created_at DESC LIMIT 300;
END; $$;

-- ===== (3) frete que a LOJA deve ao entregador + (4) acerto pelo saldo =====
CREATE TABLE IF NOT EXISTS public.dues_settlements (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id     uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    driver_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    payer        text NOT NULL CHECK (payer IN ('driver', 'store', 'none')),
    amount       numeric NOT NULL CHECK (amount >= 0),
    driver_owed  numeric NOT NULL DEFAULT 0,   -- o que o entregador devia (dinheiro recebido)
    store_owed   numeric NOT NULL DEFAULT 0,   -- o que a loja devia (fretes)
    method       text CHECK (method IN ('pix', 'em_maos')),
    status       text NOT NULL DEFAULT 'declared' CHECK (status IN ('declared', 'confirmed', 'disputed')),
    note         text CHECK (note IS NULL OR char_length(note) <= 500),
    created_by   uuid,
    created_at   timestamptz NOT NULL DEFAULT now(),
    confirmed_at timestamptz
);
CREATE INDEX IF NOT EXISTS dues_settlements_pair_idx ON public.dues_settlements (store_id, driver_id, status);
ALTER TABLE public.dues_settlements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dues_settlements FROM anon, authenticated;
GRANT ALL ON public.dues_settlements TO service_role;

ALTER TABLE public.store_dues ADD COLUMN IF NOT EXISTS settlement_id uuid REFERENCES public.dues_settlements(id) ON DELETE SET NULL;
ALTER TABLE public.store_dues DROP CONSTRAINT IF EXISTS store_dues_kind_check;
ALTER TABLE public.store_dues ADD CONSTRAINT store_dues_kind_check CHECK (kind IN ('cash', 'machine', 'dispute_debt', 'freight'));
ALTER TABLE public.store_dues DROP CONSTRAINT IF EXISTS store_dues_declare_method_check;
ALTER TABLE public.store_dues ADD CONSTRAINT store_dues_declare_method_check CHECK (declare_method IN ('pix', 'em_maos', 'devolvida', 'saldo'));
CREATE UNIQUE INDEX IF NOT EXISTS store_dues_freight_once ON public.store_dues (ride_id) WHERE kind = 'freight';

-- entrega concluída: dinheiro com o entregador vira repasse à loja; o resto (Pix antes, link, Pix na porta, maquininha) vira FRETE que a loja deve a ele
CREATE OR REPLACE FUNCTION public.trg_dues_on_ride_end() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE o public.orders; cfg public.delivery_dues_settings; v_amount numeric; v_id uuid; v_store text; v_owner uuid; v_slug text; v_door boolean; v_drv text;
BEGIN
    IF NEW.order_id IS NULL OR NEW.driver_id IS NULL OR OLD.status IS NOT DISTINCT FROM NEW.status OR NEW.status NOT IN ('completed', 'cancelled') THEN RETURN NEW; END IF;
    IF NEW.status = 'completed' AND NEW.store_id IS NOT NULL THEN
        SELECT * INTO o FROM public.orders WHERE id = NEW.order_id;
        SELECT * INTO cfg FROM public.delivery_dues_settings WHERE id;
        SELECT name, owner_id, "storeSlug" INTO v_store, v_owner, v_slug FROM public.stores WHERE id = NEW.store_id;
        v_door := EXISTS (SELECT 1 FROM public.order_payments WHERE order_id = NEW.order_id AND method = 'pix_porta' AND status IN ('reported', 'confirmed'));
        IF o.payment_method IN ('dinheiro', 'money') AND NOT v_door THEN
            -- o entregador recebeu o TOTAL, fica com o frete e repassa o resto (o valor dos produtos) à loja
            v_amount := COALESCE(o.total_amount, 0) - COALESCE(NEW.offered_price, 0);
            IF v_amount > 0 THEN
                INSERT INTO public.store_dues (kind, store_id, driver_id, order_id, ride_id, amount, collected, due_at)
                VALUES ('cash', NEW.store_id, NEW.driver_id, NEW.order_id, NEW.id, v_amount, o.total_amount, now() + make_interval(hours => cfg.cash_due_hours))
                ON CONFLICT (ride_id) WHERE kind = 'cash' DO NOTHING RETURNING id INTO v_id;
                IF v_id IS NOT NULL THEN
                    PERFORM public._notify(NEW.driver_id, 'dues_update', NULL, v_id,
                        jsonb_build_object('title', 'Repasse à loja', 'text', 'Você recebeu ' || public._brl(o.total_amount) || ' em dinheiro: repasse ' || public._brl(v_amount) || ' à ' || COALESCE(v_store, 'loja') || ' (o frete é seu). Se a loja te deve fretes, acerte só o saldo.', 'path', '/entregas'),
                        'cash:' || v_id);
                END IF;
            END IF;
        ELSIF COALESCE(NEW.offered_price, 0) > 0 THEN
            -- o dinheiro ficou com a LOJA: ela deve o frete ao entregador
            INSERT INTO public.store_dues (kind, store_id, driver_id, order_id, ride_id, amount, due_at)
            VALUES ('freight', NEW.store_id, NEW.driver_id, NEW.order_id, NEW.id, NEW.offered_price, now() + make_interval(hours => cfg.cash_due_hours))
            ON CONFLICT (ride_id) WHERE kind = 'freight' DO NOTHING RETURNING id INTO v_id;
            IF v_id IS NOT NULL THEN
                SELECT split_part(COALESCE(name, 'O entregador'), ' ', 1) INTO v_drv FROM public.profiles WHERE id = NEW.driver_id;
                PERFORM public._notify(v_owner, 'dues_update', NEW.driver_id, v_id,
                    jsonb_build_object('title', 'Frete a pagar', 'text', 'Pague ' || public._brl(NEW.offered_price) || ' de frete a ' || v_drv || ' (o cliente pagou o pedido à loja).', 'path', '/painel-loja/' || v_slug || '?secao=repasses'),
                    'frt-s:' || v_id);
                PERFORM public._notify(NEW.driver_id, 'dues_update', v_owner, v_id,
                    jsonb_build_object('title', 'Frete a receber', 'text', COALESCE(v_store, 'A loja') || ' te deve ' || public._brl(NEW.offered_price) || ' de frete desta entrega.', 'path', '/entregas'),
                    'frt-d:' || v_id);
            END IF;
        END IF;
    END IF;
    IF NEW.store_id IS NOT NULL THEN PERFORM public._machine_recompute(NEW.store_id, NEW.driver_id); END IF;
    RETURN NEW;
END; $function$;

-- a maquininha só sai com o entregador se o cliente NÃO pagou antes (link) nem na porta (Pix)
CREATE OR REPLACE FUNCTION public.trg_dues_machine_out() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o public.orders; v_id uuid; v_name text; v_owner uuid;
BEGIN
    IF NEW.order_id IS NULL OR NEW.driver_id IS NULL OR NEW.store_id IS NULL OR NOT (OLD.ride_started_at IS NULL AND NEW.ride_started_at IS NOT NULL) THEN RETURN NEW; END IF;
    SELECT * INTO o FROM public.orders WHERE id = NEW.order_id;
    IF o.payment_method NOT IN ('cartao', 'credit_card') THEN RETURN NEW; END IF;
    IF EXISTS (SELECT 1 FROM public.order_payments WHERE order_id = NEW.order_id AND status IN ('reported', 'confirmed')) THEN RETURN NEW; END IF;
    INSERT INTO public.store_dues (kind, store_id, driver_id, order_id, ride_id) VALUES ('machine', NEW.store_id, NEW.driver_id, NEW.order_id, NEW.id)
    ON CONFLICT (store_id, driver_id) WHERE kind = 'machine' AND status IN ('open', 'declared', 'disputed') DO NOTHING
    RETURNING id INTO v_id;
    IF v_id IS NOT NULL THEN
        SELECT split_part(COALESCE(name, 'O entregador'), ' ', 1) INTO v_name FROM public.profiles WHERE id = NEW.driver_id;
        SELECT owner_id INTO v_owner FROM public.stores WHERE id = NEW.store_id;
        PERFORM public._notify(v_owner, 'dues_update', NEW.driver_id, v_id,
            jsonb_build_object('title', 'Maquininha com o entregador', 'text', v_name || ' saiu com a maquininha para um pedido no cartão', 'path', public._store_slug_path(NEW.store_id)),
            'mach-out:' || v_id);
    END IF;
    RETURN NEW;
END; $$;

-- um repasse que a LOJA contesta trava o entregador; o frete que o entregador diz não ter recebido não trava ninguém (vai ao admin)
CREATE OR REPLACE FUNCTION public._driver_dues_block(p_driver uuid) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE cfg public.delivery_dues_settings; v_open numeric;
BEGIN
    SELECT * INTO cfg FROM public.delivery_dues_settings WHERE id;
    IF EXISTS (SELECT 1 FROM public.store_dues WHERE driver_id = p_driver AND kind <> 'freight' AND status = 'disputed') THEN RETURN 'dues_disputed'; END IF;
    IF EXISTS (SELECT 1 FROM public.store_dues WHERE driver_id = p_driver AND kind IN ('cash', 'dispute_debt') AND status = 'open' AND due_at < now()) THEN RETURN 'cash_overdue'; END IF;
    IF EXISTS (SELECT 1 FROM public.store_dues WHERE driver_id = p_driver AND kind = 'machine' AND status = 'open' AND due_at < now()) THEN RETURN 'machine_overdue'; END IF;
    SELECT COALESCE(sum(amount), 0) INTO v_open FROM public.store_dues WHERE driver_id = p_driver AND kind IN ('cash', 'dispute_debt') AND status = 'open';
    IF v_open >= cfg.cash_max_open THEN RETURN 'cash_limit'; END IF;
    IF (SELECT count(*) FROM public.delivery_disputes WHERE driver_id = p_driver AND outcome = 'driver_at_fault' AND decided_at > now() - make_interval(days => cfg.strike_days)) >= cfg.strike_limit THEN RETURN 'dispute_strikes'; END IF;
    RETURN NULL;
END; $function$;

-- o saldo entre uma loja e um entregador: o que ele deve (dinheiro) − o que ela deve (fretes), só das pendências abertas
CREATE OR REPLACE FUNCTION public._dues_pair_balance(p_store uuid, p_driver uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT jsonb_build_object(
        'driver_owes', COALESCE(sum(amount) FILTER (WHERE kind IN ('cash', 'dispute_debt')), 0),
        'store_owes',  COALESCE(sum(amount) FILTER (WHERE kind = 'freight'), 0),
        'net',         COALESCE(sum(amount) FILTER (WHERE kind IN ('cash', 'dispute_debt')), 0) - COALESCE(sum(amount) FILTER (WHERE kind = 'freight'), 0),
        'items',       count(*))
      FROM public.store_dues WHERE store_id = p_store AND driver_id = p_driver AND status = 'open' AND kind IN ('cash', 'dispute_debt', 'freight')
$$;
REVOKE ALL ON FUNCTION public._dues_pair_balance(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- caixa do ENTREGADOR: as pendências (agora com os fretes que as lojas devem a ele), o saldo por loja e os acertos a confirmar
CREATE OR REPLACE FUNCTION public.get_my_dues() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE uid uuid := auth.uid(); cfg public.delivery_dues_settings; v_items jsonb; v_block text; v_open numeric; v_bal jsonb; v_sett jsonb;
BEGIN
    IF uid IS NULL THEN RETURN NULL; END IF;
    SELECT * INTO cfg FROM public.delivery_dues_settings WHERE id;
    SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.created_at), '[]'::jsonb) INTO v_items FROM (
        SELECT d.id, d.kind, d.store_id, s.name AS store_name, d.amount, d.status, d.due_at, d.declared_at, d.declare_method, d.note, d.created_at, d.settlement_id,
               (d.status = 'open' AND d.due_at < now()) AS overdue
          FROM public.store_dues d JOIN public.stores s ON s.id = d.store_id
         WHERE d.driver_id = uid AND d.status IN ('open', 'declared', 'disputed')) x;
    SELECT COALESCE(sum(amount), 0) INTO v_open FROM public.store_dues WHERE driver_id = uid AND kind IN ('cash', 'dispute_debt') AND status = 'open';
    SELECT COALESCE(jsonb_agg(jsonb_build_object('store_id', b.store_id, 'store_name', s.name) || public._dues_pair_balance(b.store_id, uid)), '[]'::jsonb) INTO v_bal
      FROM (SELECT DISTINCT store_id FROM public.store_dues WHERE driver_id = uid AND status = 'open' AND kind IN ('cash', 'dispute_debt', 'freight')) b
      JOIN public.stores s ON s.id = b.store_id;
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id', t.id, 'store_id', t.store_id, 'store_name', s.name, 'payer', t.payer, 'amount', t.amount, 'method', t.method,
                                                  'status', t.status, 'created_at', t.created_at) ORDER BY t.created_at DESC), '[]'::jsonb) INTO v_sett
      FROM public.dues_settlements t JOIN public.stores s ON s.id = t.store_id
     WHERE t.driver_id = uid AND (t.status IN ('declared', 'disputed') OR t.created_at > now() - interval '3 days');
    v_block := public._driver_dues_block(uid);
    RETURN jsonb_build_object('blocked', v_block, 'blocked_text', CASE WHEN v_block IS NULL THEN NULL ELSE public._dues_block_message(v_block) END,
                              'open_amount', v_open, 'max_open', cfg.cash_max_open, 'items', v_items, 'balances', v_bal, 'settlements', v_sett);
END; $function$;

-- caixa da LOJA: idem, do lado dela
CREATE OR REPLACE FUNCTION public.get_store_dues(p_store uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_items jsonb; v_pending numeric; v_freight numeric; v_bal jsonb; v_sett jsonb;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.stores WHERE id = p_store AND owner_id = auth.uid()) THEN RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501'; END IF;
    SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.created_at), '[]'::jsonb) INTO v_items FROM (
        SELECT d.id, d.kind, d.driver_id, p.name AS driver_name, p."profileSlug" AS driver_slug, d.amount, d.status, d.due_at, d.declared_at, d.declare_method, d.note, d.created_at, d.settlement_id,
               (d.status = 'open' AND d.due_at < now()) AS overdue
          FROM public.store_dues d JOIN public.profiles p ON p.id = d.driver_id
         WHERE d.store_id = p_store AND d.status IN ('open', 'declared', 'disputed')) x;
    SELECT COALESCE(sum(amount), 0) INTO v_pending FROM public.store_dues WHERE store_id = p_store AND kind IN ('cash', 'dispute_debt') AND status IN ('open', 'declared', 'disputed');
    SELECT COALESCE(sum(amount), 0) INTO v_freight FROM public.store_dues WHERE store_id = p_store AND kind = 'freight' AND status IN ('open', 'declared', 'disputed');
    SELECT COALESCE(jsonb_agg(jsonb_build_object('driver_id', b.driver_id, 'driver_name', p.name) || public._dues_pair_balance(p_store, b.driver_id)), '[]'::jsonb) INTO v_bal
      FROM (SELECT DISTINCT driver_id FROM public.store_dues WHERE store_id = p_store AND status = 'open' AND kind IN ('cash', 'dispute_debt', 'freight')) b
      JOIN public.profiles p ON p.id = b.driver_id;
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id', t.id, 'driver_id', t.driver_id, 'driver_name', p.name, 'payer', t.payer, 'amount', t.amount, 'method', t.method,
                                                  'status', t.status, 'created_at', t.created_at) ORDER BY t.created_at DESC), '[]'::jsonb) INTO v_sett
      FROM public.dues_settlements t JOIN public.profiles p ON p.id = t.driver_id
     WHERE t.store_id = p_store AND (t.status IN ('declared', 'disputed') OR t.created_at > now() - interval '3 days');
    RETURN jsonb_build_object('items', v_items, 'pending_amount', v_pending, 'freight_amount', v_freight, 'balances', v_bal, 'settlements', v_sett);
END; $function$;

-- para onde pagar o SALDO: quem deve vê a chave Pix do outro (loja → a do entregador; entregador → a da loja)
CREATE OR REPLACE FUNCTION public.get_dues_pair_target(p_store uuid, p_driver uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); b jsonb; v_net numeric; v_key text; v_type text; v_name text; v_is_store boolean;
BEGIN
    v_is_store := EXISTS (SELECT 1 FROM public.stores WHERE id = p_store AND owner_id = uid);
    IF NOT v_is_store AND uid IS DISTINCT FROM p_driver THEN RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501'; END IF;
    b := public._dues_pair_balance(p_store, p_driver);
    v_net := (b->>'net')::numeric;
    IF v_is_store AND v_net < 0 THEN
        SELECT pix_key, pix_key_type INTO v_key, v_type FROM public.driver_payout_keys WHERE driver_id = p_driver;
        SELECT name INTO v_name FROM public.profiles WHERE id = p_driver;
    ELSIF uid = p_driver AND v_net > 0 THEN
        SELECT pix_key, pix_key_type, name INTO v_key, v_type, v_name FROM public.stores WHERE id = p_store;
    END IF;
    RETURN b || jsonb_build_object('pay_to_name', v_name, 'pix_key', v_key, 'pix_key_type', v_type);
END; $$;

-- acertar o SALDO entre a loja e o entregador: quem deve o saldo declara (Pix ou em mãos); saldo zero = acertado na hora
CREATE OR REPLACE FUNCTION public.settle_dues_pair(p_store uuid, p_driver uuid, p_method text DEFAULT 'pix') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); v_is_store boolean; b jsonb; v_net numeric; v_payer text; v_id uuid; v_owner uuid; v_slug text; v_store_name text; v_drv text;
BEGIN
    IF p_method NOT IN ('pix', 'em_maos') THEN RAISE EXCEPTION 'Forma inválida' USING ERRCODE = '22023'; END IF;
    SELECT owner_id, "storeSlug", name INTO v_owner, v_slug, v_store_name FROM public.stores WHERE id = p_store;
    v_is_store := v_owner = uid;
    IF NOT v_is_store AND uid IS DISTINCT FROM p_driver THEN RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501'; END IF;
    PERFORM pg_advisory_xact_lock(hashtext('dues_pair:' || p_store::text || ':' || p_driver::text));
    b := public._dues_pair_balance(p_store, p_driver);
    IF (b->>'items')::int = 0 THEN RAISE EXCEPTION 'Nada em aberto entre vocês' USING ERRCODE = '22023'; END IF;
    v_net := (b->>'net')::numeric;
    v_payer := CASE WHEN v_net > 0 THEN 'driver' WHEN v_net < 0 THEN 'store' ELSE 'none' END;
    IF v_payer = 'driver' AND NOT (uid = p_driver) THEN RAISE EXCEPTION 'Quem deve o saldo é o entregador' USING ERRCODE = '42501', HINT = 'not_payer'; END IF;
    IF v_payer = 'store' AND NOT v_is_store THEN RAISE EXCEPTION 'Quem deve o saldo é a loja' USING ERRCODE = '42501', HINT = 'not_payer'; END IF;
    INSERT INTO public.dues_settlements (store_id, driver_id, payer, amount, driver_owed, store_owed, method, status, created_by, confirmed_at)
    VALUES (p_store, p_driver, v_payer, abs(v_net), (b->>'driver_owes')::numeric, (b->>'store_owes')::numeric,
            CASE WHEN v_payer = 'none' THEN NULL ELSE p_method END, CASE WHEN v_payer = 'none' THEN 'confirmed' ELSE 'declared' END, uid,
            CASE WHEN v_payer = 'none' THEN now() END)
    RETURNING id INTO v_id;
    UPDATE public.store_dues SET status = CASE WHEN v_payer = 'none' THEN 'confirmed' ELSE 'declared' END, declare_method = 'saldo', declared_at = now(),
           confirmed_at = CASE WHEN v_payer = 'none' THEN now() END, settlement_id = v_id, updated_at = now()
     WHERE store_id = p_store AND driver_id = p_driver AND status = 'open' AND kind IN ('cash', 'dispute_debt', 'freight');
    SELECT split_part(COALESCE(name, 'O entregador'), ' ', 1) INTO v_drv FROM public.profiles WHERE id = p_driver;
    IF v_payer = 'driver' THEN
        PERFORM public._notify(v_owner, 'dues_update', uid, v_id, jsonb_build_object('title', 'Acerto a confirmar',
            'text', v_drv || ' diz que te pagou o saldo de ' || public._brl(abs(v_net)) || CASE p_method WHEN 'pix' THEN ' por Pix' ELSE ' em mãos' END || ' (dinheiro recebido ' || public._brl((b->>'driver_owes')::numeric) || ' − fretes ' || public._brl((b->>'store_owes')::numeric) || '). Confirme.',
            'path', '/painel-loja/' || v_slug || '?secao=repasses'), 'sett:' || v_id);
    ELSIF v_payer = 'store' THEN
        PERFORM public._notify(p_driver, 'dues_update', uid, v_id, jsonb_build_object('title', 'Acerto a confirmar',
            'text', COALESCE(v_store_name, 'A loja') || ' diz que te pagou o saldo de ' || public._brl(abs(v_net)) || CASE p_method WHEN 'pix' THEN ' por Pix' ELSE ' em mãos' END || ' (fretes ' || public._brl((b->>'store_owes')::numeric) || ' − dinheiro com você ' || public._brl((b->>'driver_owes')::numeric) || '). Confirme.',
            'path', '/entregas'), 'sett:' || v_id);
    ELSE
        PERFORM public._notify(CASE WHEN v_is_store THEN p_driver ELSE v_owner END, 'dues_update', uid, v_id, jsonb_build_object('title', 'Contas acertadas',
            'text', 'O dinheiro recebido e os fretes se compensaram (' || public._brl((b->>'store_owes')::numeric) || '): nada a pagar.',
            'path', CASE WHEN v_is_store THEN '/entregas' ELSE '/painel-loja/' || v_slug || '?secao=repasses' END), 'sett:' || v_id);
    END IF;
    RETURN jsonb_build_object('id', v_id, 'payer', v_payer, 'amount', abs(v_net));
END; $$;

-- quem RECEBE o saldo confirma (ou contesta: as pendências viram contestadas e o admin resolve)
CREATE OR REPLACE FUNCTION public.confirm_dues_settlement(p_settlement uuid, p_ok boolean, p_note text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); t public.dues_settlements; v_owner uuid; v_slug text; v_receiver uuid; v_other uuid; v_txt text;
BEGIN
    SELECT * INTO t FROM public.dues_settlements WHERE id = p_settlement FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Acerto não encontrado' USING ERRCODE = '42501'; END IF;
    SELECT owner_id, "storeSlug" INTO v_owner, v_slug FROM public.stores WHERE id = t.store_id;
    v_receiver := CASE t.payer WHEN 'driver' THEN v_owner WHEN 'store' THEN t.driver_id END;
    IF v_receiver IS DISTINCT FROM uid THEN RAISE EXCEPTION 'Só quem recebe confirma' USING ERRCODE = '42501'; END IF;
    IF t.status <> 'declared' THEN RETURN; END IF;
    v_other := CASE t.payer WHEN 'driver' THEN t.driver_id ELSE v_owner END;
    IF p_ok THEN
        UPDATE public.dues_settlements SET status = 'confirmed', confirmed_at = now() WHERE id = p_settlement;
        UPDATE public.store_dues SET status = 'confirmed', confirmed_at = now(), updated_at = now() WHERE settlement_id = p_settlement AND status = 'declared';
        v_txt := 'O acerto de ' || public._brl(t.amount) || ' foi confirmado.';
    ELSE
        IF btrim(COALESCE(p_note, '')) = '' THEN RAISE EXCEPTION 'Diga o que aconteceu' USING ERRCODE = '22023'; END IF;
        UPDATE public.dues_settlements SET status = 'disputed', note = left(btrim(p_note), 500) WHERE id = p_settlement;
        UPDATE public.store_dues SET status = 'disputed', note = left(btrim(p_note), 500), updated_at = now() WHERE settlement_id = p_settlement AND status = 'declared';
        v_txt := 'O acerto de ' || public._brl(t.amount) || ' foi contestado: ' || left(btrim(p_note), 120) || '. O iUser vai analisar.';
    END IF;
    PERFORM public._notify(v_other, 'dues_update', uid, p_settlement,
        jsonb_build_object('title', CASE WHEN p_ok THEN 'Acerto confirmado' ELSE 'Acerto contestado' END, 'text', v_txt,
                           'path', CASE WHEN v_other = t.driver_id THEN '/entregas' ELSE '/painel-loja/' || v_slug || '?secao=repasses' END),
        'sett-r:' || p_settlement);
END; $$;

-- pagar UM frete avulso (sem esperar o acerto): a loja declara, o entregador confirma
CREATE OR REPLACE FUNCTION public.store_declare_freight(p_due uuid, p_method text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); d public.store_dues; v_store text;
BEGIN
    IF p_method NOT IN ('pix', 'em_maos') THEN RAISE EXCEPTION 'Forma inválida' USING ERRCODE = '22023'; END IF;
    SELECT d2.* INTO d FROM public.store_dues d2 JOIN public.stores s ON s.id = d2.store_id WHERE d2.id = p_due AND d2.kind = 'freight' AND s.owner_id = uid FOR UPDATE OF d2;
    IF NOT FOUND THEN RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501'; END IF;
    IF d.status NOT IN ('open', 'disputed') THEN RETURN; END IF;
    UPDATE public.store_dues SET status = 'declared', declare_method = p_method, declared_at = now(), updated_at = now() WHERE id = p_due;
    SELECT name INTO v_store FROM public.stores WHERE id = d.store_id;
    PERFORM public._notify(d.driver_id, 'dues_update', uid, p_due, jsonb_build_object('title', 'Frete pago?',
        'text', COALESCE(v_store, 'A loja') || ' diz que te pagou ' || public._brl(d.amount) || ' de frete ' || CASE p_method WHEN 'pix' THEN 'por Pix' ELSE 'em mãos' END || '. Confirme.', 'path', '/entregas'),
        'frt-decl:' || p_due || ':' || floor(extract(epoch FROM now()))::text);
END; $$;

CREATE OR REPLACE FUNCTION public.driver_confirm_freight(p_due uuid, p_ok boolean, p_note text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); d public.store_dues; v_owner uuid; v_slug text; v_drv text;
BEGIN
    SELECT * INTO d FROM public.store_dues WHERE id = p_due AND kind = 'freight' AND driver_id = uid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501'; END IF;
    IF d.status NOT IN ('open', 'declared') THEN RETURN; END IF;
    SELECT owner_id, "storeSlug" INTO v_owner, v_slug FROM public.stores WHERE id = d.store_id;
    SELECT split_part(COALESCE(name, 'O entregador'), ' ', 1) INTO v_drv FROM public.profiles WHERE id = uid;
    IF p_ok THEN
        UPDATE public.store_dues SET status = 'confirmed', confirmed_at = now(), updated_at = now() WHERE id = p_due;
        PERFORM public._notify(v_owner, 'dues_update', uid, p_due, jsonb_build_object('title', 'Frete confirmado', 'text', v_drv || ' confirmou o frete de ' || public._brl(d.amount) || '.', 'path', '/painel-loja/' || v_slug || '?secao=repasses'), 'frt-ok:' || p_due);
    ELSE
        IF btrim(COALESCE(p_note, '')) = '' THEN RAISE EXCEPTION 'Diga o que aconteceu' USING ERRCODE = '22023'; END IF;
        UPDATE public.store_dues SET status = 'disputed', note = left(btrim(p_note), 500), updated_at = now() WHERE id = p_due;
        PERFORM public._notify(v_owner, 'dues_update', uid, p_due, jsonb_build_object('title', 'Frete não recebido', 'text', v_drv || ' diz que não recebeu o frete de ' || public._brl(d.amount) || ': ' || left(btrim(p_note), 120), 'path', '/painel-loja/' || v_slug || '?secao=repasses'), 'frt-no:' || p_due || ':' || floor(extract(epoch FROM now()))::text);
    END IF;
END; $$;

-- para pagar um frete avulso: a chave Pix do entregador (só para a dona da loja que deve o frete)
CREATE OR REPLACE FUNCTION public.get_freight_pay_target(p_due uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE d public.store_dues; k record; v_name text;
BEGIN
    SELECT d2.* INTO d FROM public.store_dues d2 JOIN public.stores s ON s.id = d2.store_id
     WHERE d2.id = p_due AND d2.kind = 'freight' AND d2.status IN ('open', 'disputed') AND s.owner_id = auth.uid();
    IF NOT FOUND THEN RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501'; END IF;
    SELECT pix_key, pix_key_type INTO k FROM public.driver_payout_keys WHERE driver_id = d.driver_id;
    SELECT name INTO v_name FROM public.profiles WHERE id = d.driver_id;
    RETURN jsonb_build_object('driver_name', v_name, 'pix_key', k.pix_key, 'pix_key_type', k.pix_key_type, 'amount', d.amount);
END; $$;

-- a confirmação de repasse da LOJA (confirm_due) não vale para frete (quem confirma frete é o entregador)
CREATE OR REPLACE FUNCTION public.confirm_due(p_due uuid, p_ok boolean, p_note text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE uid uuid := auth.uid(); d public.store_dues; v_store_name text;
BEGIN
    SELECT d2.* INTO d FROM public.store_dues d2 JOIN public.stores s ON s.id = d2.store_id WHERE d2.id = p_due AND d2.kind <> 'freight' AND s.owner_id = uid FOR UPDATE OF d2;
    IF NOT FOUND THEN RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501'; END IF;
    IF d.status NOT IN ('open', 'declared') THEN RETURN; END IF;
    IF d.settlement_id IS NOT NULL AND d.status = 'declared' THEN RAISE EXCEPTION 'Este repasse faz parte de um acerto: confirme o acerto' USING ERRCODE = '22023'; END IF;
    SELECT name INTO v_store_name FROM public.stores WHERE id = d.store_id;
    IF p_ok THEN
        UPDATE public.store_dues SET status = 'confirmed', confirmed_at = now(), updated_at = now() WHERE id = p_due;
        PERFORM public._notify(d.driver_id, 'dues_update', uid, p_due, jsonb_build_object('title', 'Confirmado pela loja', 'text', COALESCE(v_store_name, 'A loja') || ' confirmou ' || CASE WHEN d.kind = 'machine' THEN 'a devolução da maquininha.' ELSE 'o repasse de ' || public._brl(d.amount) || '.' END, 'path', '/entregas'), 'conf:' || p_due);
    ELSE
        IF btrim(COALESCE(p_note, '')) = '' THEN RAISE EXCEPTION 'Diga o que aconteceu' USING ERRCODE = '22023'; END IF;
        UPDATE public.store_dues SET status = 'disputed', note = left(btrim(p_note), 500), updated_at = now() WHERE id = p_due;
        PERFORM public._notify(d.driver_id, 'dues_update', uid, p_due, jsonb_build_object('title', 'Loja contestou', 'text', COALESCE(v_store_name, 'A loja') || ' diz que não recebeu ' || CASE WHEN d.kind = 'machine' THEN 'a maquininha.' ELSE 'o repasse de ' || public._brl(d.amount) || '.' END || ' Resolva no Caixa.', 'path', '/entregas'), 'disp:' || p_due || ':' || floor(extract(epoch FROM now()))::text);
    END IF;
END; $function$;

-- o entregador só declara o que ELE deve (dinheiro, dívida, maquininha); frete é declarado pela loja
CREATE OR REPLACE FUNCTION public.declare_due(p_due uuid, p_method text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE uid uuid := auth.uid(); d public.store_dues; v_owner uuid; v_name text; v_txt text;
BEGIN
    SELECT * INTO d FROM public.store_dues WHERE id = p_due AND driver_id = uid AND kind <> 'freight' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501'; END IF;
    IF d.status NOT IN ('open', 'disputed') THEN RETURN; END IF;
    IF (d.kind = 'machine' AND p_method <> 'devolvida') OR (d.kind <> 'machine' AND p_method NOT IN ('pix', 'em_maos')) THEN RAISE EXCEPTION 'Forma inválida' USING ERRCODE = '22023'; END IF;
    UPDATE public.store_dues SET status = 'declared', declare_method = p_method, declared_at = now(), settlement_id = NULL, updated_at = now() WHERE id = p_due;
    SELECT owner_id INTO v_owner FROM public.stores WHERE id = d.store_id;
    SELECT split_part(COALESCE(name, 'O entregador'), ' ', 1) INTO v_name FROM public.profiles WHERE id = uid;
    v_txt := CASE WHEN d.kind = 'machine' THEN v_name || ' diz que devolveu a maquininha. Confira e confirme.'
                  ELSE v_name || ' diz que repassou ' || public._brl(d.amount) || ' ' || CASE p_method WHEN 'pix' THEN 'por Pix' ELSE 'em mãos' END || '. Confirme se recebeu.' END;
    PERFORM public._notify(v_owner, 'dues_update', uid, p_due, jsonb_build_object('title', CASE WHEN d.kind = 'machine' THEN 'Maquininha devolvida?' ELSE 'Repasse a confirmar' END, 'text', v_txt, 'path', public._store_slug_path(d.store_id)), 'decl:' || p_due || ':' || floor(extract(epoch FROM now()))::text);
END; $function$;

-- ===== permissões =====
DO $$
DECLARE f text;
BEGIN
    FOREACH f IN ARRAY ARRAY['get_store_payment_link(uuid)', 'set_store_payment_link(uuid,text)', 'get_order_payment(uuid)', 'report_order_paid(uuid)',
        'confirm_order_payment(uuid,boolean,text)', 'start_door_pix(uuid)', 'driver_report_door_pix(uuid)', 'get_dues_pair_target(uuid,uuid)',
        'settle_dues_pair(uuid,uuid,text)', 'confirm_dues_settlement(uuid,boolean,text)', 'store_declare_freight(uuid,text)', 'driver_confirm_freight(uuid,boolean,text)',
        'get_freight_pay_target(uuid)', 'get_store_order_payments(uuid)', 'get_my_dues()', 'get_store_dues(uuid)', 'confirm_due(uuid,boolean,text)', 'declare_due(uuid,text)']
    LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', f);
        EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', f);
    END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.trg_dues_on_ride_end() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_dues_machine_out() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._driver_dues_block(uuid) FROM PUBLIC, anon, authenticated;
