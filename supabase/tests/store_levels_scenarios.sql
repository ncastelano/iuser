-- Cenários dos NÍVEIS DE LOJA (migration 20261130000056). Roda LOCAL, numa transação desfeita:
--   docker exec -i supabase_db_iuser-local psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/store_levels_scenarios.sql
BEGIN;
DO $$
DECLARE
    v_store uuid; v_owner uuid; v_lvl int; v_bs timestamptz; v_n int; v_json jsonb; v_cnt int;
BEGIN
    SELECT s.id, s.owner_id INTO v_store, v_owner FROM public.stores s WHERE s."storeSlug" = 'pizzaria-forno-de-ouro';
    IF v_store IS NULL THEN RAISE EXCEPTION 'cenário precisa da pizzaria do seed local'; END IF;
    INSERT INTO public.outdoor_scores (kind, subject_id, owner_id, points) VALUES ('lojas', v_store, v_owner, 0)
        ON CONFLICT (kind, subject_id) DO UPDATE SET points = 0;
    UPDATE public.store_level_settings SET enabled = true, drop_after_days = 7;

    -- 1) SOBE NA HORA: pontos de Lenda → nível 4 (de qualquer nível anterior), relógio de descida zerado
    DELETE FROM public.store_level_state WHERE store_id = v_store;
    UPDATE public.outdoor_scores SET points = 100 WHERE kind = 'lojas' AND subject_id = v_store;
    PERFORM public.refresh_store_levels();
    SELECT level INTO v_lvl FROM public.store_level_state WHERE store_id = v_store;
    IF v_lvl <> 1 THEN RAISE EXCEPTION 'FALHA 1: loja nova com 100 pontos entra no nível 1 (veio %)', v_lvl; END IF;
    UPDATE public.outdoor_scores SET points = 4000 WHERE kind = 'lojas' AND subject_id = v_store;
    PERFORM public.refresh_store_levels();
    SELECT level, below_since INTO v_lvl, v_bs FROM public.store_level_state WHERE store_id = v_store;
    IF v_lvl <> 4 OR v_bs IS NOT NULL THEN RAISE EXCEPTION 'FALHA 1b: com 4.000 pontos a loja sobe na hora (nível %, relógio %)', v_lvl, v_bs; END IF;
    SELECT store_level INTO v_n FROM public.stores WHERE id = v_store;
    IF v_n <> 4 THEN RAISE EXCEPTION 'FALHA 1c: a vista pública devia mostrar 4 (veio %)', v_n; END IF;

    -- 2) DESCE com PACIÊNCIA: abaixo da linha, o relógio começa; antes de 7 dias NADA muda
    UPDATE public.outdoor_scores SET points = 200 WHERE kind = 'lojas' AND subject_id = v_store;    -- alvo = nível 1
    PERFORM public.refresh_store_levels();
    SELECT level, below_since INTO v_lvl, v_bs FROM public.store_level_state WHERE store_id = v_store;
    IF v_lvl <> 4 OR v_bs IS NULL THEN RAISE EXCEPTION 'FALHA 2: o 1º dia abaixo só liga o relógio (nível %, relógio %)', v_lvl, v_bs; END IF;
    UPDATE public.store_level_state SET below_since = now() - interval '6 days 23 hours' WHERE store_id = v_store;
    PERFORM public.refresh_store_levels();
    SELECT level INTO v_lvl FROM public.store_level_state WHERE store_id = v_store;
    IF v_lvl <> 4 THEN RAISE EXCEPTION 'FALHA 2b: com 6 dias e 23 h ainda não desce (veio %)', v_lvl; END IF;

    -- 3) passados 7 dias desce SÓ UM degrau e o relógio recomeça (não despenca de uma vez)
    UPDATE public.store_level_state SET below_since = now() - interval '7 days 1 hour' WHERE store_id = v_store;
    PERFORM public.refresh_store_levels();
    SELECT level, below_since INTO v_lvl, v_bs FROM public.store_level_state WHERE store_id = v_store;
    IF v_lvl <> 3 THEN RAISE EXCEPTION 'FALHA 3: devia descer UM degrau (4 → 3), veio %', v_lvl; END IF;
    IF v_bs < now() - interval '1 minute' THEN RAISE EXCEPTION 'FALHA 3b: o relógio devia recomeçar depois de descer (%)', v_bs; END IF;
    PERFORM public.refresh_store_levels();
    SELECT level INTO v_lvl FROM public.store_level_state WHERE store_id = v_store;
    IF v_lvl <> 3 THEN RAISE EXCEPTION 'FALHA 3c: não desce de novo logo em seguida (veio %)', v_lvl; END IF;

    -- 4) voltou a ficar em dia com o nível: o relógio zera
    UPDATE public.outdoor_scores SET points = 1500 WHERE kind = 'lojas' AND subject_id = v_store;   -- alvo = 3 = nível atual
    PERFORM public.refresh_store_levels();
    SELECT level, below_since INTO v_lvl, v_bs FROM public.store_level_state WHERE store_id = v_store;
    IF v_lvl <> 3 OR v_bs IS NOT NULL THEN RAISE EXCEPTION 'FALHA 4: com os pontos de volta o relógio zera (nível %, relógio %)', v_lvl, v_bs; END IF;

    -- 5) até o mínimo: sem pontos nenhum a loja chega ao 0 (degrau por degrau)
    UPDATE public.outdoor_scores SET points = 0 WHERE kind = 'lojas' AND subject_id = v_store;
    FOR i IN 1..4 LOOP
        PERFORM public.refresh_store_levels();
        UPDATE public.store_level_state SET below_since = now() - interval '8 days' WHERE store_id = v_store AND below_since IS NOT NULL;
        PERFORM public.refresh_store_levels();
    END LOOP;
    SELECT level INTO v_lvl FROM public.store_level_state WHERE store_id = v_store;
    IF v_lvl <> 0 THEN RAISE EXCEPTION 'FALHA 5: sem pontos a loja devia chegar ao nível 0 (veio %)', v_lvl; END IF;

    -- 6) dona bloqueada / loja inativa / regra desligada: a vista pública vai a 0, o estado guardado NÃO se perde
    UPDATE public.outdoor_scores SET points = 1500 WHERE kind = 'lojas' AND subject_id = v_store;
    PERFORM public.refresh_store_levels();
    SELECT store_level INTO v_n FROM public.stores WHERE id = v_store;
    IF v_n <> 3 THEN RAISE EXCEPTION 'FALHA 6: antes de bloquear, nível 3 (veio %)', v_n; END IF;
    UPDATE public.profiles SET is_blocked = true WHERE id = v_owner;
    PERFORM public.refresh_store_levels();
    SELECT store_level INTO v_n FROM public.stores WHERE id = v_store;
    SELECT level INTO v_lvl FROM public.store_level_state WHERE store_id = v_store;
    IF v_n <> 0 OR v_lvl <> 3 THEN RAISE EXCEPTION 'FALHA 6b: dona bloqueada = 0 na vista e 3 guardado (vista %, guardado %)', v_n, v_lvl; END IF;
    UPDATE public.profiles SET is_blocked = false WHERE id = v_owner;
    UPDATE public.store_level_settings SET enabled = false;
    PERFORM public.refresh_store_levels();
    SELECT store_level INTO v_n FROM public.stores WHERE id = v_store;
    IF v_n <> 0 THEN RAISE EXCEPTION 'FALHA 6c: regra desligada = 0 na vista (veio %)', v_n; END IF;
    UPDATE public.store_level_settings SET enabled = true;
    PERFORM public.refresh_store_levels();
    SELECT store_level INTO v_n FROM public.stores WHERE id = v_store;
    IF v_n <> 3 THEN RAISE EXCEPTION 'FALHA 6d: religada, volta ao 3 (veio %)', v_n; END IF;

    -- 7) a escada é editável: mudar o mínimo muda o alvo na hora
    UPDATE public.store_levels SET min_points = 2000 WHERE level = 3;       -- a loja (1.500) cai para o alvo 2; a descida segue a paciência
    PERFORM public.refresh_store_levels();
    SELECT level, below_since INTO v_lvl, v_bs FROM public.store_level_state WHERE store_id = v_store;
    IF v_lvl <> 3 OR v_bs IS NULL THEN RAISE EXCEPTION 'FALHA 7: subir a linha do nível 3 liga o relógio de descida (nível %, relógio %)', v_lvl, v_bs; END IF;
    UPDATE public.store_levels SET min_points = 1500 WHERE level = 3;

    -- 8) get_outdoor devolve o nível; pessoas e os outros tipos devolvem 0 e continuam funcionando
    UPDATE public.outdoor_scores SET points = 4000 WHERE kind = 'lojas' AND subject_id = v_store;
    PERFORM public.refresh_store_levels();
    SELECT level INTO v_lvl FROM public.get_outdoor('lojas', 200) WHERE id = v_store;
    IF v_lvl <> 4 THEN RAISE EXCEPTION 'FALHA 8: get_outdoor devia dizer nível 4 (veio %)', v_lvl; END IF;
    SELECT count(*) INTO v_cnt FROM public.get_outdoor('pessoas', 5) WHERE level <> 0;
    IF v_cnt <> 0 THEN RAISE EXCEPTION 'FALHA 8b: pessoas não têm nível de loja'; END IF;

    -- 9) PRIVACIDADE/ESCRITA: o app lê a coluna, mas ninguém a grava; estado e regra não são do app
    IF NOT has_column_privilege('anon', 'public.stores', 'store_level', 'SELECT') THEN RAISE EXCEPTION 'FALHA 9: anon devia ler o nível'; END IF;
    IF has_column_privilege('authenticated', 'public.stores', 'store_level', 'UPDATE') OR has_column_privilege('authenticated', 'public.stores', 'store_level', 'INSERT') THEN
        RAISE EXCEPTION 'FALHA 9b: o app NÃO pode gravar store_level';
    END IF;
    IF has_table_privilege('authenticated', 'public.store_level_state', 'SELECT') OR has_table_privilege('anon', 'public.store_level_settings', 'SELECT') THEN
        RAISE EXCEPTION 'FALHA 9c: estado e regra de nível não são do app';
    END IF;
    IF has_function_privilege('authenticated', 'public.refresh_store_levels()', 'EXECUTE') THEN RAISE EXCEPTION 'FALHA 9d: refresh_store_levels aberta ao app'; END IF;
    IF NOT has_table_privilege('anon', 'public.store_levels', 'SELECT') THEN RAISE EXCEPTION 'FALHA 9e: a escada é pública'; END IF;
    IF has_table_privilege('authenticated', 'public.store_levels', 'INSERT') OR has_table_privilege('authenticated', 'public.store_levels', 'UPDATE') THEN
        RAISE EXCEPTION 'FALHA 9f: ninguém do app edita a escada';
    END IF;

    -- 10) o DONO vê o nível, os pontos e o que falta para o próximo (get_store_missions)
    UPDATE public.outdoor_scores SET points = 1700 WHERE kind = 'lojas' AND subject_id = v_store;
    UPDATE public.store_level_state SET level = 3, below_since = NULL WHERE store_id = v_store;
    UPDATE public.stores SET store_level = 3 WHERE id = v_store;
    PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    v_json := public.get_store_missions(v_store);
    RESET ROLE;
    IF (v_json->'level'->>'level')::int <> 3 OR v_json->'level'->>'name' <> 'Estrela' OR v_json->'level'->>'next_name' <> 'Lenda' OR (v_json->'level'->>'next_min')::int <> 4000 OR (v_json->'level'->>'points')::int <> 1700 THEN
        RAISE EXCEPTION 'FALHA 10: bloco level da resposta (%)', v_json->'level';
    END IF;

    RAISE NOTICE 'OK: 10 grupos de cenários dos níveis de loja passaram';
END $$;
ROLLBACK;
