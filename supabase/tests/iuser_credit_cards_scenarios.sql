-- Cenários dos cartões de crédito do iUser (migration 20261130000085). Transação DESFEITA: só LOCAL/staging.
-- Rodar (precisa de superusuário): docker exec -i -e PGPASSWORD supabase_db_iuser-local psql -h 127.0.0.1 -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/tests/iuser_credit_cards_scenarios.sql
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.as_user(p uuid) RETURNS void LANGUAGE sql AS $$
    SELECT set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true), set_config('request.jwt.claim.sub', p::text, true)
$$;

DO $$
DECLARE
    v_store uuid; v_owner uuid; v_buyer uuid; v_other uuid; v_prod uuid; v_price numeric; v_camp uuid; v_camp2 uuid;
    c1 text; c2 text; c3 text; j jsonb; v_order uuid; v_hint text; v_items jsonb;
BEGIN
    SELECT s.id, s.owner_id, p.id, p.price INTO v_store, v_owner, v_prod, v_price
      FROM public.stores s JOIN public.products p ON p.store_id = s.id
     WHERE s.is_active AND COALESCE(s.accepts_pickup, true) AND p.is_active AND p.listing_type = 'sale' AND p.type = 'physical'
       AND COALESCE(p.has_addons, false) = false AND p.price BETWEEN 20 AND 200
     ORDER BY s.created_at LIMIT 1;
    IF v_store IS NULL THEN RAISE NOTICE 'sem loja/produto: pulado'; RETURN; END IF;
    SELECT id INTO v_buyer FROM public.profiles WHERE id <> v_owner AND NOT COALESCE(is_blocked, false) ORDER BY created_at LIMIT 1;
    SELECT id INTO v_other FROM public.profiles WHERE id NOT IN (v_owner, v_buyer) AND NOT COALESCE(is_blocked, false) ORDER BY created_at LIMIT 1;
    v_items := jsonb_build_array(jsonb_build_object('product_id', v_prod, 'quantity', 1));

    v_camp := public.admin_credit_create_campaign('Teste rua', 10, 0, now() + interval '30 days', 3, v_owner);
    SELECT jsonb_agg(code ORDER BY code) INTO j FROM public.iuser_credit_codes WHERE campaign_id = v_camp;
    c1 := j->>0; c2 := j->>1; c3 := j->>2;
    ASSERT c1 LIKE 'IU%' AND length(c1) = 10, '1: código no formato';

    -- 2) conferir antes não gasta
    PERFORM pg_temp.as_user(v_buyer);
    j := public.check_iuser_credit(lower(c1), v_store);
    ASSERT (j->>'ok')::boolean AND (j->>'value')::numeric = 10, '2: confere e diz o valor';
    ASSERT (SELECT status FROM public.iuser_credit_codes WHERE code = c1) = 'available', '2b: conferir não gasta';

    -- 3) pedido com o cartão: desconto de R$ 10, o iUser fica devendo à loja
    j := public.create_store_order(v_store, v_items, 'retirada', 'pix', p_discount_code => c1);
    v_order := (j->>'order_id')::uuid;
    ASSERT (j->>'discount')::numeric = 10, '3: desconto de 10';
    ASSERT (j->>'total_amount')::numeric = v_price - 10, '3b: total já com o desconto';
    ASSERT (SELECT status FROM public.iuser_store_credits WHERE order_id = v_order) = 'pending', '3c: dívida pendente';

    -- 4) o mesmo código de novo: recusado; outro código da MESMA campanha pela mesma pessoa: recusado
    BEGIN PERFORM public.create_store_order(v_store, v_items, 'retirada', 'pix', p_discount_code => c1); ASSERT false, '4a';
    EXCEPTION WHEN raise_exception THEN GET STACKED DIAGNOSTICS v_hint = PG_EXCEPTION_HINT; ASSERT v_hint = 'credit_used', '4a: ' || v_hint; END;
    BEGIN PERFORM public.create_store_order(v_store, v_items, 'retirada', 'pix', p_discount_code => c2); ASSERT false, '4b';
    EXCEPTION WHEN raise_exception THEN GET STACKED DIAGNOSTICS v_hint = PG_EXCEPTION_HINT; ASSERT v_hint = 'credit_once', '4b: ' || v_hint; END;

    -- 5) pedido pago → o iUser deve; a dona vê
    UPDATE public.orders SET status = 'paid' WHERE id = v_order;
    ASSERT (SELECT status FROM public.iuser_store_credits WHERE order_id = v_order) = 'due', '5: devido';
    PERFORM pg_temp.as_user(v_owner);
    ASSERT (public.get_store_iuser_credits(v_store)->>'due')::numeric >= 10, '5b: a loja vê';
    PERFORM pg_temp.as_user(v_other);
    BEGIN PERFORM public.get_store_iuser_credits(v_store); ASSERT false, '5c'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;

    -- 6) a dona não usa na própria loja
    PERFORM pg_temp.as_user(v_owner);
    BEGIN PERFORM public.create_store_order(v_store, v_items, 'retirada', 'pix', p_discount_code => c2); ASSERT false, '6';
    EXCEPTION WHEN raise_exception THEN GET STACKED DIAGNOSTICS v_hint = PG_EXCEPTION_HINT; ASSERT v_hint = 'credit_own_store', '6: ' || v_hint; END;

    -- 7) pedido recusado → anula e o código volta
    PERFORM pg_temp.as_user(v_other);
    j := public.create_store_order(v_store, v_items, 'retirada', 'pix', p_discount_code => c2);
    v_order := (j->>'order_id')::uuid;
    UPDATE public.orders SET status = 'rejected' WHERE id = v_order;
    ASSERT (SELECT status FROM public.iuser_store_credits WHERE order_id = v_order) = 'void', '7: anulado';
    ASSERT (SELECT status FROM public.iuser_credit_codes WHERE code = c2) = 'available', '7b: código volta';

    -- 8) pedido mínimo e campanha encerrada
    v_camp2 := public.admin_credit_create_campaign('Mínimo alto', 5, 4999, NULL, 1, v_owner);
    SELECT code INTO c3 FROM public.iuser_credit_codes WHERE campaign_id = v_camp2;
    BEGIN PERFORM public.create_store_order(v_store, v_items, 'retirada', 'pix', p_discount_code => c3); ASSERT false, '8a';
    EXCEPTION WHEN raise_exception THEN GET STACKED DIAGNOSTICS v_hint = PG_EXCEPTION_HINT; ASSERT v_hint = 'credit_min_order', '8a: ' || v_hint; END;
    PERFORM public.admin_credit_set_active(v_camp2, false, v_owner);
    ASSERT NOT (public.check_iuser_credit(c3, v_store)->>'ok')::boolean, '8b: desligada não vale';

    -- 9) admin marca pago
    ASSERT public.admin_credit_mark_paid(v_store, v_owner, 'Pix teste') >= 10, '9: pago';
    ASSERT NOT EXISTS (SELECT 1 FROM public.iuser_store_credits WHERE store_id = v_store AND status = 'due'), '9b: nada devido';

    -- 10) o app não lê as tabelas
    ASSERT NOT has_table_privilege('authenticated', 'public.iuser_credit_codes', 'SELECT'), '10a';
    ASSERT NOT has_function_privilege('authenticated', 'public.admin_credit_overview()', 'EXECUTE'), '10b';
    ASSERT NOT has_function_privilege('anon', 'public.check_iuser_credit(text, uuid)', 'EXECUTE'), '10c';

    RAISE NOTICE 'iuser_credit_cards: TUDO CERTO';
END $$;
ROLLBACK;
