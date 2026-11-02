-- Cenários das PROMOÇÕES (combos) da loja. Roda LOCAL, numa transação desfeita:
--   docker exec -i supabase_db_iuser-local psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/promotions_scenarios.sql
BEGIN;
DO $$
DECLARE
    v_store uuid; v_owner uuid; v_stranger uuid; v_a uuid; v_b uuid; v_digital uuid; v_combo uuid; v_total numeric; v_err text;
BEGIN
    SELECT s.id, s.owner_id INTO v_store, v_owner FROM stores s WHERE s."storeSlug" = 'pizzaria-forno-de-ouro';
    SELECT id INTO v_stranger FROM profiles WHERE id <> v_owner LIMIT 1;
    SELECT id INTO v_a FROM products WHERE store_id = v_store AND type = 'physical' AND NOT is_combo AND is_active ORDER BY price DESC LIMIT 1;
    SELECT id INTO v_b FROM products WHERE store_id = v_store AND type = 'physical' AND NOT is_combo AND is_active AND id <> v_a ORDER BY price LIMIT 1;
    SELECT id INTO v_digital FROM products WHERE store_id = v_store AND type = 'digital' LIMIT 1;
    SELECT (SELECT price FROM products WHERE id = v_a) * 1 + (SELECT price FROM products WHERE id = v_b) * 2 INTO v_total;

    PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;

    -- 1) o dono monta um combo: soma, desconto e itens saem do banco
    v_combo := save_store_combo(v_store, NULL, 'Combo de teste', 'sem cebola', round(v_total * 0.8, 2),
        jsonb_build_array(jsonb_build_object('product_id', v_a, 'quantity', 1), jsonb_build_object('product_id', v_b, 'quantity', 2)));
    IF (SELECT compare_at_price FROM products WHERE id = v_combo) <> v_total THEN RAISE EXCEPTION 'FALHA 1: soma do combo'; END IF;
    IF (SELECT count(*) FROM product_bundle_items WHERE combo_id = v_combo) <> 2 THEN RAISE EXCEPTION 'FALHA 1b: itens do combo'; END IF;
    IF NOT (SELECT is_combo AND category = 'Promoções' AND type = 'physical' FROM products WHERE id = v_combo) THEN RAISE EXCEPTION 'FALHA 1c: marcador'; END IF;
    IF (SELECT description FROM products WHERE id = v_combo) NOT LIKE 'Inclui: 1× %' THEN RAISE EXCEPTION 'FALHA 1d: descrição'; END IF;

    -- 2) valor acima da soma é recusado
    BEGIN PERFORM save_store_combo(v_store, NULL, 'Combo caro', NULL, v_total + 1, jsonb_build_array(jsonb_build_object('product_id', v_a, 'quantity', 1), jsonb_build_object('product_id', v_b, 'quantity', 2)));
        RAISE EXCEPTION 'FALHA 2: aceitou valor acima da soma';
    EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_err = PG_EXCEPTION_HINT; IF v_err <> 'combo_price_above_total' THEN RAISE; END IF; END;

    -- 3) item digital / sem itens / item de outra loja recusados
    BEGIN PERFORM save_store_combo(v_store, NULL, 'Combo digital', NULL, 10, jsonb_build_array(jsonb_build_object('product_id', v_digital, 'quantity', 1)));
        RAISE EXCEPTION 'FALHA 3: aceitou item digital';
    EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_err = PG_EXCEPTION_HINT; IF v_err <> 'combo_item_invalid' THEN RAISE; END IF; END;
    BEGIN PERFORM save_store_combo(v_store, NULL, 'Combo vazio', NULL, 10, '[]'::jsonb);
        RAISE EXCEPTION 'FALHA 3b: aceitou combo vazio';
    EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_err = PG_EXCEPTION_HINT; IF v_err <> 'combo_items_required' THEN RAISE; END IF; END;

    -- 4) o dono não grava o marcador nem o "de" direto; o preço do combo não passa da soma
    BEGIN UPDATE products SET compare_at_price = 99999 WHERE id = v_combo; RAISE EXCEPTION 'FALHA 4: mexeu no "de" direto';
    EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_err = PG_EXCEPTION_HINT; IF v_err <> 'combo_total_locked' THEN RAISE; END IF; END;
    BEGIN UPDATE products SET is_combo = false WHERE id = v_combo; RAISE EXCEPTION 'FALHA 4b: desmarcou o combo direto';
    EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_err = PG_EXCEPTION_HINT; IF v_err <> 'combo_flag_locked' THEN RAISE; END IF; END;
    BEGIN UPDATE products SET price = v_total + 5 WHERE id = v_combo; RAISE EXCEPTION 'FALHA 4c: preço acima da soma';
    EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_err = PG_EXCEPTION_HINT; IF v_err <> 'combo_price_above_total' THEN RAISE; END IF; END;

    -- 5) produto novo criado direto nunca nasce combo
    INSERT INTO products (name, slug, price, type, store_id, owner_id, is_combo, compare_at_price) VALUES ('Fake', 'fake-' || md5(random()::text), 10, 'physical', v_store, v_owner, true, 50);
    IF EXISTS (SELECT 1 FROM products WHERE name = 'Fake' AND store_id = v_store AND (is_combo OR compare_at_price IS NOT NULL)) THEN RAISE EXCEPTION 'FALHA 5: nasceu combo direto'; END IF;

    -- 6) editar troca os itens sem desativar; a soma acompanha o preço do item
    PERFORM save_store_combo(v_store, v_combo, 'Combo de teste 2', NULL, round(v_total * 0.5, 2), jsonb_build_array(jsonb_build_object('product_id', v_a, 'quantity', 1), jsonb_build_object('product_id', v_b, 'quantity', 2)));
    IF NOT (SELECT is_active FROM products WHERE id = v_combo) THEN RAISE EXCEPTION 'FALHA 6: editar desativou o combo'; END IF;
    UPDATE products SET price = price + 10 WHERE id = v_a;
    IF (SELECT compare_at_price FROM products WHERE id = v_combo) <> v_total + 10 THEN RAISE EXCEPTION 'FALHA 6b: soma não acompanhou o preço do item'; END IF;

    -- 6b) foto do combo: enviada pela loja = cartão com a foto de fundo; sem ela = fotos dos itens juntas
    IF (SELECT combo_image_uploaded FROM products WHERE id = v_combo) THEN RAISE EXCEPTION 'FALHA 6b: sem foto enviada não pode estar marcado'; END IF;
    PERFORM save_store_combo(v_store, v_combo, 'Combo de teste 2', NULL, round(v_total * 0.5, 2), jsonb_build_array(jsonb_build_object('product_id', v_a, 'quantity', 1), jsonb_build_object('product_id', v_b, 'quantity', 2)), 'combo-foto-teste.jpg', false);
    IF NOT (SELECT combo_image_uploaded AND image_url = 'combo-foto-teste.jpg' FROM products WHERE id = v_combo) THEN RAISE EXCEPTION 'FALHA 6c: foto enviada não gravou'; END IF;
    PERFORM save_store_combo(v_store, v_combo, 'Combo de teste 3', NULL, round(v_total * 0.5, 2), jsonb_build_array(jsonb_build_object('product_id', v_a, 'quantity', 1), jsonb_build_object('product_id', v_b, 'quantity', 2)));
    IF NOT (SELECT combo_image_uploaded AND image_url = 'combo-foto-teste.jpg' FROM products WHERE id = v_combo) THEN RAISE EXCEPTION 'FALHA 6d: editar sem foto nova perdeu a foto enviada'; END IF;
    BEGIN PERFORM save_store_combo(v_store, v_combo, 'Combo de teste 3', NULL, 10, jsonb_build_array(jsonb_build_object('product_id', v_a, 'quantity', 1)), 'http://x.com/a.jpg', false);
        RAISE EXCEPTION 'FALHA 6e: aceitou link externo como foto';
    EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_err = PG_EXCEPTION_HINT; IF v_err <> 'combo_image_invalid' THEN RAISE; END IF; END;
    BEGIN PERFORM save_store_combo(v_store, v_combo, 'Combo de teste 3', NULL, 10, jsonb_build_array(jsonb_build_object('product_id', v_a, 'quantity', 1)), '../outro.jpg', false);
        RAISE EXCEPTION 'FALHA 6f: aceitou caminho com ..';
    EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_err = PG_EXCEPTION_HINT; IF v_err <> 'combo_image_invalid' THEN RAISE; END IF; END;
    PERFORM save_store_combo(v_store, v_combo, 'Combo de teste 3', NULL, round(v_total * 0.5, 2), jsonb_build_array(jsonb_build_object('product_id', v_a, 'quantity', 1), jsonb_build_object('product_id', v_b, 'quantity', 2)), NULL, true);
    IF (SELECT combo_image_uploaded FROM products WHERE id = v_combo) THEN RAISE EXCEPTION 'FALHA 6g: tirar a foto não desmarcou'; END IF;
    UPDATE products SET image_url = 'foto-pela-edicao.jpg' WHERE id = v_combo;
    IF NOT (SELECT combo_image_uploaded FROM products WHERE id = v_combo) THEN RAISE EXCEPTION 'FALHA 6h: trocar a foto pela edição do produto devia valer como foto da loja'; END IF;
    UPDATE products SET combo_image_uploaded = false WHERE id = v_combo;
    IF NOT (SELECT combo_image_uploaded FROM products WHERE id = v_combo) THEN RAISE EXCEPTION 'FALHA 6i: o app desmarcou a foto enviada direto'; END IF;

    -- 7) estranho não monta combo na loja dos outros
    PERFORM set_config('request.jwt.claim.sub', v_stranger::text, true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_stranger, 'role', 'authenticated')::text, true);
    BEGIN PERFORM save_store_combo(v_store, NULL, 'Invasor', NULL, 10, jsonb_build_array(jsonb_build_object('product_id', v_a, 'quantity', 1)));
        RAISE EXCEPTION 'FALHA 7: estranho montou combo';
    EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_err = PG_EXCEPTION_HINT; IF v_err <> 'not_store_owner' THEN RAISE; END IF; END;

    -- 8) a vitrine pública lista o combo (visitante e logado) e o item removido tira o combo do ar
    RESET ROLE;
    IF NOT EXISTS (SELECT 1 FROM get_store_promotions(50) WHERE id = v_combo AND discount_pct > 0) THEN RAISE EXCEPTION 'FALHA 8: vitrine não lista o combo'; END IF;
    IF NOT EXISTS (SELECT 1 FROM get_store_promotions(50) WHERE id = v_combo AND combo_image_uploaded AND jsonb_array_length(items) = 2) THEN RAISE EXCEPTION 'FALHA 8b: vitrine sem a marca da foto e os itens'; END IF;
    DELETE FROM products WHERE id = v_b;
    IF (SELECT is_active FROM products WHERE id = v_combo) THEN RAISE EXCEPTION 'FALHA 9: combo continuou no ar sem um item'; END IF;

    RAISE NOTICE 'OK: cenários de promoções (inclui a foto do combo) passaram';
END $$;
ROLLBACK;
