-- Cenários das MISSÕES DA LOJA ligadas ao Outdoor (migration 20261130000055). Roda LOCAL, numa transação desfeita:
--   docker exec -i supabase_db_iuser-local psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/store_missions_scenarios.sql
BEGIN;
DO $$
DECLARE
    v_store uuid; v_owner uuid; v_other uuid; v_before numeric; v_after numeric; v_n int; v_json jsonb; v_pts numeric; v_rolled numeric;
    v_rolled0 numeric; v_units numeric; v_tp int; v_today date := public._mission_day(); v_err text; v_kind text; v_cnt int; v_pix text;
BEGIN
    SELECT s.id, s.owner_id INTO v_store, v_owner FROM public.stores s JOIN public.profiles p ON p.id = s.owner_id
     WHERE s.is_active AND p.is_active AND NOT COALESCE(p.is_blocked, false) AND s."storeSlug" = 'pizzaria-forno-de-ouro';
    IF v_store IS NULL THEN RAISE EXCEPTION 'cenário precisa da pizzaria do seed local'; END IF;
    SELECT id INTO v_other FROM public.profiles WHERE id <> v_owner AND is_active ORDER BY id LIMIT 1;
    DELETE FROM public.store_mission_awards WHERE store_id = v_store;

    -- 1) CADASTRO conta AO VIVO: tirar o Pix tira os pontos; devolver devolve
    SELECT units INTO v_before FROM public._store_mission_units() WHERE store_id = v_store;
    SELECT pix_key INTO v_pix FROM public.stores WHERE id = v_store;
    UPDATE public.stores SET deposit_mode = 'none', pix_key = NULL WHERE id = v_store;     -- a loja tem entrada por Pix: sem a chave o banco recusa, então a entrada sai junto (a transação é desfeita no fim)
    SELECT units INTO v_after FROM public._store_mission_units() WHERE store_id = v_store;
    IF v_before - v_after <> 10 THEN RAISE EXCEPTION 'FALHA 1: tirar o Pix devia tirar 10 pontos (% → %)', v_before, v_after; END IF;
    UPDATE public.stores SET pix_key = COALESCE(v_pix, 'chave-teste@iuser.test') WHERE id = v_store;
    SELECT units INTO v_after FROM public._store_mission_units() WHERE store_id = v_store;
    IF v_after <> v_before THEN RAISE EXCEPTION 'FALHA 1b: devolver o Pix devia devolver os pontos (% → %)', v_before, v_after; END IF;

    -- 2) modelo da loja: loja só de produtos NÃO tem a missão "agenda"; só de serviços NÃO tem "entrega"
    UPDATE public.stores SET store_model = 'products' WHERE id = v_store;
    SELECT count(*) INTO v_n FROM public._store_mission_status(v_store) WHERE code = 'age' AND applies;
    IF v_n <> 0 THEN RAISE EXCEPTION 'FALHA 2: agenda não vale para loja só de produtos'; END IF;
    UPDATE public.stores SET store_model = 'services' WHERE id = v_store;
    SELECT count(*) INTO v_n FROM public._store_mission_status(v_store) WHERE code IN ('ent', 'pedido', 'repasse') AND applies;
    IF v_n <> 0 THEN RAISE EXCEPTION 'FALHA 2b: entrega/pedido/repasse não valem para loja só de serviços (%)', v_n; END IF;
    UPDATE public.stores SET store_model = 'mixed' WHERE id = v_store;

    -- 3) MISSÃO DO DIA: publicar hoje rende o prêmio UMA vez (idempotente) e fica no livro com os pontos congelados
    SELECT COALESCE(sum(points), 0) INTO v_before FROM public.store_mission_awards WHERE store_id = v_store AND day = v_today;
    INSERT INTO public.products (name, slug, store_id, owner_id, listing_type, type, is_active, price)
         VALUES ('Publicação de teste', 'zz-pub-teste-missoes', v_store, v_owner, 'publication', 'physical', true, 0);
    PERFORM public.evaluate_store_missions(v_store);
    PERFORM public.evaluate_store_missions(v_store);
    SELECT count(*) INTO v_n FROM public.store_mission_awards WHERE store_id = v_store AND mission_code = 'publicacao' AND day = v_today;
    IF v_n <> 1 THEN RAISE EXCEPTION 'FALHA 3: devia haver 1 prêmio de publicação hoje, há %', v_n; END IF;
    UPDATE public.store_missions SET points = 50 WHERE code = 'publicacao';          -- mudar o catálogo depois NÃO muda o que já foi premiado
    SELECT points INTO v_n FROM public.store_mission_awards WHERE store_id = v_store AND mission_code = 'publicacao' AND day = v_today;
    IF v_n <> 5 THEN RAISE EXCEPTION 'FALHA 3b: os pontos do prêmio são congelados (esperava 5, veio %)', v_n; END IF;
    UPDATE public.store_missions SET points = 5 WHERE code = 'publicacao';

    -- 4) "Cadastrar novidade": produto de VENDA novo hoje (e só isso: a publicação acima não conta como novidade)
    SELECT count(*) INTO v_n FROM public.store_mission_awards WHERE store_id = v_store AND mission_code = 'novidade' AND day = v_today;
    IF v_n <> 0 THEN RAISE EXCEPTION 'FALHA 4: publicação não é novidade de catálogo'; END IF;
    INSERT INTO public.products (name, slug, store_id, owner_id, listing_type, type, is_active, price)
         VALUES ('Produto novo de teste', 'zz-prod-teste-missoes', v_store, v_owner, 'sale', 'physical', true, 10);
    PERFORM public.evaluate_store_missions(v_store);
    SELECT count(*) INTO v_n FROM public.store_mission_awards WHERE store_id = v_store AND mission_code = 'novidade' AND day = v_today;
    IF v_n <> 1 THEN RAISE EXCEPTION 'FALHA 4b: produto novo devia premiar (%)', v_n; END IF;

    -- 5) JANELA de 30 dias: prêmio de 29 dias atrás conta; de 31 dias atrás não
    DELETE FROM public.store_mission_awards WHERE store_id = v_store;
    SELECT units INTO v_before FROM public._store_mission_units() WHERE store_id = v_store;
    INSERT INTO public.store_mission_awards (store_id, mission_code, day, points) VALUES (v_store, 'conversa', v_today - 29, 3), (v_store, 'pedido', v_today - 31, 5);
    SELECT units INTO v_after FROM public._store_mission_units() WHERE store_id = v_store;
    IF v_after - v_before <> 3 THEN RAISE EXCEPTION 'FALHA 5: só o prêmio dentro de 30 dias conta (+3), veio +%', v_after - v_before; END IF;

    -- 6) LIGAÇÃO COM O OUTDOOR: os pontos entram na loja pelo sinal `missions`; peso 0 tira; desligar tira; teto limita
    SELECT t.points, t.rolled INTO v_pts, v_rolled FROM public._outdoor_compute('lojas') t WHERE t.id = v_store;
    SELECT units INTO v_units FROM public._store_mission_units() WHERE store_id = v_store;
    UPDATE public.outdoor_rules SET weight = 0 WHERE kind = 'lojas' AND signal = 'missions';
    SELECT t.points, t.rolled INTO v_after, v_rolled0 FROM public._outdoor_compute('lojas') t WHERE t.id = v_store;
    IF round(v_pts - v_after, 4) <> round(0.5 * LEAST(v_units, 400), 4) THEN
        RAISE EXCEPTION 'FALHA 6: a diferença no Outdoor devia ser peso × unidades (% → %)', v_pts, v_after;
    END IF;
    IF v_rolled <> v_rolled0 THEN RAISE EXCEPTION 'FALHA 6b: missão NÃO soma no total do dono (rolled % → %)', v_rolled, v_rolled0; END IF;
    UPDATE public.outdoor_rules SET weight = 1, max_units = 10 WHERE kind = 'lojas' AND signal = 'missions';
    SELECT t.points INTO v_before FROM public._outdoor_compute('lojas') t WHERE t.id = v_store;
    IF round(v_before - v_after, 4) <> 10 THEN RAISE EXCEPTION 'FALHA 6c: o teto de 10 unidades devia limitar a 10 pontos (veio %)', v_before - v_after; END IF;
    UPDATE public.outdoor_rules SET is_active = false WHERE kind = 'lojas' AND signal = 'missions';
    SELECT t.points INTO v_before FROM public._outdoor_compute('lojas') t WHERE t.id = v_store;
    IF v_before <> v_after THEN RAISE EXCEPTION 'FALHA 6d: regra desligada não pontua (% ≠ %)', v_before, v_after; END IF;
    UPDATE public.outdoor_rules SET is_active = true, weight = 0.5, max_units = 400 WHERE kind = 'lojas' AND signal = 'missions';

    -- 7) o refresh grava o resultado no placar guardado (o que o Outdoor lê)
    PERFORM public.refresh_outdoor_scores();
    SELECT points INTO v_pts FROM public.outdoor_scores WHERE kind = 'lojas' AND subject_id = v_store;
    SELECT t.points INTO v_after FROM public._outdoor_compute('lojas') t WHERE t.id = v_store;
    IF v_pts IS NULL OR round(v_pts, 3) <> round(v_after, 3) THEN RAISE EXCEPTION 'FALHA 7: placar guardado ≠ calculado (% ≠ %)', v_pts, v_after; END IF;

    -- 8) os OUTROS tipos de Outdoor seguem funcionando (a função de unidades foi reescrita inteira)
    FOREACH v_kind IN ARRAY ARRAY['servicos', 'produtos', 'digitais', 'imoveis', 'motoristas', 'pessoas'] LOOP
        PERFORM 1 FROM public._outdoor_compute(v_kind) LIMIT 1;
    END LOOP;

    DELETE FROM public.products WHERE slug IN ('zz-pub-teste-missoes', 'zz-prod-teste-missoes');
    -- 9) SEQUÊNCIA e leitura do DONO (get_store_missions): só o dono; devolve missões, dia, semana, sequência e o Outdoor
    DELETE FROM public.store_mission_awards WHERE store_id = v_store;
    INSERT INTO public.store_mission_awards (store_id, mission_code, day, points)
         VALUES (v_store, 'conversa', v_today - 1, 3), (v_store, 'conversa', v_today - 2, 3), (v_store, 'conversa', v_today - 3, 3), (v_store, 'conversa', v_today - 5, 3);
    PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    v_json := public.get_store_missions(v_store);
    RESET ROLE;
    SELECT COALESCE(sum(points), 0) INTO v_tp FROM public.store_mission_awards WHERE store_id = v_store AND day = v_today;   -- o que a loja de verdade já fez hoje
    IF (v_json->>'streak_days')::int <> 3 + (CASE WHEN v_tp > 0 THEN 1 ELSE 0 END) THEN RAISE EXCEPTION 'FALHA 9: sequência devia ser % (os dias -1,-2,-3; o buraco do dia -4 corta), veio %', 3 + (CASE WHEN v_tp > 0 THEN 1 ELSE 0 END), v_json->>'streak_days'; END IF;
    IF jsonb_array_length(v_json->'missions') < 10 THEN RAISE EXCEPTION 'FALHA 9b: faltam missões na resposta (%)', jsonb_array_length(v_json->'missions'); END IF;
    IF (v_json->'outdoor'->>'weight')::numeric <> 0.5 OR NOT (v_json->'outdoor'->>'active')::boolean THEN RAISE EXCEPTION 'FALHA 9c: o Outdoor devia aparecer ligado com peso 0,5 (%)', v_json->'outdoor'; END IF;
    IF (v_json->'outdoor'->>'rank')::int < 1 THEN RAISE EXCEPTION 'FALHA 9d: posição no Outdoor'; END IF;
    IF (v_json->>'week_points')::int <> 12 + v_tp THEN RAISE EXCEPTION 'FALHA 9e: a semana devia somar 12 (4 prêmios de 3, o do dia -5 ainda está dentro de 7 dias) + hoje (%), veio %', v_tp, v_json->>'week_points'; END IF;

    -- 10) QUEM NÃO É O DONO é barrado (42501)
    PERFORM set_config('request.jwt.claim.sub', v_other::text, true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_other, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    BEGIN
        PERFORM public.get_store_missions(v_store);
        v_err := 'nada';
    EXCEPTION WHEN insufficient_privilege THEN v_err := 'barrado';
    END;
    RESET ROLE;
    IF v_err <> 'barrado' THEN RAISE EXCEPTION 'FALHA 10: outra pessoa leu as missões da loja'; END IF;

    -- 11) as tabelas e as funções internas não são do app
    SELECT count(*) INTO v_cnt FROM information_schema.role_table_grants
     WHERE table_schema = 'public' AND table_name IN ('store_missions', 'store_mission_awards') AND grantee IN ('anon', 'authenticated');
    IF v_cnt <> 0 THEN RAISE EXCEPTION 'FALHA 11: tabelas de missão com acesso do app (%)', v_cnt; END IF;
    IF has_function_privilege('authenticated', 'public.evaluate_store_missions(uuid)', 'EXECUTE') THEN RAISE EXCEPTION 'FALHA 11b: evaluate aberta ao app'; END IF;
    IF has_function_privilege('authenticated', 'public._store_mission_status(uuid)', 'EXECUTE') THEN RAISE EXCEPTION 'FALHA 11c: status aberto ao app'; END IF;

    RAISE NOTICE 'OK: 11 cenários das missões da loja passaram';
END $$;
ROLLBACK;
