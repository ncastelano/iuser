-- Cenários da liberação por etapas para dinheiro/maquininha (migration 20261130000069). Transação DESFEITA: só LOCAL/staging.
-- Usa uma entrega de loja pendente qualquer e uma pessoa sem entregas de loja e sem Pix como "motorista novo".
-- Rodar (com PGPASSWORD = a senha do banco LOCAL no seu terminal): docker exec -i -e PGPASSWORD supabase_db_iuser-local psql -h 127.0.0.1 -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/tests/delivery_cash_trust_scenarios.sql
BEGIN;

DO $$
DECLARE
    v_ride uuid; v_order uuid; v_store uuid; v_drv uuid; v_other_ride uuid; v_code text; v_n int; t jsonb; v_hint text;
BEGIN
    SELECT ro.id, ro.order_id, ro.store_id INTO v_ride, v_order, v_store
      FROM public.ride_offers ro WHERE ro.status = 'pending' AND ro.order_id IS NOT NULL ORDER BY ro.created_at DESC LIMIT 1;
    IF v_ride IS NULL THEN RAISE NOTICE 'SEM entrega de loja pendente: cenários pulados'; RETURN; END IF;
    SELECT p.id INTO v_drv FROM public.profiles p
     WHERE NOT EXISTS (SELECT 1 FROM public.ride_requests r WHERE r.driver_id = p.id AND r.order_id IS NOT NULL)
       AND NOT EXISTS (SELECT 1 FROM public.driver_payout_keys k WHERE k.driver_id = p.id)
       AND NOT EXISTS (SELECT 1 FROM public.store_favorite_drivers f WHERE f.driver_id = p.id)
       AND NOT EXISTS (SELECT 1 FROM public.ride_requests r WHERE r.driver_id = p.id AND r.status = 'accepted')
       AND NOT EXISTS (SELECT 1 FROM public.ride_applications a WHERE a.applicant_id = p.id AND a.ride_request_id = v_ride)
       AND p.id <> (SELECT owner_id FROM public.stores WHERE id = v_store)
     LIMIT 1;
    IF v_drv IS NULL THEN RAISE NOTICE 'SEM pessoa para ser o motorista novo: cenários pulados'; RETURN; END IF;
    PERFORM set_config('session_replication_role', 'replica', true);   -- preparar sem os gatilhos de guarda (precisa de superusuário)

    -- 1) pedido por Pix: ninguém é barrado
    UPDATE public.orders SET payment_method = 'pix', total_amount = 50 WHERE id = v_order;
    ASSERT public._cash_trust_check(v_ride, v_drv) IS NULL, '1: pix deveria passar';

    -- 2) dinheiro e cartão: o motorista novo é barrado
    UPDATE public.orders SET payment_method = 'dinheiro' WHERE id = v_order;
    ASSERT public._cash_trust_check(v_ride, v_drv) = 'cash_trust_new', '2a: dinheiro com motorista novo';
    UPDATE public.orders SET payment_method = 'cartao' WHERE id = v_order;
    ASSERT public._cash_trust_check(v_ride, v_drv) = 'cash_trust_new', '2b: cartão (maquininha) com motorista novo';
    t := public._driver_cash_trust(v_drv);
    ASSERT t->>'level' = 'new' AND (t->'missing') ? 'deliveries' AND (t->'missing') ? 'pix', '2c: diz o que falta';

    -- 3) favorito aceito da loja leva dinheiro dela desde o primeiro dia
    INSERT INTO public.store_favorite_drivers (store_id, driver_id, status) VALUES (v_store, v_drv, 'accepted');
    ASSERT public._cash_trust_check(v_ride, v_drv) IS NULL, '3: favorito passa';
    DELETE FROM public.store_favorite_drivers WHERE store_id = v_store AND driver_id = v_drv;

    -- 4) cumpre os requisitos (selfie, Pix, 7 dias, 10 entregas) → INICIANTE: até R$ 60 por entrega e R$ 80 com ele
    UPDATE public.profiles SET created_at = now() - interval '30 days' WHERE id = v_drv;
    INSERT INTO public.driver_payout_keys (driver_id, pix_key_type, pix_key, consent_at, updated_at) VALUES (v_drv, 'random', gen_random_uuid()::text, now(), now())
        ON CONFLICT (driver_id) DO NOTHING;
    INSERT INTO public.driver_vehicles (driver_id, vehicle_kind, driver_photo_url) VALUES (v_drv, 'moto', 'x/selfie.jpg');
    UPDATE public.ride_requests SET driver_id = v_drv
     WHERE id IN (SELECT id FROM public.ride_requests WHERE order_id IS NOT NULL AND status = 'completed' AND id <> v_ride LIMIT 11);   -- 11: o 4d põe uma delas em andamento
    t := public._driver_cash_trust(v_drv);
    ASSERT t->>'level' = 'starter', '4a: iniciante, veio ' || (t->>'level') || ' faltando ' || (t->>'missing');
    UPDATE public.orders SET payment_method = 'dinheiro', total_amount = 50 WHERE id = v_order;
    ASSERT public._cash_trust_check(v_ride, v_drv) IS NULL, '4b: R$ 50 passa';
    UPDATE public.orders SET total_amount = 70 WHERE id = v_order;
    ASSERT public._cash_trust_check(v_ride, v_drv) = 'cash_trust_order_max', '4c: R$ 70 passa do limite por entrega';
    -- já com R$ 50 de outra entrega em dinheiro aceita: 50 + 40 > 80
    UPDATE public.orders SET total_amount = 40 WHERE id = v_order;
    SELECT r.id INTO v_other_ride FROM public.ride_requests r WHERE r.driver_id = v_drv AND r.status = 'completed' LIMIT 1;
    UPDATE public.ride_requests SET status = 'accepted' WHERE id = v_other_ride;
    UPDATE public.orders SET payment_method = 'dinheiro', total_amount = 50 WHERE id = (SELECT order_id FROM public.ride_requests WHERE id = v_other_ride);
    ASSERT public._cash_trust_check(v_ride, v_drv) = 'cash_trust_open_max', '4d: passa do limite em aberto';
    UPDATE public.ride_requests SET status = 'completed' WHERE id = v_other_ride;

    -- 5) 30 entregas → LIBERADO (sem limite próprio)
    UPDATE public.ride_requests SET driver_id = v_drv
     WHERE id IN (SELECT id FROM public.ride_requests WHERE order_id IS NOT NULL AND status = 'completed' AND driver_id <> v_drv AND id <> v_ride LIMIT 20);
    UPDATE public.orders SET total_amount = 250 WHERE id = v_order;
    ASSERT public._driver_cash_trust(v_drv)->>'level' = 'full', '5a: liberado';
    ASSERT public._cash_trust_check(v_ride, v_drv) IS NULL, '5b: liberado leva R$ 250';

    -- 6) nota baixa (3+ avaliações) volta a "novo"
    INSERT INTO public.ride_reviews (id, ride_request_id, reviewer_id, reviewee_id, rating, created_at)
    SELECT gen_random_uuid(), r.id, (SELECT owner_id FROM public.stores WHERE id = v_store), v_drv, 2, now()
      FROM public.ride_requests r WHERE r.driver_id = v_drv LIMIT 3;
    ASSERT public._cash_trust_check(v_ride, v_drv) = 'cash_trust_new', '6: nota baixa barra';
    DELETE FROM public.ride_reviews WHERE reviewee_id = v_drv;

    -- 7) desligado nas configurações: ninguém é barrado
    UPDATE public.delivery_trust_settings SET enabled = false;
    UPDATE public.ride_requests SET driver_id = NULL WHERE driver_id = v_drv;   -- volta a ser "novo"
    ASSERT public._cash_trust_check(v_ride, v_drv) IS NULL, '7: desligado';
    UPDATE public.delivery_trust_settings SET enabled = true;
    ASSERT public._cash_trust_check(v_ride, v_drv) = 'cash_trust_new', '7b: religado';

    -- 8) a lista e a candidatura, como o próprio motorista
    PERFORM set_config('session_replication_role', 'origin', true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_drv, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    SELECT count(*) INTO v_n FROM public.ride_offers WHERE id = v_ride;
    ASSERT v_n = 0, '8a: a oferta em dinheiro não aparece para o novo';
    BEGIN
        INSERT INTO public.ride_applications (ride_request_id, applicant_id) VALUES (v_ride, v_drv);
        ASSERT false, '8b: a candidatura deveria ser recusada';
    EXCEPTION WHEN raise_exception THEN
        GET STACKED DIAGNOSTICS v_hint = PG_EXCEPTION_HINT;
        ASSERT v_hint = 'cash_trust_new', '8b: hint ' || COALESCE(v_hint, '-');
    END;
    t := public.get_my_cash_trust();
    ASSERT t->>'level' = 'new' AND (t->>'starter_per_order')::numeric = 60 AND (t->>'starter_open_max')::numeric = 80, '8c: leitura própria';
    RESET ROLE;
    PERFORM set_config('session_replication_role', 'replica', true);
    UPDATE public.orders SET payment_method = 'pix' WHERE id = v_order;
    PERFORM set_config('session_replication_role', 'origin', true);
    SET LOCAL ROLE authenticated;
    SELECT count(*) INTO v_n FROM public.ride_offers WHERE id = v_ride;
    ASSERT v_n = 1, '8d: a mesma entrega por Pix aparece';
    RESET ROLE;

    -- 9) o aviso do celular só vai a quem pode levar
    PERFORM set_config('session_replication_role', 'replica', true);
    UPDATE public.orders SET payment_method = 'dinheiro' WHERE id = v_order;
    ASSERT cardinality(public.cash_trust_filter(v_ride, ARRAY[v_drv])) = 0, '9: filtro do aviso';

    RAISE NOTICE 'delivery_cash_trust: todos os cenários passaram';
END $$;

ROLLBACK;
