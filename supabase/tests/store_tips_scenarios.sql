-- Cenários da GORJETA / APOIAR O ARTISTA (migration 20261130000029). Roda LOCAL, numa transação desfeita:
--   docker exec -i supabase_db_iuser-local psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/store_tips_scenarios.sql
BEGIN;
DO $$
DECLARE
    v_store uuid; v_owner uuid; v_a uuid; v_b uuid; v_tip uuid; v_r jsonb; v_hint text; v_n integer;
BEGIN
    SELECT s.id, s.owner_id INTO v_store, v_owner FROM stores s WHERE s."storeSlug" = 'pizzaria-forno-de-ouro';
    SELECT (SELECT id FROM profiles WHERE id <> v_owner ORDER BY id OFFSET 0 LIMIT 1), (SELECT id FROM profiles WHERE id <> v_owner ORDER BY id OFFSET 1 LIMIT 1) INTO v_a, v_b;
    UPDATE stores SET pix_key = 'pix@teste.iuser', pix_key_type = 'email', is_active = true WHERE id = v_store;

    -- 1) o botão: a loja aceita; o dono sabe que é dono
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    v_r := get_store_tips_info(v_store);
    IF NOT (v_r->>'enabled')::boolean OR (v_r->>'is_owner')::boolean THEN RAISE EXCEPTION 'FALHA 1: info %', v_r; END IF;

    -- 2) criar: valor fora da faixa é recusado; dono não apoia a própria loja; o resto devolve a chave Pix
    BEGIN PERFORM create_store_tip(v_store, 50); RAISE EXCEPTION 'FALHA 2: aceitou R$ 0,50';
    EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_hint = PG_EXCEPTION_HINT; IF v_hint <> 'amount' THEN RAISE; END IF; END;
    BEGIN PERFORM create_store_tip(v_store, 100001); RAISE EXCEPTION 'FALHA 2b: aceitou R$ 1.000,01';
    EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_hint = PG_EXCEPTION_HINT; IF v_hint <> 'amount' THEN RAISE; END IF; END;
    v_r := create_store_tip(v_store, 1000, NULL, '  Obrigado pela trilha!  ');
    v_tip := (v_r->>'id')::uuid;
    IF v_r->>'pix_key' <> 'pix@teste.iuser' OR (v_r->>'amount_cents')::int <> 1000 THEN RAISE EXCEPTION 'FALHA 2c: retorno %', v_r; END IF;
    RESET ROLE;
    IF (SELECT message FROM store_tips WHERE id = v_tip) <> 'Obrigado pela trilha!' THEN RAISE EXCEPTION 'FALHA 2d: recado não foi aparado'; END IF;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    IF NOT (get_store_tips_info(v_store)->>'is_owner')::boolean THEN RAISE EXCEPTION 'FALHA 2e: is_owner'; END IF;
    BEGIN PERFORM create_store_tip(v_store, 500); RAISE EXCEPTION 'FALHA 2f: o dono apoiou a própria loja';
    EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_hint = PG_EXCEPTION_HINT; IF v_hint <> 'own_store' THEN RAISE; END IF; END;
    RESET ROLE;

    -- 3) só quem apoiou diz "já fiz o Pix"
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    BEGIN PERFORM report_store_tip_paid(v_tip); RAISE EXCEPTION 'FALHA 3: outra pessoa informou o pagamento';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN PERFORM get_store_tips_panel(v_store); RAISE EXCEPTION 'FALHA 3b: estranho viu o painel';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN PERFORM resolve_store_tip(v_tip, true); RAISE EXCEPTION 'FALHA 3c: estranho confirmou';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN PERFORM set_store_tips_enabled(v_store, false); RAISE EXCEPTION 'FALHA 3d: estranho desligou';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    PERFORM report_store_tip_paid(v_tip);
    PERFORM report_store_tip_paid(v_tip);
    RESET ROLE;

    -- 4) o painel da loja: 1 a conferir; confirmar soma
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    v_r := get_store_tips_panel(v_store);
    IF (v_r->>'to_check')::int <> 1 OR jsonb_array_length(v_r->'rows') <> 1 OR (v_r->'rows'->0->>'status') <> 'reported' THEN RAISE EXCEPTION 'FALHA 4: painel %', v_r; END IF;
    PERFORM resolve_store_tip(v_tip, true);
    v_r := get_store_tips_panel(v_store);
    IF (v_r->>'confirmed_cents')::int <> 1000 OR (v_r->>'confirmed_count')::int <> 1 OR (v_r->>'to_check')::int <> 0 THEN RAISE EXCEPTION 'FALHA 4b: totais %', v_r; END IF;
    IF (get_store_tips_info(v_store)->>'supporters')::int <> 1 THEN RAISE EXCEPTION 'FALHA 4c: apoiadores'; END IF;

    -- 5) desligar: o botão some e criar é recusado
    PERFORM set_store_tips_enabled(v_store, false);
    IF (get_store_tips_info(v_store)->>'enabled')::boolean THEN RAISE EXCEPTION 'FALHA 5: continuou ligado'; END IF;
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    BEGIN PERFORM create_store_tip(v_store, 500); RAISE EXCEPTION 'FALHA 5b: criou com a loja desligada';
    EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_hint = PG_EXCEPTION_HINT; IF v_hint <> 'tips_off' THEN RAISE; END IF; END;
    RESET ROLE;
    -- ligar de novo e testar o limite (10 por hora)
    UPDATE store_tip_settings SET enabled = true WHERE store_id = v_store;
    SET LOCAL ROLE authenticated;
    FOR v_n IN 1..9 LOOP PERFORM create_store_tip(v_store, 200); END LOOP;   -- com a 1ª, são 10
    BEGIN PERFORM create_store_tip(v_store, 200); RAISE EXCEPTION 'FALHA 5c: passou do limite por hora';
    EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_hint = PG_EXCEPTION_HINT; IF v_hint <> 'rate_limit' THEN RAISE; END IF; END;

    -- 6) sem chave Pix a loja não recebe; as tabelas não se leem direto
    RESET ROLE;
    UPDATE stores SET pix_key = NULL, deposit_mode = 'none' WHERE id = v_store;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    IF (get_store_tips_info(v_store)->>'enabled')::boolean THEN RAISE EXCEPTION 'FALHA 6: aceitou sem chave Pix'; END IF;
    BEGIN PERFORM 1 FROM store_tips LIMIT 1; RAISE EXCEPTION 'FALHA 6b: leu store_tips';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;

    RAISE EXCEPTION 'RESULT: OK (cenários da gorjeta passaram)';
END $$;
ROLLBACK;
