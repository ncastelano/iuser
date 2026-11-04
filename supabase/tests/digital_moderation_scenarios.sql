-- Cenários da DENÚNCIA DE PRODUTO DIGITAL (migration 20261130000028). Roda LOCAL, numa transação desfeita:
--   docker exec -i supabase_db_iuser-local psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/digital_moderation_scenarios.sql
BEGIN;
DO $$
DECLARE
    v_store uuid; v_owner uuid; v_a uuid; v_b uuid; v_c uuid; v_buyer uuid; v_p uuid; v_item uuid; v_r text; v_err text;
BEGIN
    SELECT s.id, s.owner_id INTO v_store, v_owner FROM stores s WHERE s."storeSlug" = 'pizzaria-forno-de-ouro';
    SELECT (SELECT id FROM profiles WHERE id <> v_owner AND created_at < now() - interval '2 days' ORDER BY id OFFSET 0 LIMIT 1),
           (SELECT id FROM profiles WHERE id <> v_owner AND created_at < now() - interval '2 days' ORDER BY id OFFSET 1 LIMIT 1),
           (SELECT id FROM profiles WHERE id <> v_owner AND created_at < now() - interval '2 days' ORDER BY id OFFSET 2 LIMIT 1),
           (SELECT id FROM profiles WHERE id <> v_owner AND created_at < now() - interval '2 days' ORDER BY id OFFSET 3 LIMIT 1) INTO v_a, v_b, v_c, v_buyer;
    INSERT INTO products (name, slug, price, type, store_id, owner_id, is_active) VALUES ('Música denunciada de teste', 'musica-denunciada-teste-x', 0, 'digital', v_store, v_owner, true) RETURNING id INTO v_p;
    INSERT INTO digital_contents (product_id, owner_id, title, kind, bucket, storage_path, position) VALUES (v_p, v_owner, 'Faixa', 'audio', 'digital-music', v_owner || '/x/f.mp3', 0) RETURNING id INTO v_item;
    INSERT INTO digital_claims (profile_id, product_id) VALUES (v_buyer, v_p);

    -- 1) o dono não denuncia o que é dele; motivo/tipo inválidos são recusados
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    BEGIN PERFORM report_content('digital_product', v_p, 'copyright'); RAISE EXCEPTION 'FALHA 1: o dono denunciou o próprio produto';
    EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%não pode denunciar o que é seu%' THEN RAISE; END IF; END;
    RESET ROLE;

    -- 2) denúncias de pessoas diferentes: 1ª e 2ª só registram; a 3ª oculta
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    BEGIN PERFORM report_content('digital_product', v_p, 'xyz'); RAISE EXCEPTION 'FALHA 2: motivo inválido aceito';
    EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%Motivo inválido%' THEN RAISE; END IF; END;
    v_r := report_content('digital_product', v_p, 'copyright', 'Essa música é minha');
    IF v_r <> 'reported' THEN RAISE EXCEPTION 'FALHA 2b: 1ª denúncia deu %', v_r; END IF;
    IF report_content('digital_product', v_p, 'copyright') <> 'already' THEN RAISE EXCEPTION 'FALHA 2c: repetida não foi reconhecida'; END IF;
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    IF report_content('digital_product', v_p, 'illegal') <> 'reported' THEN RAISE EXCEPTION 'FALHA 2d'; END IF;
    RESET ROLE;
    IF NOT (SELECT is_active FROM products WHERE id = v_p) THEN RAISE EXCEPTION 'FALHA 2e: ocultou com 2 denúncias'; END IF;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_c, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    v_r := report_content('digital_product', v_p, 'copyright');
    IF v_r <> 'hidden' THEN RAISE EXCEPTION 'FALHA 2f: 3ª denúncia deu %', v_r; END IF;
    RESET ROLE;

    -- 3) oculto: o produto sai do ar, o autor é avisado e os arquivos param de ser entregues (menos ao dono)
    IF (SELECT is_active FROM products WHERE id = v_p) THEN RAISE EXCEPTION 'FALHA 3: produto continuou ativo'; END IF;
    IF NOT EXISTS (SELECT 1 FROM profile_notifications WHERE profile_id = v_owner AND kind = 'moderation_update' AND dedupe_key LIKE 'mod-h:digital_product:%') THEN RAISE EXCEPTION 'FALHA 3b: autor não foi avisado'; END IF;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_buyer, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    v_err := get_digital_item_access(v_item)::text;
    IF (get_digital_item_access(v_item)->>'allowed')::boolean OR get_digital_item_access(v_item)->>'reason' <> 'hidden' THEN RAISE EXCEPTION 'FALHA 3c: quem tinha pego ainda abre (%)', v_err; END IF;
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    IF NOT (get_digital_item_access(v_item)->>'allowed')::boolean THEN RAISE EXCEPTION 'FALHA 3d: o dono perdeu o acesso'; END IF;
    RESET ROLE;

    -- 4) o admin restaura: volta ao ar e quem tinha pego volta a abrir
    PERFORM admin_moderate('digital_product', v_p, 'restore', NULL, v_owner);
    IF NOT (SELECT is_active FROM products WHERE id = v_p) THEN RAISE EXCEPTION 'FALHA 4: não voltou ao ar'; END IF;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_buyer, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    IF NOT (get_digital_item_access(v_item)->>'allowed')::boolean THEN RAISE EXCEPTION 'FALHA 4b: não reabriu'; END IF;
    RESET ROLE;

    RAISE EXCEPTION 'RESULT: OK (cenários da denúncia de produto digital passaram)';
END $$;
ROLLBACK;
