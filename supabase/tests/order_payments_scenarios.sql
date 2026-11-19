-- Cenários do pagamento do pedido de loja, do frete devido ao entregador e do acerto pelo saldo (migration 20261130000074). Transação DESFEITA: só LOCAL/staging.
-- Rodar (precisa de superusuário): docker exec -i -e PGPASSWORD supabase_db_iuser-local psql -h 127.0.0.1 -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/tests/order_payments_scenarios.sql
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.as_user(p uuid) RETURNS void LANGUAGE sql AS $$
    SELECT set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true), set_config('request.jwt.claim.sub', p::text, true)
$$;

DO $$
DECLARE
    v_store uuid; v_owner uuid; v_buyer uuid; v_other uuid; v_drv uuid; v_order uuid; v_order2 uuid; v_ride uuid; v_ride2 uuid; v_ride3 uuid;
    j jsonb; v_hint text; v_n int; v_sett uuid;
BEGIN
    SELECT s.id, s.owner_id INTO v_store, v_owner FROM public.stores s WHERE NULLIF(btrim(COALESCE(s.pix_key, '')), '') IS NOT NULL AND s.owner_id IS NOT NULL ORDER BY s.created_at LIMIT 1;
    IF v_store IS NULL THEN RAISE NOTICE 'SEM loja com chave Pix: cenários pulados'; RETURN; END IF;
    SELECT id INTO v_buyer FROM public.profiles WHERE id <> v_owner ORDER BY created_at LIMIT 1;
    SELECT id INTO v_other FROM public.profiles WHERE id NOT IN (v_owner, v_buyer) ORDER BY created_at LIMIT 1;
    SELECT id INTO v_drv FROM public.profiles WHERE id NOT IN (v_owner, v_buyer, v_other) ORDER BY created_at LIMIT 1;
    DELETE FROM public.employees WHERE store_id = v_store AND user_id IN (v_buyer, v_other, v_drv);

    -- 1) pedido por Pix nasce com o pagamento a fazer, no valor do pedido
    INSERT INTO public.orders (store_id, buyer_id, total_amount, delivery_fee, payment_method, status, delivery_option, checkout_id)
    VALUES (v_store, v_buyer, 50, 8, 'pix', 'pending', 'delivery', gen_random_uuid()) RETURNING id INTO v_order;
    SELECT count(*) INTO v_n FROM public.order_payments WHERE order_id = v_order AND method = 'pix' AND amount = 50 AND status = 'awaiting';
    ASSERT v_n = 1, '1: pagamento Pix criado';
    -- 1b) como o create_store_order: o pedido nasce com total 0 e o total chega depois
    INSERT INTO public.orders (store_id, buyer_id, total_amount, delivery_fee, payment_method, status, delivery_option, checkout_id)
    VALUES (v_store, v_buyer, 0, 8, 'pix', 'pending', 'delivery', gen_random_uuid()) RETURNING id INTO v_order2;
    ASSERT NOT EXISTS (SELECT 1 FROM public.order_payments WHERE order_id = v_order2), '1b: sem valor ainda, sem pagamento';
    UPDATE public.orders SET total_amount = 33 WHERE id = v_order2;
    ASSERT (SELECT amount FROM public.order_payments WHERE order_id = v_order2) = 33, '1c: o pagamento nasce quando o total chega';

    -- 2) o comprador recebe a chave; um estranho, nada
    PERFORM pg_temp.as_user(v_buyer);
    j := public.get_order_payment(v_order);
    ASSERT j->>'role' = 'buyer' AND j->>'pix_key' IS NOT NULL AND (j->>'amount')::numeric = 50, '2a: comprador vê a chave';
    PERFORM pg_temp.as_user(v_other);
    ASSERT public.get_order_payment(v_order) IS NULL, '2b: estranho não vê nada';
    BEGIN PERFORM public.report_order_paid(v_order); ASSERT false, '2c: estranho não avisa pagamento'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;

    -- 3) "já paguei" → a loja confirma; a loja não vê a chave
    PERFORM pg_temp.as_user(v_buyer);
    PERFORM public.report_order_paid(v_order);
    PERFORM pg_temp.as_user(v_owner);
    j := public.get_order_payment(v_order);
    ASSERT j->>'role' = 'store' AND j->>'status' = 'reported' AND j->>'pix_key' IS NULL, '3a: loja vê "a conferir" sem a chave';
    BEGIN PERFORM public.confirm_order_payment(v_order, false, NULL); ASSERT false, '3b: "não recebi" pede o motivo'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
    PERFORM public.confirm_order_payment(v_order, true, NULL);
    ASSERT (SELECT status FROM public.order_payments WHERE order_id = v_order) = 'confirmed', '3c: confirmado';
    PERFORM pg_temp.as_user(v_other);
    BEGIN PERFORM public.confirm_order_payment(v_order, true, NULL); ASSERT false, '3d: estranho não confirma'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;

    -- 4) o total mudou antes de pagar (virou retirada): o valor a pagar acompanha
    INSERT INTO public.orders (store_id, buyer_id, total_amount, delivery_fee, payment_method, status, delivery_option, checkout_id)
    VALUES (v_store, v_buyer, 60, 8, 'pix', 'pending', 'delivery', gen_random_uuid()) RETURNING id INTO v_order2;
    UPDATE public.orders SET total_amount = 52 WHERE id = v_order2;
    ASSERT (SELECT amount FROM public.order_payments WHERE order_id = v_order2) = 52, '4: valor acompanha o total';

    -- 5) link de cartão da loja: só https; pedido no cartão leva o link ao comprador
    PERFORM pg_temp.as_user(v_owner);
    BEGIN PERFORM public.set_store_payment_link(v_store, 'http://inseguro.com/x'); ASSERT false, '5a: link sem https recusado'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
    PERFORM public.set_store_payment_link(v_store, 'https://link.mercadopago.com.br/loja-teste');
    INSERT INTO public.orders (store_id, buyer_id, total_amount, delivery_fee, payment_method, status, delivery_option, checkout_id)
    VALUES (v_store, v_buyer, 70, 8, 'cartao', 'pending', 'delivery', gen_random_uuid()) RETURNING id INTO v_order2;
    PERFORM pg_temp.as_user(v_buyer);
    j := public.get_order_payment(v_order2);
    ASSERT j->>'method' = 'link_cartao' AND j->>'card_link' = 'https://link.mercadopago.com.br/loja-teste', '5b: comprador recebe o link';
    PERFORM pg_temp.as_user(v_other);
    BEGIN PERFORM public.get_store_payment_link(v_store); ASSERT false, '5c: estranho não lê o link da loja'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;

    -- 6) entrega concluída de pedido PAGO à loja → a loja deve o frete ao entregador; em dinheiro → o entregador deve os produtos
    PERFORM set_config('request.jwt.claims', '', true); PERFORM set_config('request.jwt.claim.sub', '', true);
    SELECT id INTO v_ride FROM public.ride_requests WHERE order_id IS NOT NULL ORDER BY created_at DESC LIMIT 1;
    SELECT id INTO v_ride2 FROM public.ride_requests WHERE order_id IS NOT NULL AND id <> v_ride ORDER BY created_at DESC LIMIT 1;
    SELECT id INTO v_ride3 FROM public.ride_requests WHERE order_id IS NOT NULL AND id NOT IN (v_ride, v_ride2) ORDER BY created_at DESC LIMIT 1;
    PERFORM set_config('session_replication_role', 'replica', true);
    UPDATE public.ride_requests SET order_id = v_order, store_id = v_store, driver_id = v_drv, status = 'accepted', offered_price = 8, ride_started_at = now() WHERE id = v_ride;
    INSERT INTO public.orders (store_id, buyer_id, total_amount, delivery_fee, payment_method, status, delivery_option, checkout_id)
    VALUES (v_store, v_buyer, 50, 8, 'dinheiro', 'ready', 'delivery', gen_random_uuid()) RETURNING id INTO v_order2;
    UPDATE public.ride_requests SET order_id = v_order2, store_id = v_store, driver_id = v_drv, status = 'accepted', offered_price = 8, ride_started_at = now() WHERE id = v_ride2;
    DELETE FROM public.store_dues WHERE store_id = v_store AND driver_id = v_drv;
    PERFORM set_config('session_replication_role', 'origin', true);
    UPDATE public.ride_requests SET status = 'completed' WHERE id IN (v_ride, v_ride2);
    ASSERT EXISTS (SELECT 1 FROM public.store_dues WHERE ride_id = v_ride AND kind = 'freight' AND amount = 8 AND status = 'open'), '6a: frete devido pela loja';
    ASSERT EXISTS (SELECT 1 FROM public.store_dues WHERE ride_id = v_ride2 AND kind = 'cash' AND amount = 42 AND status = 'open'), '6b: dinheiro a repassar (50 − 8)';

    -- 7) o frete não trava o entregador; o saldo é 42 − 8 = 34 que ELE paga
    ASSERT public._driver_dues_block(v_drv) IS NULL, '7a: frete não trava';
    j := public._dues_pair_balance(v_store, v_drv);
    ASSERT (j->>'net')::numeric = 34 AND (j->>'driver_owes')::numeric = 42 AND (j->>'store_owes')::numeric = 8, '7b: saldo 34';
    PERFORM pg_temp.as_user(v_owner);
    BEGIN PERFORM public.settle_dues_pair(v_store, v_drv, 'pix'); ASSERT false, '7c: a loja não declara um saldo que não deve';
    EXCEPTION WHEN insufficient_privilege THEN GET STACKED DIAGNOSTICS v_hint = PG_EXCEPTION_HINT; ASSERT v_hint = 'not_payer', '7c hint'; END;
    PERFORM pg_temp.as_user(v_drv);
    j := public.get_dues_pair_target(v_store, v_drv);
    ASSERT j->>'pix_key' IS NOT NULL, '7d: o entregador vê a chave da loja para pagar o saldo';
    j := public.settle_dues_pair(v_store, v_drv, 'pix');
    v_sett := (j->>'id')::uuid;
    ASSERT j->>'payer' = 'driver' AND (j->>'amount')::numeric = 34, '7e: acerto declarado';
    ASSERT (SELECT count(*) FROM public.store_dues WHERE settlement_id = v_sett AND status = 'declared') = 2, '7f: as duas pendências entram no acerto';
    BEGIN PERFORM public.confirm_dues_settlement(v_sett, true, NULL); ASSERT false, '7g: quem paga não confirma'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    PERFORM pg_temp.as_user(v_owner);
    PERFORM public.confirm_dues_settlement(v_sett, true, NULL);
    ASSERT (SELECT count(*) FROM public.store_dues WHERE settlement_id = v_sett AND status = 'confirmed') = 2, '7h: tudo confirmado';

    -- 8) Pix NA PORTA: o entregador mostra o QR da loja; o pedido em dinheiro vira frete devido pela loja (nada de dinheiro com ele)
    PERFORM set_config('request.jwt.claims', '', true); PERFORM set_config('request.jwt.claim.sub', '', true);
    INSERT INTO public.orders (store_id, buyer_id, total_amount, delivery_fee, payment_method, status, delivery_option, checkout_id)
    VALUES (v_store, v_buyer, 45, 8, 'dinheiro', 'ready', 'delivery', gen_random_uuid()) RETURNING id INTO v_order2;
    PERFORM set_config('session_replication_role', 'replica', true);
    UPDATE public.ride_requests SET order_id = v_order2, store_id = v_store, driver_id = v_drv, status = 'accepted', offered_price = 8, ride_started_at = now() WHERE id = v_ride3;
    PERFORM set_config('session_replication_role', 'origin', true);
    PERFORM pg_temp.as_user(v_other);
    BEGIN PERFORM public.start_door_pix(v_ride3); ASSERT false, '8a: outro motorista não'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    PERFORM pg_temp.as_user(v_drv);
    j := public.start_door_pix(v_ride3);
    ASSERT j->>'pix_key' IS NOT NULL AND (j->>'amount')::numeric = 45, '8b: QR da loja com o total';
    PERFORM public.driver_report_door_pix(v_ride3);
    PERFORM set_config('request.jwt.claims', '', true); PERFORM set_config('request.jwt.claim.sub', '', true);
    UPDATE public.ride_requests SET status = 'completed' WHERE id = v_ride3;
    ASSERT NOT EXISTS (SELECT 1 FROM public.store_dues WHERE ride_id = v_ride3 AND kind = 'cash'), '8c: sem dinheiro a repassar';
    ASSERT EXISTS (SELECT 1 FROM public.store_dues WHERE ride_id = v_ride3 AND kind = 'freight' AND amount = 8), '8d: a loja deve o frete';

    -- 9) frete avulso: a loja vê a chave do entregador (se ele cadastrou), declara, e só ELE confirma
    INSERT INTO public.driver_payout_keys (driver_id, pix_key_type, pix_key) VALUES (v_drv, 'random', gen_random_uuid()::text) ON CONFLICT (driver_id) DO NOTHING;
    PERFORM pg_temp.as_user(v_owner);
    j := public.get_freight_pay_target((SELECT id FROM public.store_dues WHERE ride_id = v_ride3 AND kind = 'freight'));
    ASSERT j->>'pix_key' IS NOT NULL, '9a: a loja vê a chave do entregador';
    PERFORM public.store_declare_freight((SELECT id FROM public.store_dues WHERE ride_id = v_ride3 AND kind = 'freight'), 'pix');
    BEGIN PERFORM public.confirm_due((SELECT id FROM public.store_dues WHERE ride_id = v_ride3 AND kind = 'freight'), true, NULL); ASSERT false, '9b: a loja não confirma o próprio frete';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    PERFORM pg_temp.as_user(v_drv);
    PERFORM public.driver_confirm_freight((SELECT id FROM public.store_dues WHERE ride_id = v_ride3 AND kind = 'freight'), true, NULL);
    ASSERT (SELECT status FROM public.store_dues WHERE ride_id = v_ride3 AND kind = 'freight') = 'confirmed', '9c: frete confirmado';

    -- 10) a corrida de entrega aberta já sabe a forma de pagamento (o que faltava na oferta)
    ASSERT NOT EXISTS (SELECT 1 FROM public.ride_requests r JOIN public.orders o ON o.id = r.order_id
                        WHERE r.status = 'pending' AND r.payment_method IS NULL AND o.payment_method IN ('pix', 'cartao', 'dinheiro')), '10: pendentes com a forma de pagamento';

    RAISE NOTICE 'order_payments: todos os cenários passaram';
END $$;

ROLLBACK;
