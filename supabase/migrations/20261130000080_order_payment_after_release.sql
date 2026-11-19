-- 20261130000080_order_payment_after_release.sql
--
-- PAGAR SÓ DEPOIS QUE A LOJA RECEBE O PEDIDO (18/11/2026, achado na revisão antes de comercializar). Pedido de entrega com o Entregador
-- do iUser nasce RETIDO (orders.store_visible = false) até um entregador aceitar; se ninguém aceitar, é cancelado em 15 min. A 074 já
-- mostrava o QR Pix da loja e aceitava o "Já paguei" nesse intervalo: o cliente podia pagar uma loja que nem tinha visto o pedido e,
-- com o cancelamento, ficar esperando um reembolso. Agora, enquanto o pedido está retido:
--   - get_order_payment devolve held = true e NÃO entrega a chave Pix nem o link de cartão;
--   - report_order_paid recusa (HINT order_held).
-- Rollback: supabase/rollbacks/order_payment_after_release_rollback.sql (devolve as duas funções da 074).

CREATE OR REPLACE FUNCTION public.get_order_payment(p_order uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE uid uuid := auth.uid(); o public.orders; p public.order_payments; s record; v_role text; v_link text; v_held boolean;
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
    -- pedido retido esperando entregador: a loja ainda não recebeu, então ainda não há o que pagar
    v_held := NOT COALESCE(o.store_visible, true) AND o.status = 'pending';
    SELECT name, pix_key, pix_key_type INTO s FROM public.stores WHERE id = o.store_id;
    IF p.method = 'link_cartao' AND v_role = 'buyer' THEN SELECT card_link INTO v_link FROM public.store_payment_links WHERE store_id = o.store_id; END IF;
    RETURN jsonb_build_object(
        'role', v_role, 'method', p.method, 'payment_method', o.payment_method, 'status', p.status, 'amount', p.amount,
        'reported_at', p.reported_at, 'confirmed_at', p.confirmed_at, 'store_name', s.name,
        'held', v_held, 'txid', upper(substr(replace(p_order::text, '-', ''), 1, 12)),
        -- a chave e o link só para quem paga, e só enquanto há o que pagar
        'pix_key', CASE WHEN v_role = 'buyer' AND NOT v_held AND p.method IN ('pix', 'pix_porta') AND p.status IN ('awaiting', 'not_received') THEN s.pix_key END,
        'pix_key_type', CASE WHEN v_role = 'buyer' AND p.method IN ('pix', 'pix_porta') THEN s.pix_key_type END,
        'card_link', CASE WHEN v_role = 'buyer' AND NOT v_held AND p.status IN ('awaiting', 'not_received') THEN v_link END);
END; $function$;

CREATE OR REPLACE FUNCTION public.report_order_paid(p_order uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE uid uuid := auth.uid(); o public.orders; p public.order_payments; v_owner uuid; v_slug text; v_name text;
BEGIN
    SELECT * INTO o FROM public.orders WHERE id = p_order AND buyer_id = uid;
    IF NOT FOUND THEN RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501'; END IF;
    SELECT * INTO p FROM public.order_payments WHERE order_id = p_order FOR UPDATE;
    IF NOT FOUND OR p.method = 'pix_porta' THEN RAISE EXCEPTION 'Este pedido não tem pagamento antecipado' USING ERRCODE = '22023'; END IF;
    IF o.status = 'rejected' THEN RAISE EXCEPTION 'Este pedido foi cancelado' USING ERRCODE = '22023'; END IF;
    IF NOT COALESCE(o.store_visible, true) THEN
        RAISE EXCEPTION 'Ainda não: pague depois que um entregador aceitar e a loja receber o pedido' USING ERRCODE = '22023', HINT = 'order_held';
    END IF;
    IF p.status NOT IN ('awaiting', 'not_received') THEN RETURN; END IF;
    UPDATE public.order_payments SET status = 'reported', reported_by = uid, reported_at = now(), updated_at = now() WHERE order_id = p_order;
    IF COALESCE(o.store_visible, true) THEN
        SELECT owner_id, "storeSlug" INTO v_owner, v_slug FROM public.stores WHERE id = o.store_id;
        SELECT split_part(COALESCE(name, 'O cliente'), ' ', 1) INTO v_name FROM public.profiles WHERE id = uid;
        PERFORM public._notify(v_owner, 'order_payment', uid, p_order,
            jsonb_build_object('title', 'Pagamento a conferir', 'text', v_name || ' diz que pagou ' || public._brl(p.amount) || CASE WHEN p.method = 'pix' THEN ' por Pix' ELSE ' pelo seu link' END || '. Confira na sua conta e confirme.', 'path', '/painel-loja/' || v_slug || '/pedidos?pedido=' || p_order),
            'pay-rep:' || p_order || ':' || floor(extract(epoch FROM now()))::text);
    END IF;
END; $function$;
