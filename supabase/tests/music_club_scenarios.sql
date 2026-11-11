-- Cenários do CLUBE DA LOJA PAGO + MÚSICA (migration 20261130000034). Roda LOCAL, numa transação desfeita:
--   docker exec -i supabase_db_iuser-local psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/music_club_scenarios.sql
BEGIN;
DO $$
DECLARE
    v_store uuid; v_owner uuid; v_fan uuid; v_other uuid; v_free uuid; v_music uuid; v_course uuid; v_mix uuid; v_item uuid; v_pay uuid; v_pay2 uuid; v_i jsonb; v_hint text;
    v_end1 timestamptz; v_end2 timestamptz; v_n integer; v_pix text;
BEGIN
    SELECT s.id, s.owner_id, s.pix_key INTO v_store, v_owner, v_pix FROM stores s WHERE s."storeSlug" = 'pizzaria-forno-de-ouro';
    IF v_pix IS NULL THEN UPDATE stores SET pix_key = 'pizzaria@teste.com', pix_key_type = 'email' WHERE id = v_store; END IF;
    SELECT (SELECT id FROM profiles WHERE id <> v_owner ORDER BY id OFFSET 0 LIMIT 1), (SELECT id FROM profiles WHERE id <> v_owner ORDER BY id OFFSET 1 LIMIT 1), (SELECT id FROM profiles WHERE id <> v_owner ORDER BY id OFFSET 2 LIMIT 1) INTO v_fan, v_other, v_free;
    UPDATE stores SET vip_club_enabled = true, vip_club_price = NULL WHERE id = v_store;
    INSERT INTO products (name, slug, price, type, store_id, owner_id, is_active) VALUES ('Álbum do clube', 'album-clube-x', 30, 'digital', v_store, v_owner, true) RETURNING id INTO v_music;
    INSERT INTO products (name, slug, price, type, store_id, owner_id, is_active) VALUES ('Curso do clube', 'curso-clube-x', 80, 'digital', v_store, v_owner, true) RETURNING id INTO v_course;
    INSERT INTO products (name, slug, price, type, store_id, owner_id, is_active) VALUES ('Misto do clube', 'misto-clube-x', 20, 'digital', v_store, v_owner, true) RETURNING id INTO v_mix;
    INSERT INTO digital_contents (product_id, owner_id, title, kind, bucket, storage_path, position) VALUES (v_music, v_owner, 'Faixa 1', 'audio', 'digital-music', v_owner || '/x/f1.mp3', 0) RETURNING id INTO v_item;
    INSERT INTO digital_contents (product_id, owner_id, title, kind, bucket, storage_path, position) VALUES (v_music, v_owner, 'Faixa 2', 'audio', 'digital-music', v_owner || '/x/f2.mp3', 1);
    INSERT INTO digital_contents (product_id, owner_id, title, kind, bucket, storage_path, position) VALUES (v_course, v_owner, 'Aula 1', 'video', 'digital-files', v_owner || '/x/a1.mp4', 0);
    INSERT INTO digital_contents (product_id, owner_id, title, kind, bucket, storage_path, position) VALUES (v_mix, v_owner, 'Faixa', 'audio', 'digital-music', v_owner || '/x/m1.mp3', 0);
    INSERT INTO digital_contents (product_id, owner_id, title, kind, bucket, storage_path, position) VALUES (v_mix, v_owner, 'Cifra', 'document', 'digital-files', v_owner || '/x/m1.pdf', 1);

    -- 1) a dona configura: mensalidade e música; valores fora da faixa e sem Pix são recusados; só a dona
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_fan, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    BEGIN PERFORM set_club_settings(v_store, 1000, true); RAISE EXCEPTION 'FALHA 1: outra pessoa configurou o clube';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    BEGIN PERFORM set_club_settings(v_store, 100, true); RAISE EXCEPTION 'FALHA 1b: mensalidade de R$ 1 aceita';
    EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
    BEGIN PERFORM set_club_settings(v_store, 60000, true); RAISE EXCEPTION 'FALHA 1c: mensalidade de R$ 600 aceita';
    EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
    PERFORM set_club_settings(v_store, 1990, true);
    RESET ROLE;
    IF (SELECT round(vip_club_price * 100)::int FROM stores WHERE id = v_store) <> 1990 OR NOT (SELECT includes_music FROM store_club_settings WHERE store_id = v_store) THEN RAISE EXCEPTION 'FALHA 1d: configuração não gravou'; END IF;

    -- 2) o público vê o clube; entrar de graça num clube pago não vale
    PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
    SET LOCAL ROLE anon; v_i := get_club_info(v_store); RESET ROLE;
    IF v_i->>'enabled' <> 'true' OR (v_i->>'price_cents')::int <> 1990 OR v_i->>'includes_music' <> 'true' OR (v_i->>'tracks')::int < 3 OR v_i->'my' <> 'null'::jsonb OR v_i->>'is_owner' <> 'false' THEN RAISE EXCEPTION 'FALHA 2: info pública %', v_i; END IF;
    IF v_i::text ~* 'pix' THEN RAISE EXCEPTION 'FALHA 2b: a info pública vaza a chave Pix'; END IF;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_fan, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    BEGIN PERFORM join_vip_club(v_store); RAISE EXCEPTION 'FALHA 2c: entrou de graça no clube pago';
    EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_hint = PG_EXCEPTION_HINT; IF v_hint <> 'paid_club' THEN RAISE; END IF; END;
    -- sem pagar, nada de música
    IF (get_digital_item_access(v_item)->>'allowed')::boolean THEN RAISE EXCEPTION 'FALHA 2d: ouviu sem assinar'; END IF;
    RESET ROLE;

    -- 3) a pessoa começa a assinar: recebe a chave Pix e o valor; repetir reaproveita; a dona não assina o próprio clube
    SET LOCAL ROLE authenticated;
    v_i := start_club_payment(v_store); v_pay := (v_i->>'id')::uuid;
    IF (v_i->>'amount_cents')::int <> 1990 OR (v_i->>'pix_key') IS NULL THEN RAISE EXCEPTION 'FALHA 3: pagamento %', v_i; END IF;
    IF (start_club_payment(v_store)->>'id')::uuid <> v_pay THEN RAISE EXCEPTION 'FALHA 3b: criou um segundo pagamento aberto'; END IF;
    PERFORM report_club_payment_paid(v_pay);
    -- ainda não confirmado: nada de música
    IF (get_digital_item_access(v_item)->>'allowed')::boolean THEN RAISE EXCEPTION 'FALHA 3c: ouviu antes da loja confirmar'; END IF;
    BEGIN PERFORM resolve_club_payment(v_pay, true); RAISE EXCEPTION 'FALHA 3d: a própria pessoa confirmou o pagamento';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    BEGIN PERFORM start_club_payment(v_store); RAISE EXCEPTION 'FALHA 3e: a dona assinou o próprio clube';
    EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_hint = PG_EXCEPTION_HINT; IF v_hint <> 'own_store' THEN RAISE; END IF; END;
    -- 4) a dona confere e confirma: a pessoa vira membro pago por 30 dias
    IF (get_club_panel(v_store)->>'to_check')::int <> 1 THEN RAISE EXCEPTION 'FALHA 4: o painel não mostra o pagamento a conferir'; END IF;
    PERFORM resolve_club_payment(v_pay, true);
    PERFORM resolve_club_payment(v_pay, false);   -- repetir/contradizer depois de decidido não muda nada
    RESET ROLE;
    SELECT current_period_end INTO v_end1 FROM store_vip_members WHERE store_id = v_store AND profile_id = v_fan AND source = 'pix' AND status = 'active';
    IF v_end1 IS NULL OR v_end1 < now() + interval '29 days 23 hours' OR v_end1 > now() + interval '30 days 1 hour' THEN RAISE EXCEPTION 'FALHA 4b: período % (esperava 30 dias)', v_end1; END IF;
    IF (SELECT status FROM store_club_payments WHERE id = v_pay) <> 'confirmed' THEN RAISE EXCEPTION 'FALHA 4c: a decisão mudou depois de confirmada'; END IF;

    -- 5) a música abre (faixa avulsa e álbum), o curso e o produto misto NÃO; a biblioteca lista o álbum; quem não assinou segue sem
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_fan, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    IF NOT (get_digital_item_access(v_item)->>'allowed')::boolean OR NOT my_digital_access(v_music) THEN RAISE EXCEPTION 'FALHA 5: o membro não ouve a música'; END IF;
    IF my_digital_access(v_course) THEN RAISE EXCEPTION 'FALHA 5b: o clube de música abriu um curso'; END IF;
    IF my_digital_access(v_mix) THEN RAISE EXCEPTION 'FALHA 5c: o clube abriu produto com arquivo que não é áudio'; END IF;
    IF NOT EXISTS (SELECT 1 FROM get_my_digital_library() WHERE product_id = v_music) OR EXISTS (SELECT 1 FROM get_my_digital_library() WHERE product_id = v_course) THEN RAISE EXCEPTION 'FALHA 5d: biblioteca do clube'; END IF;
    v_i := get_club_info(v_store);
    IF v_i->'my'->>'music_ok' <> 'true' OR v_i->'my'->>'paid' <> 'true' THEN RAISE EXCEPTION 'FALHA 5e: info do membro %', v_i; END IF;
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_other, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    IF my_digital_access(v_music) THEN RAISE EXCEPTION 'FALHA 5f: quem não assinou ouve'; END IF;
    RESET ROLE;

    -- 6) renovar antes de vencer soma 30 dias ao fim do período (não perde dia); a loja pode recusar
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_fan, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    v_i := start_club_payment(v_store); v_pay2 := (v_i->>'id')::uuid;
    IF v_pay2 = v_pay THEN RAISE EXCEPTION 'FALHA 6: reaproveitou um pagamento já confirmado'; END IF;
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    PERFORM resolve_club_payment(v_pay2, true);
    RESET ROLE;
    SELECT current_period_end INTO v_end2 FROM store_vip_members WHERE store_id = v_store AND profile_id = v_fan;
    IF v_end2 < v_end1 + interval '29 days 23 hours' OR v_end2 > v_end1 + interval '30 days 1 hour' THEN RAISE EXCEPTION 'FALHA 6b: renovação %, antes %', v_end2, v_end1; END IF;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_other, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    v_pay2 := (start_club_payment(v_store)->>'id')::uuid; PERFORM report_club_payment_paid(v_pay2);
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    PERFORM resolve_club_payment(v_pay2, false);
    RESET ROLE;
    IF EXISTS (SELECT 1 FROM store_vip_members WHERE store_id = v_store AND profile_id = v_other) THEN RAISE EXCEPTION 'FALHA 6c: pagamento recusado virou membro'; END IF;

    -- 7) venceu: a música fecha e as campanhas também; quem entrou de graça antes do clube ser pago não ouve
    UPDATE store_vip_members SET current_period_end = now() - interval '1 minute' WHERE store_id = v_store AND profile_id = v_fan;
    INSERT INTO store_vip_members (store_id, profile_id, status, source) VALUES (v_store, v_free, 'active', 'free');
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_fan, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    IF my_digital_access(v_music) THEN RAISE EXCEPTION 'FALHA 7: o clube vencido ainda abre a música'; END IF;
    IF get_club_info(v_store)->'my'->>'active' <> 'false' THEN RAISE EXCEPTION 'FALHA 7b: info diz que está ativo vencido'; END IF;
    BEGIN PERFORM redeem_campaign_code(gen_random_uuid()); EXCEPTION WHEN OTHERS THEN NULL; END;   -- (campanha inexistente; o ponto é não quebrar)
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_free, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    IF my_digital_access(v_music) THEN RAISE EXCEPTION 'FALHA 7c: membro grátis antigo ouve música de clube pago'; END IF;
    IF get_club_info(v_store)->'my'->>'active' <> 'true' THEN RAISE EXCEPTION 'FALHA 7d: membro grátis perdeu o clube'; END IF;
    RESET ROLE;

    -- 8) clube GRÁTIS que inclui música: quem entrou de graça ouve; desligar "inclui música" fecha
    UPDATE stores SET vip_club_price = NULL WHERE id = v_store;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_free, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    IF NOT my_digital_access(v_music) THEN RAISE EXCEPTION 'FALHA 8: clube grátis com música não abriu'; END IF;
    RESET ROLE;
    UPDATE store_club_settings SET includes_music = false WHERE store_id = v_store;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_free, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    IF my_digital_access(v_music) THEN RAISE EXCEPTION 'FALHA 8b: música aberta com "inclui música" desligado'; END IF;
    RESET ROLE;
    UPDATE store_club_settings SET includes_music = true WHERE store_id = v_store; UPDATE stores SET vip_club_enabled = false WHERE id = v_store;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_free, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    IF my_digital_access(v_music) THEN RAISE EXCEPTION 'FALHA 8c: clube desligado ainda abre a música'; END IF;
    RESET ROLE;
    UPDATE stores SET vip_club_enabled = true WHERE id = v_store;

    -- 9) taxa do iUser: pré-pago não paga; pós-pago paga R$ 0,50 por pagamento CONFIRMADO (uma vez só, mesmo confirmando duas vezes)
    SELECT count(*) INTO v_n FROM driver_postpaid_charges WHERE type = 'club_payment_fee' AND club_payment_id IN (v_pay, v_pay2);
    IF is_postpaid_user(v_owner) THEN RAISE EXCEPTION 'FALHA 9: a dona do teste já é pós-pago (cenário inválido)'; END IF;
    IF v_n <> 0 THEN RAISE EXCEPTION 'FALHA 9a: cobrou taxa de quem não é pós-pago (% linhas)', v_n; END IF;
    INSERT INTO subscriptions (user_id, plan_id, status, source, starts_at, current_period_end) SELECT v_owner, id, 'active', 'postpaid', now() - interval '1 day', now() + interval '30 days' FROM plans WHERE code = 'pos_pago';
    IF NOT is_postpaid_user(v_owner) THEN RAISE EXCEPTION 'FALHA 9b: não consegui deixar a dona como pós-pago'; END IF;
    UPDATE store_club_payments SET status = 'reported', resolved_at = NULL WHERE id = v_pay;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated; PERFORM resolve_club_payment(v_pay, true); PERFORM resolve_club_payment(v_pay, true); RESET ROLE;
    SELECT count(*) INTO v_n FROM driver_postpaid_charges WHERE type = 'club_payment_fee' AND club_payment_id = v_pay AND amount = 0.50 AND driver_id = v_owner AND store_id = v_store;
    IF v_n <> 1 THEN RAISE EXCEPTION 'FALHA 9c: taxa do pós-pago (% linhas)', v_n; END IF;
    -- recusar não cobra
    UPDATE store_club_payments SET status = 'reported', resolved_at = NULL WHERE id = v_pay2;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated; PERFORM resolve_club_payment(v_pay2, false); RESET ROLE;
    IF EXISTS (SELECT 1 FROM driver_postpaid_charges WHERE type = 'club_payment_fee' AND club_payment_id = v_pay2) THEN RAISE EXCEPTION 'FALHA 9d: cobrou taxa de pagamento recusado'; END IF;

    -- 10) privilégios (pelo catálogo)
    IF has_function_privilege('anon', 'public.start_club_payment(uuid)', 'EXECUTE') OR has_function_privilege('anon', 'public.resolve_club_payment(uuid, boolean)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.get_club_panel(uuid)', 'EXECUTE') OR has_function_privilege('anon', 'public.set_club_settings(uuid, integer, boolean)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public._club_music_access(uuid, uuid)', 'EXECUTE') OR has_function_privilege('authenticated', 'public._digital_access(uuid, uuid)', 'EXECUTE')
       OR has_table_privilege('authenticated', 'public.store_club_payments', 'SELECT') OR has_table_privilege('anon', 'public.store_club_settings', 'SELECT') THEN
        RAISE EXCEPTION 'FALHA 10: aberto demais';
    END IF;

    RAISE EXCEPTION 'RESULT: OK (cenários do clube da loja pago + música passaram)';
END $$;
ROLLBACK;
