-- Cenários: ENTREGADOR PRIMEIRO, LOJA DEPOIS (migration 20261130000054). Rodar SÓ no banco LOCAL (ou staging); tudo termina em ROLLBACK.
--   docker exec -i supabase_db_iuser-local psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/driver_before_store_scenarios.sql
-- Precisa da Pizzaria Forno de Ouro (seed-pizzaria.mjs, com Entregador iUser), da cliente ana-silva-1 e de um motorista (entregador-*).
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.as_user(p uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    PERFORM set_config('request.jwt.claim.sub', p::text, true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
END $$;
CREATE OR REPLACE FUNCTION pg_temp.as_super() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    EXECUTE 'RESET ROLE';
    PERFORM set_config('request.jwt.claim.sub', '', true);
    PERFORM set_config('request.jwt.claims', '', true);
END $$;
CREATE OR REPLACE FUNCTION pg_temp.ok(c boolean, msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF NOT COALESCE(c, false) THEN RAISE EXCEPTION 'FALHOU: %', msg; END IF; RAISE NOTICE 'ok  - %', msg; END $$;

DO $$
DECLARE
    st public.stores; owner uuid; cli uuid; drv uuid; prod uuid;
    r jsonb; o uuid; o2 uuid; o3 uuid; o4 uuid; o5 uuid; n int; v_fee numeric; v_total numeric; v_ride uuid;
BEGIN
    SELECT * INTO st FROM public.stores WHERE "storeSlug" = 'pizzaria-forno-de-ouro';
    IF NOT FOUND OR NOT st.iuser_delivery_enabled THEN RAISE EXCEPTION 'precisa da Pizzaria Forno de Ouro com Entregador iUser (seed-pizzaria.mjs / seed-entregadores.mjs)'; END IF;
    owner := st.owner_id;
    SELECT id INTO cli FROM public.profiles WHERE "profileSlug" = 'ana-silva-1';
    SELECT p.id INTO drv FROM public.profiles p JOIN auth.users u ON u.id = p.id WHERE u.email LIKE 'entregador-%@staging.iuser.test' ORDER BY u.email LIMIT 1;
    SELECT id INTO prod FROM public.products WHERE store_id = st.id AND is_active AND type = 'physical' AND NOT COALESCE(has_addons, false) LIMIT 1;
    PERFORM set_config('app.t_cli', cli::text, true);

    -- 1) pedido de ENTREGA com Entregador iUser nasce RETIDO e a busca começa
    PERFORM pg_temp.as_user(cli);
    r := public.create_store_order(st.id, jsonb_build_array(jsonb_build_object('product_id', prod, 'quantity', 1, 'addons', '[]'::jsonb)), 'entrega', 'pix', 'Rua das Palmeiras, 1200, Porto Velho - RO', -8.7612, -63.9008, NULL, NULL, NULL, gen_random_uuid());
    o := (r->>'order_id')::uuid;
    PERFORM pg_temp.as_super();
    PERFORM pg_temp.ok((r->>'awaiting_driver')::boolean, '1a. a resposta diz que está procurando entregador');
    PERFORM pg_temp.ok((SELECT NOT store_visible FROM public.orders WHERE id = o), '1b. o pedido nasce retido (store_visible = false)');
    PERFORM pg_temp.ok(EXISTS (SELECT 1 FROM public.order_delivery_dispatches WHERE order_id = o AND status = 'searching'), '1c. a entrega já está em busca');
    PERFORM pg_temp.ok(EXISTS (SELECT 1 FROM public.ride_requests WHERE order_id = o AND status = 'pending'), '1d. a corrida já está aberta para os motoristas');
    PERFORM pg_temp.ok(NOT EXISTS (SELECT 1 FROM public.profile_notifications WHERE profile_id = owner AND ref_id = o AND kind = 'order_new'), '1e. a loja NÃO foi avisada');

    -- 2) a loja não enxerga nem mexe
    PERFORM pg_temp.as_user(owner);
    SELECT count(*) INTO n FROM public.orders WHERE id = o;
    PERFORM pg_temp.ok(n = 0, '2a. a dona da loja não enxerga o pedido retido');
    SELECT count(*) INTO n FROM public.order_delivery_dispatches WHERE order_id = o;
    PERFORM pg_temp.ok(n = 0, '2b. nem a entrega dele');
    UPDATE public.orders SET status = 'preparing' WHERE id = o;
    GET DIAGNOSTICS n = ROW_COUNT;
    PERFORM pg_temp.ok(n = 0, '2c. nem consegue aceitar');
    PERFORM pg_temp.as_user(cli);
    SELECT count(*) INTO n FROM public.orders WHERE id = o;
    PERFORM pg_temp.ok(n = 1, '2d. a cliente enxerga o próprio pedido');

    -- 3) um entregador ACEITA -> o pedido chega à loja, com aviso
    PERFORM pg_temp.as_super();
    SELECT id INTO v_ride FROM public.ride_requests WHERE order_id = o;
    UPDATE public.ride_requests SET status = 'accepted', driver_id = drv WHERE id = v_ride;
    PERFORM pg_temp.ok((SELECT store_visible FROM public.orders WHERE id = o), '3a. com o entregador, o pedido é liberado para a loja');
    PERFORM pg_temp.ok(EXISTS (SELECT 1 FROM public.profile_notifications WHERE profile_id = owner AND ref_id = o AND kind = 'order_new'), '3b. a loja recebe o aviso de pedido novo');
    PERFORM pg_temp.ok(EXISTS (SELECT 1 FROM public.profile_notifications WHERE profile_id = owner AND ref_id = o AND kind = 'order_new' AND meta->>'text' LIKE '%vai buscar%'), '3b2. o aviso diz QUEM vai buscar o pedido');
    PERFORM pg_temp.as_user(owner);
    SELECT count(*) INTO n FROM public.orders WHERE id = o;
    PERFORM pg_temp.ok(n = 1, '3c. a dona agora enxerga o pedido');
    UPDATE public.orders SET status = 'preparing' WHERE id = o;
    GET DIAGNOSTICS n = ROW_COUNT;
    PERFORM pg_temp.ok(n = 1, '3d. e consegue aceitar');
    PERFORM pg_temp.as_super();
    PERFORM pg_temp.ok(EXISTS (SELECT 1 FROM public.profile_notifications WHERE profile_id = drv AND ref_id = o AND kind = 'delivery_order_preparing'), '3e. o ENTREGADOR é avisado de que a loja começou a preparar');

    -- 4) sem entregador: o cliente troca para RETIRADA
    PERFORM pg_temp.as_user(cli);
    r := public.create_store_order(st.id, jsonb_build_array(jsonb_build_object('product_id', prod, 'quantity', 1, 'addons', '[]'::jsonb)), 'entrega', 'pix', 'Av. Calama, 500, Porto Velho - RO', -8.7522, -63.9120, NULL, NULL, NULL, gen_random_uuid());
    o2 := (r->>'order_id')::uuid; v_fee := (r->>'delivery_fee')::numeric; v_total := (r->>'total_amount')::numeric;
    PERFORM pg_temp.ok(v_fee > 0, '4a. pedido 2 com frete');
    r := public.switch_held_order_to_pickup(o2);
    PERFORM pg_temp.as_super();
    PERFORM pg_temp.ok((SELECT delivery_option = 'retirada' AND delivery_fee = 0 AND store_visible AND total_amount = v_total - v_fee FROM public.orders WHERE id = o2), '4b. virou retirada, sem frete, total menor, e foi para a loja');
    PERFORM pg_temp.ok(NOT EXISTS (SELECT 1 FROM public.ride_requests WHERE order_id = o2 AND status IN ('pending', 'accepted')), '4c. a corrida foi encerrada');
    PERFORM pg_temp.ok(NOT EXISTS (SELECT 1 FROM public.order_delivery_dispatches WHERE order_id = o2 AND status = 'searching'), '4d. a busca foi encerrada');
    PERFORM pg_temp.ok(EXISTS (SELECT 1 FROM public.profile_notifications WHERE profile_id = owner AND ref_id = o2 AND kind = 'order_new'), '4e. a loja recebe o pedido (retirada)');

    -- 5) o cliente CANCELA o pedido retido
    PERFORM pg_temp.as_user(cli);
    r := public.create_store_order(st.id, jsonb_build_array(jsonb_build_object('product_id', prod, 'quantity', 1, 'addons', '[]'::jsonb)), 'entrega', 'pix', 'Rua Dom Pedro II, 80, Porto Velho - RO', -8.7645, -63.9051, NULL, NULL, NULL, gen_random_uuid());
    o3 := (r->>'order_id')::uuid;
    PERFORM public.cancel_held_order(o3);
    PERFORM pg_temp.as_super();
    PERFORM pg_temp.ok((SELECT status = 'rejected' AND closed_reason = 'customer_cancelled' AND NOT store_visible FROM public.orders WHERE id = o3), '5a. pedido cancelado, continua invisível para a loja');
    PERFORM pg_temp.ok(NOT EXISTS (SELECT 1 FROM public.ride_requests WHERE order_id = o3 AND status IN ('pending', 'accepted')), '5b. a corrida foi encerrada');
    PERFORM pg_temp.ok(NOT EXISTS (SELECT 1 FROM public.profile_notifications WHERE ref_id = o3 AND kind IN ('order_rejected', 'order_new')), '5c. ninguém recebe aviso de "recusado"');

    -- 6) ninguém aceita a tempo: expira sozinho e AVISA o cliente
    PERFORM pg_temp.as_user(cli);
    r := public.create_store_order(st.id, jsonb_build_array(jsonb_build_object('product_id', prod, 'quantity', 1, 'addons', '[]'::jsonb)), 'entrega', 'pix', 'Rua Almirante Barroso, 9, Porto Velho - RO', -8.7619, -63.9002, NULL, NULL, NULL, gen_random_uuid());
    o4 := (r->>'order_id')::uuid;
    PERFORM pg_temp.as_super();
    PERFORM pg_temp.ok(public.expire_held_orders() = 0, '6a. dentro do prazo, nada expira');
    UPDATE public.orders SET created_at = now() - interval '2 hours' WHERE id = o4;
    PERFORM pg_temp.ok(public.expire_held_orders() >= 1, '6b. passado o prazo, expira');
    PERFORM pg_temp.ok((SELECT status = 'rejected' AND closed_reason = 'no_driver' FROM public.orders WHERE id = o4), '6c. encerrado por falta de entregador');
    PERFORM pg_temp.ok(EXISTS (SELECT 1 FROM public.profile_notifications WHERE profile_id = cli AND ref_id = o4 AND kind = 'order_no_driver'), '6d. a cliente é avisada');
    PERFORM pg_temp.ok(NOT EXISTS (SELECT 1 FROM public.profile_notifications WHERE profile_id = owner AND ref_id = o4), '6e. a loja nunca soube');
    PERFORM pg_temp.ok(NOT EXISTS (SELECT 1 FROM public.ride_requests WHERE order_id = o4 AND status IN ('pending', 'accepted')), '6f. a corrida foi encerrada');

    -- 7) retirada e loja sem entregador iUser seguem como antes
    PERFORM pg_temp.as_user(cli);
    r := public.create_store_order(st.id, jsonb_build_array(jsonb_build_object('product_id', prod, 'quantity', 1, 'addons', '[]'::jsonb)), 'retirada', 'pix', NULL, NULL, NULL, NULL, NULL, NULL, gen_random_uuid());
    o5 := (r->>'order_id')::uuid;
    PERFORM pg_temp.as_super();
    PERFORM pg_temp.ok((SELECT store_visible FROM public.orders WHERE id = o5) AND NOT (r->>'awaiting_driver')::boolean, '7a. retirada não fica retida');
    PERFORM pg_temp.ok(EXISTS (SELECT 1 FROM public.profile_notifications WHERE profile_id = owner AND ref_id = o5 AND kind = 'order_new'), '7b. e a loja é avisada na hora');

    -- 8) a loja RECUSA um pedido que tinha corrida aberta -> a corrida fecha
    PERFORM pg_temp.as_user(cli);
    r := public.create_store_order(st.id, jsonb_build_array(jsonb_build_object('product_id', prod, 'quantity', 1, 'addons', '[]'::jsonb)), 'entrega', 'pix', 'Av. Campos Sales, 70, Porto Velho - RO', -8.7604, -63.9077, NULL, NULL, NULL, gen_random_uuid());
    o := (r->>'order_id')::uuid;
    PERFORM pg_temp.as_super();
    SELECT id INTO v_ride FROM public.ride_requests WHERE order_id = o;
    UPDATE public.ride_requests SET status = 'accepted', driver_id = drv WHERE id = v_ride;   -- libera para a loja
    PERFORM pg_temp.as_user(owner);
    UPDATE public.orders SET status = 'rejected' WHERE id = o;
    PERFORM pg_temp.as_super();
    PERFORM pg_temp.ok((SELECT status = 'cancelled' FROM public.ride_requests WHERE id = v_ride), '8a. pedido recusado encerra a corrida (antes ela ficava aberta)');

    -- 9) outra pessoa não mexe no pedido alheio
    PERFORM pg_temp.as_user(cli);
    r := public.create_store_order(st.id, jsonb_build_array(jsonb_build_object('product_id', prod, 'quantity', 1, 'addons', '[]'::jsonb)), 'entrega', 'pix', 'Rua Rafael Vaz e Silva, 3, Porto Velho - RO', -8.7660, -63.9066, NULL, NULL, NULL, gen_random_uuid());
    o := (r->>'order_id')::uuid;
    PERFORM pg_temp.as_user(drv);
    BEGIN PERFORM public.cancel_held_order(o); RAISE EXCEPTION 'deveria ter falhado'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN PERFORM public.switch_held_order_to_pickup(o); RAISE EXCEPTION 'deveria ter falhado'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    PERFORM pg_temp.as_super();
    PERFORM pg_temp.ok((SELECT NOT store_visible AND status = 'pending' FROM public.orders WHERE id = o), '9. estranho não cancela nem troca o pedido de outra pessoa');

    -- 10) interruptor geral desligado: volta ao jeito antigo
    UPDATE public.delivery_hold_settings SET enabled = false;
    PERFORM pg_temp.as_user(cli);
    r := public.create_store_order(st.id, jsonb_build_array(jsonb_build_object('product_id', prod, 'quantity', 1, 'addons', '[]'::jsonb)), 'entrega', 'pix', 'Rua das Palmeiras, 1, Porto Velho - RO', -8.7612, -63.9008, NULL, NULL, NULL, gen_random_uuid());
    PERFORM pg_temp.as_super();
    PERFORM pg_temp.ok(NOT (r->>'awaiting_driver')::boolean AND (SELECT store_visible FROM public.orders WHERE id = (r->>'order_id')::uuid), '10. com o interruptor desligado o pedido vai direto à loja');
END $$;

ROLLBACK;
