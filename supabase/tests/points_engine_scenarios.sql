-- Cenários do MOTOR ÚNICO DE PONTUAÇÃO (migration 20261130000051). Roda LOCAL, numa transação desfeita:
--   docker exec -i supabase_db_iuser-local psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/points_engine_scenarios.sql
BEGIN;
DO $$
DECLARE
    v_p uuid; v_a uuid; v_b uuid; v_c uuid; v_base int; v_now int; v_n int; v_store uuid; v_owner uuid; v_pts numeric; v_rolled numeric;
    v_sales numeric; v_views numeric; v_row public.profile_scores; v_st public.points_settings; v_exp numeric; v_cnt int; v_top numeric;
    v_json jsonb; v_kind text;
BEGIN
    -- escolhe uma pessoa ativa e zera o que ela tem, para medir só o que o teste faz
    SELECT id INTO v_p FROM public.profiles WHERE is_active ORDER BY id LIMIT 1;
    DELETE FROM public.profile_points_events WHERE profile_id = v_p;
    DELETE FROM public.profile_points WHERE profile_id = v_p;
    UPDATE public.point_rules SET is_active = false WHERE event = 'review_given';   -- as do catálogo ficam desligadas por padrão; o teste liga as suas

    -- 1) regra desligada não pontua
    PERFORM public._award_points(v_p, 'review_given', 'r0');
    SELECT COALESCE(total, 0) INTO v_now FROM public.profile_points WHERE profile_id = v_p;
    IF COALESCE(v_now, 0) <> 0 THEN RAISE EXCEPTION 'FALHA 1: regra desligada pontuou (%)', v_now; END IF;

    -- 2) regra ligada pontua uma vez por referência; a mesma referência não rende de novo
    UPDATE public.point_rules SET is_active = true, points = 10, daily_limit = NULL WHERE action = 'review_given';
    PERFORM public._award_points(v_p, 'review_given', 'r1');
    PERFORM public._award_points(v_p, 'review_given', 'r1');
    SELECT total INTO v_now FROM public.profile_points WHERE profile_id = v_p;
    IF v_now <> 10 THEN RAISE EXCEPTION 'FALHA 2: esperava 10, veio %', v_now; END IF;

    -- 3) "Nova tarefa": uma campanha em cima do mesmo evento SOMA com a regra normal
    INSERT INTO public.point_rules (action, label, points, is_active, sort_order, event) VALUES ('t_campanha_a', 'Campanha', 7, true, 99, 'review_given');
    PERFORM public._award_points(v_p, 'review_given', 'r2');
    SELECT total INTO v_now FROM public.profile_points WHERE profile_id = v_p;
    IF v_now <> 27 THEN RAISE EXCEPTION 'FALHA 3: esperava 27 (10 + 10 + 7), veio %', v_now; END IF;

    -- 4) limite por dia vale por regra (a campanha para; a regra normal segue)
    UPDATE public.point_rules SET daily_limit = 2 WHERE action = 't_campanha_a';
    PERFORM public._award_points(v_p, 'review_given', 'r3');   -- campanha: 2º hoje (ainda cabe) → +17
    PERFORM public._award_points(v_p, 'review_given', 'r4');   -- campanha: 3º hoje (não cabe) → só +10
    SELECT total INTO v_now FROM public.profile_points WHERE profile_id = v_p;
    IF v_now <> 27 + 17 + 10 THEN RAISE EXCEPTION 'FALHA 4: limite diário (%)', v_now; END IF;

    -- 5) limite total por pessoa
    UPDATE public.point_rules SET daily_limit = NULL, max_total = 3 WHERE action = 't_campanha_a';   -- já rendeu 3x (r2, r3 + a de r1? não: r1 foi antes) → conferido pela contagem real
    SELECT count(*) INTO v_n FROM public.profile_points_events WHERE profile_id = v_p AND action = 't_campanha_a';
    PERFORM public._award_points(v_p, 'review_given', 'r5');
    SELECT count(*) INTO v_cnt FROM public.profile_points_events WHERE profile_id = v_p AND action = 't_campanha_a';
    IF v_n >= 3 AND v_cnt <> v_n THEN RAISE EXCEPTION 'FALHA 5: passou do limite total (% → %)', v_n, v_cnt; END IF;
    IF v_n < 3 AND v_cnt <> v_n + 1 THEN RAISE EXCEPTION 'FALHA 5b: devia pontuar (% → %)', v_n, v_cnt; END IF;

    -- 6) vigência: campanha vencida ou que ainda não começou não pontua
    UPDATE public.point_rules SET max_total = NULL, starts_at = now() - interval '2 days', ends_at = now() - interval '1 day' WHERE action = 't_campanha_a';
    SELECT count(*) INTO v_n FROM public.profile_points_events WHERE profile_id = v_p AND action = 't_campanha_a';
    PERFORM public._award_points(v_p, 'review_given', 'r6');
    SELECT count(*) INTO v_cnt FROM public.profile_points_events WHERE profile_id = v_p AND action = 't_campanha_a';
    IF v_cnt <> v_n THEN RAISE EXCEPTION 'FALHA 6: campanha vencida pontuou'; END IF;
    UPDATE public.point_rules SET starts_at = now() + interval '1 day', ends_at = NULL WHERE action = 't_campanha_a';
    PERFORM public._award_points(v_p, 'review_given', 'r7');
    SELECT count(*) INTO v_cnt FROM public.profile_points_events WHERE profile_id = v_p AND action = 't_campanha_a';
    IF v_cnt <> v_n THEN RAISE EXCEPTION 'FALHA 6b: campanha futura pontuou'; END IF;

    -- 7) penalidade: pontos NEGATIVOS entram e o total pode baixar
    UPDATE public.point_rules SET starts_at = NULL, ends_at = NULL, points = -4 WHERE action = 't_campanha_a';
    SELECT total INTO v_base FROM public.profile_points WHERE profile_id = v_p;
    PERFORM public._award_points(v_p, 'review_given', 'r8');
    SELECT total INTO v_now FROM public.profile_points WHERE profile_id = v_p;
    IF v_now <> v_base + 10 - 4 THEN RAISE EXCEPTION 'FALHA 7: penalidade (% → %)', v_base, v_now; END IF;
    BEGIN UPDATE public.point_rules SET points = 100001 WHERE action = 't_campanha_a'; RAISE EXCEPTION 'FALHA 7b: aceitou pontos fora da faixa';
    EXCEPTION WHEN check_violation THEN NULL; END;

    -- 8) evento fora do catálogo não vira regra
    BEGIN INSERT INTO public.point_rules (action, label, points, event) VALUES ('t_xx', 'x', 1, 'evento_que_nao_existe'); RAISE EXCEPTION 'FALHA 8: regra de evento inexistente';
    EXCEPTION WHEN foreign_key_violation THEN NULL; END;

    -- 9) "ganhar seguidor" não rende se quem seguiu criou a conta há menos de 1 dia; "seguir" rende a quem seguiu
    SELECT id INTO v_a FROM public.profiles WHERE id <> v_p AND is_active ORDER BY id LIMIT 1;
    SELECT id INTO v_b FROM public.profiles WHERE id NOT IN (v_p, v_a) AND is_active ORDER BY id LIMIT 1;
    DELETE FROM public.follows WHERE follower_id IN (v_a, v_b) AND following_id = v_p;
    DELETE FROM public.profile_points_events WHERE profile_id = v_p;
    DELETE FROM public.profile_points WHERE profile_id = v_p;
    UPDATE public.point_rules SET is_active = true, points = 3, daily_limit = NULL WHERE action = 'follow_received';
    UPDATE public.profiles SET created_at = now() WHERE id = v_a;
    UPDATE public.profiles SET created_at = now() - interval '5 days' WHERE id = v_b;
    INSERT INTO public.follows (follower_id, following_id) VALUES (v_a, v_p);
    SELECT count(*) INTO v_n FROM public.profile_points_events WHERE profile_id = v_p AND action = 'follow_received';
    IF v_n <> 0 THEN RAISE EXCEPTION 'FALHA 9: seguidor de conta nova rendeu'; END IF;
    INSERT INTO public.follows (follower_id, following_id) VALUES (v_b, v_p);
    SELECT count(*) INTO v_n FROM public.profile_points_events WHERE profile_id = v_p AND action = 'follow_received';
    IF v_n <> 1 THEN RAISE EXCEPTION 'FALHA 9b: seguidor de conta antiga não rendeu (%)', v_n; END IF;

    -- 10) SINAIS: a pontuação da loja = peso × número; só os sinais "rolls_up" sobem para o dono
    SELECT s.id, s.owner_id INTO v_store, v_owner FROM public.stores s
     WHERE s.is_active AND EXISTS (SELECT 1 FROM public.orders o WHERE o.store_id = s.id AND o.status = 'paid') ORDER BY s.id LIMIT 1;
    UPDATE public.outdoor_rules SET is_active = false WHERE kind = 'lojas';
    UPDATE public.outdoor_rules SET is_active = true, weight = 3,    rolls_up = true  WHERE kind = 'lojas' AND signal = 'sales';
    UPDATE public.outdoor_rules SET is_active = true, weight = 0.05, rolls_up = false WHERE kind = 'lojas' AND signal = 'views';
    SELECT count(*) INTO v_sales FROM public.orders WHERE store_id = v_store AND status = 'paid';
    SELECT COALESCE(view_count, 0) INTO v_views FROM public.stores WHERE id = v_store;
    SELECT points, rolled INTO v_pts, v_rolled FROM public._outdoor_compute('lojas') WHERE id = v_store;
    IF v_pts <> 3 * v_sales + 0.05 * v_views THEN RAISE EXCEPTION 'FALHA 10: pontos da loja (% ≠ 3×% + 0,05×%)', v_pts, v_sales, v_views; END IF;
    IF v_rolled <> 3 * v_sales THEN RAISE EXCEPTION 'FALHA 10b: só a venda sobe para o dono (%)', v_rolled; END IF;

    -- 11) peso NEGATIVO (penalidade de loja) reduz a pontuação e o que sobe ao dono
    SELECT count(*) INTO v_n FROM public.orders WHERE store_id = v_store AND status = 'rejected';
    UPDATE public.outdoor_rules SET is_active = true, weight = -3, rolls_up = true WHERE kind = 'lojas' AND signal = 'rejected';
    SELECT points, rolled INTO v_pts, v_rolled FROM public._outdoor_compute('lojas') WHERE id = v_store;
    IF v_pts <> 3 * v_sales + 0.05 * v_views - 3 * v_n THEN RAISE EXCEPTION 'FALHA 11: penalidade da loja (%)', v_pts; END IF;

    -- 12) teto de unidades (max_units) vale: 'listings' conta no máximo N
    UPDATE public.outdoor_rules SET is_active = true, weight = 1, max_units = 1, rolls_up = false WHERE kind = 'lojas' AND signal = 'listings';
    SELECT count(*) INTO v_n FROM public.products WHERE store_id = v_store AND is_active AND listing_type = 'sale';
    SELECT points INTO v_pts FROM public._outdoor_compute('lojas') WHERE id = v_store;
    IF v_pts <> 3 * v_sales + 0.05 * v_views - 3 * (SELECT count(*) FROM public.orders WHERE store_id = v_store AND status = 'rejected') + LEAST(v_n, 1) THEN
        RAISE EXCEPTION 'FALHA 12: teto de unidades (%)', v_pts;
    END IF;

    -- 13) PLACAR: recalcula e confere a regra do bônus de diversidade para TODOS os perfis
    UPDATE public.points_settings SET diversity_step = 0.10, diversity_max = 0.30, diversity_max_share = 0.60, diversity_min_points = 10;
    PERFORM public.refresh_outdoor_scores();
    SELECT * INTO v_st FROM public.points_settings WHERE id;
    SELECT lojas INTO v_exp FROM public.profile_scores WHERE profile_id = v_owner;
    SELECT sum(rolled) INTO v_rolled FROM public.outdoor_scores WHERE kind = 'lojas' AND owner_id = v_owner;
    IF v_exp IS DISTINCT FROM v_rolled THEN RAISE EXCEPTION 'FALHA 13: área Lojas do dono (% ≠ %)', v_exp, v_rolled; END IF;
    FOR v_row IN SELECT * FROM public.profile_scores LOOP
        v_cnt := (SELECT count(*) FROM unnest(ARRAY[v_row.pessoa, v_row.lojas, v_row.servicos, v_row.produtos, v_row.digitais, v_row.imoveis, v_row.motoristas]) x WHERE x >= v_st.diversity_min_points);
        v_top := (SELECT max(x) FROM unnest(ARRAY[v_row.pessoa, v_row.lojas, v_row.servicos, v_row.produtos, v_row.digitais, v_row.imoveis, v_row.motoristas]) x);
        v_exp := CASE WHEN v_cnt > 1 AND v_row.raw > 0 AND v_top / v_row.raw <= v_st.diversity_max_share THEN LEAST(v_st.diversity_max, v_st.diversity_step * (v_cnt - 1)) ELSE 0 END;
        IF v_row.bonus_pct <> v_exp THEN RAISE EXCEPTION 'FALHA 13b: bônus do perfil % (% ≠ %)', v_row.profile_id, v_row.bonus_pct, v_exp; END IF;
        IF v_row.total <> round(v_row.raw * (1 + v_row.bonus_pct)) THEN RAISE EXCEPTION 'FALHA 13c: total do perfil %', v_row.profile_id; END IF;
        IF v_row.raw < 0 THEN RAISE EXCEPTION 'FALHA 13d: total negativo'; END IF;
    END LOOP;
    -- e há mesmo gente com bônus e gente sem (o teste não pode passar "vazio")
    SELECT count(*) INTO v_n FROM public.profile_scores WHERE bonus_pct > 0;
    IF v_n = 0 THEN RAISE NOTICE 'aviso: nenhum perfil com bônus nesta base (a regra foi conferida só pelo cálculo)'; END IF;

    -- 14) a chave do total novo: desligada = livro-caixa; ligada = total do Placar (Outdoor iUser, Melhores perfis, selos)
    SELECT profile_id INTO v_c FROM public.profile_scores WHERE total <> (SELECT COALESCE(total, 0) FROM public.profile_points pp WHERE pp.profile_id = profile_scores.profile_id) ORDER BY total DESC LIMIT 1;
    IF v_c IS NOT NULL THEN
        UPDATE public.points_settings SET use_total_score = false;
        SELECT points INTO v_n FROM public.get_profiles_ranking_info(ARRAY[v_c]);
        IF v_n <> COALESCE((SELECT total FROM public.profile_points WHERE profile_id = v_c), 0) THEN RAISE EXCEPTION 'FALHA 14: chave desligada deve usar o livro-caixa'; END IF;
        UPDATE public.points_settings SET use_total_score = true;
        SELECT points INTO v_n FROM public.get_profiles_ranking_info(ARRAY[v_c]);
        IF v_n <> (SELECT total FROM public.profile_scores WHERE profile_id = v_c) THEN RAISE EXCEPTION 'FALHA 14b: chave ligada deve usar o total do Placar'; END IF;
        SELECT points INTO v_n FROM public.get_best_profiles(200) WHERE id = v_c;
        IF v_n IS NOT NULL AND v_n <> (SELECT total FROM public.profile_scores WHERE profile_id = v_c) THEN RAISE EXCEPTION 'FALHA 14c: Melhores perfis'; END IF;
        UPDATE public.points_settings SET use_total_score = false;
    END IF;

    -- 15) cada Outdoor devolve do maior ao menor, sem repetir e sem tipo inválido
    FOREACH v_kind IN ARRAY ARRAY['lojas','pessoas','servicos','produtos','digitais','imoveis','motoristas'] LOOP
        SELECT count(*) INTO v_n FROM public.get_outdoor(v_kind, 50) o JOIN public.get_outdoor(v_kind, 50) o2 ON o2.rank = o.rank - 1 AND o2.points < o.points;
        IF v_n > 0 THEN RAISE EXCEPTION 'FALHA 15: % fora de ordem', v_kind; END IF;
        SELECT count(*) - count(DISTINCT id) INTO v_n FROM public.get_outdoor(v_kind, 50);
        IF v_n <> 0 THEN RAISE EXCEPTION 'FALHA 15b: % com repetido', v_kind; END IF;
    END LOOP;
    SELECT count(*) INTO v_n FROM public.get_outdoor('banana', 10);
    IF v_n <> 0 THEN RAISE EXCEPTION 'FALHA 15c: tipo inválido devolveu linhas'; END IF;
    -- motorista: só aparece com @ do veículo; digital: só produto digital ativo
    SELECT count(*) INTO v_n FROM public.get_outdoor('motoristas', 200) WHERE slug IS NULL OR slug = '';
    IF v_n <> 0 THEN RAISE EXCEPTION 'FALHA 15d: motorista sem endereço'; END IF;
    SELECT count(*) INTO v_n FROM public.get_outdoor('digitais', 200) o JOIN public.products p ON p.id = o.id WHERE p.type <> 'digital' OR NOT p.is_active;
    IF v_n <> 0 THEN RAISE EXCEPTION 'FALHA 15e: digital que não é digital ativo'; END IF;

    -- 16) o Placar devolve só números e quem não tem login não vê
    PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
    v_json := public.get_profile_scoreboard(NULL);
    IF v_json IS NULL OR (v_json->>'total') IS NULL OR (v_json->'areas'->>'lojas') IS NULL THEN RAISE EXCEPTION 'FALHA 16: placar do dono (%)', v_json; END IF;
    IF (v_json->>'use_total')::boolean THEN RAISE EXCEPTION 'FALHA 16b: a chave deveria estar desligada'; END IF;
    PERFORM set_config('request.jwt.claim.sub', '', true);
    PERFORM set_config('request.jwt.claims', '', true);
    IF public.get_profile_scoreboard(v_owner) IS NOT NULL THEN RAISE EXCEPTION 'FALHA 16c: visitante viu o placar'; END IF;

    -- 17) as tabelas novas e a recontagem não são do app: nenhum acesso para visitante nem logado
    FOREACH v_kind IN ARRAY ARRAY['points_settings','outdoor_scores','profile_scores','point_events','outdoor_rules','point_rules'] LOOP
        -- protegida = sem permissão de tabela OU com RLS ligado e nenhuma política (as antigas nasceram assim)
        IF (has_table_privilege('anon', 'public.' || v_kind, 'select') OR has_table_privilege('authenticated', 'public.' || v_kind, 'select')
            OR has_table_privilege('authenticated', 'public.' || v_kind, 'insert') OR has_table_privilege('authenticated', 'public.' || v_kind, 'update'))
           AND (NOT (SELECT relrowsecurity FROM pg_class WHERE oid = ('public.' || v_kind)::regclass)
                OR EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = v_kind)) THEN
            RAISE EXCEPTION 'FALHA 17: % está aberta ao app', v_kind;
        END IF;
    END LOOP;
    IF has_function_privilege('authenticated', 'public.refresh_outdoor_scores()', 'execute') OR has_function_privilege('anon', 'public.refresh_outdoor_scores()', 'execute') THEN RAISE EXCEPTION 'FALHA 17b: recontagem aberta ao app'; END IF;
    IF has_function_privilege('authenticated', 'public._award_points(uuid,text,text,timestamptz,boolean)', 'execute') THEN RAISE EXCEPTION 'FALHA 17c: _award_points aberta ao app'; END IF;
    IF has_function_privilege('anon', 'public.get_profile_scoreboard(uuid)', 'execute') THEN RAISE EXCEPTION 'FALHA 17d: placar aberto ao visitante'; END IF;

    RAISE NOTICE 'OK — 17 cenários do motor de pontuação passaram';
END $$;
ROLLBACK;
