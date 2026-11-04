-- Cenários dos PROGRAMAS PARA BAIXAR (migration 20261130000030). Roda LOCAL, numa transação desfeita:
--   docker exec -i supabase_db_iuser-local psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/digital_apps_scenarios.sql
BEGIN;
DO $$
DECLARE
    v_store uuid; v_owner uuid; v_user uuid; v_other uuid; v_p uuid; v_new uuid; v_old uuid; v_hint text; v_n integer; v_r record;
    v_sha text := repeat('a', 64);
BEGIN
    SELECT s.id, s.owner_id INTO v_store, v_owner FROM stores s WHERE s."storeSlug" = 'pizzaria-forno-de-ouro';
    SELECT (SELECT id FROM profiles WHERE id <> v_owner ORDER BY id OFFSET 0 LIMIT 1), (SELECT id FROM profiles WHERE id <> v_owner ORDER BY id OFFSET 1 LIMIT 1) INTO v_user, v_other;
    INSERT INTO products (name, slug, price, type, store_id, owner_id, is_active) VALUES ('Programa de teste', 'programa-teste-x', 0, 'digital', v_store, v_owner, true) RETURNING id INTO v_p;

    -- 1) o dono: sem a declaração não entra programa; extensão, plataforma e versão são conferidas
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    BEGIN INSERT INTO digital_contents (product_id, owner_id, title, kind, bucket, storage_path, platform, version) VALUES (v_p, v_owner, 'v1', 'app', 'digital-apps', v_owner || '/x/p.exe', 'windows', '1.0');
        RAISE EXCEPTION 'FALHA 1: programa entrou sem declaração';
    EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_hint = PG_EXCEPTION_HINT; IF v_hint <> 'rights_declaration_required' THEN RAISE; END IF; END;
    PERFORM declare_digital_rights(v_p);
    BEGIN INSERT INTO digital_contents (product_id, owner_id, title, kind, bucket, storage_path, platform, version) VALUES (v_p, v_owner, 'v1', 'app', 'digital-apps', v_owner || '/x/p.txt', 'windows', '1.0');
        RAISE EXCEPTION 'FALHA 1b: extensão .txt aceita como programa';
    EXCEPTION WHEN check_violation THEN NULL; END;
    BEGIN INSERT INTO digital_contents (product_id, owner_id, title, kind, bucket, storage_path, platform, version) VALUES (v_p, v_owner, 'v1', 'app', 'digital-apps', v_owner || '/x/p.exe', 'amiga', '1.0');
        RAISE EXCEPTION 'FALHA 1c: plataforma inválida aceita';
    EXCEPTION WHEN check_violation THEN NULL; END;
    BEGIN INSERT INTO digital_contents (product_id, owner_id, title, kind, bucket, storage_path, platform) VALUES (v_p, v_owner, 'v1', 'app', 'digital-apps', v_owner || '/x/p.exe', 'windows');
        RAISE EXCEPTION 'FALHA 1d: programa sem versão aceito';
    EXCEPTION WHEN check_violation THEN NULL; END;
    BEGIN INSERT INTO digital_contents (product_id, owner_id, title, kind, bucket, storage_path, platform, version, sha256) VALUES (v_p, v_owner, 'v1', 'app', 'digital-apps', v_owner || '/x/p.exe', 'windows', '1.0', 'xyz');
        RAISE EXCEPTION 'FALHA 1e: sha256 inválido aceito';
    EXCEPTION WHEN check_violation THEN NULL; END;
    BEGIN INSERT INTO digital_contents (product_id, owner_id, title, kind, external_url, platform, version) VALUES (v_p, v_owner, 'v1', 'app', 'https://x.com/p.exe', 'windows', '1.0');
        RAISE EXCEPTION 'FALHA 1f: programa só com link aceito';
    EXCEPTION WHEN check_violation THEN NULL; END;

    -- 2) duas versões do Windows e uma do Android; o contador nasce zerado e o dono não o altera
    INSERT INTO digital_contents (product_id, owner_id, title, kind, bucket, storage_path, platform, version, release_notes, sha256, size_bytes, download_count) VALUES (v_p, v_owner, 'Setup 1.0', 'app', 'digital-apps', v_owner || '/x/setup-1.0.exe', 'windows', '1.0', 'Primeira versão', v_sha, 1000, 999) RETURNING id INTO v_old;
    IF (SELECT download_count FROM digital_contents WHERE id = v_old) <> 0 THEN RAISE EXCEPTION 'FALHA 2: o dono definiu o contador'; END IF;
    INSERT INTO digital_contents (product_id, owner_id, title, kind, bucket, storage_path, platform, version, size_bytes) VALUES (v_p, v_owner, 'Setup 1.1', 'app', 'digital-apps', v_owner || '/x/setup-1.1.msi', 'windows', '1.1', 1200) RETURNING id INTO v_new;
    INSERT INTO digital_contents (product_id, owner_id, title, kind, bucket, storage_path, platform, version) VALUES (v_p, v_owner, 'App', 'app', 'digital-apps', v_owner || '/x/app.apk', 'android', '1.1');
    UPDATE digital_contents SET download_count = 500 WHERE id = v_new;
    IF (SELECT download_count FROM digital_contents WHERE id = v_new) <> 0 THEN RAISE EXCEPTION 'FALHA 2b: o dono mexeu no contador'; END IF;
    RESET ROLE;

    UPDATE digital_contents SET created_at = now() - interval '2 days' WHERE id = v_old;   -- (numa transação só, tudo nasce no mesmo instante)

    -- 3) o público vê as versões (sem caminho), a mais nova primeiro; fechadas para quem não pegou (produto grátis ainda sem direito)
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    SELECT count(*) INTO v_n FROM get_digital_app_info(v_p);
    IF v_n <> 3 THEN RAISE EXCEPTION 'FALHA 3: % versões visíveis', v_n; END IF;
    IF EXISTS (SELECT 1 FROM get_digital_app_info(v_p) WHERE unlocked) THEN RAISE EXCEPTION 'FALHA 3b: abriu sem direito'; END IF;
    IF (get_digital_item_access(v_new)->>'allowed')::boolean THEN RAISE EXCEPTION 'FALHA 3c: arquivo abriu sem direito'; END IF;
    PERFORM claim_free_digital(v_p);
    IF EXISTS (SELECT 1 FROM get_digital_app_info(v_p) WHERE NOT unlocked) THEN RAISE EXCEPTION 'FALHA 3d: versão fechada depois de pegar'; END IF;
    IF NOT (get_digital_item_access(v_new)->>'allowed')::boolean THEN RAISE EXCEPTION 'FALHA 3e: arquivo não abriu depois de pegar'; END IF;
    IF (SELECT item_id FROM get_digital_app_info(v_p) WHERE platform = 'windows' LIMIT 1) <> v_new THEN RAISE EXCEPTION 'FALHA 3f: a mais nova não veio primeiro'; END IF;
    RESET ROLE;

    -- 4) o contador (só o servidor): 1 por pessoa por dia; outra pessoa soma; chamada de quem está logado é recusada
    PERFORM set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);   -- a rota do servidor chama com a chave de serviço
    PERFORM track_digital_download(v_new, v_user);
    PERFORM track_digital_download(v_new, v_user);
    PERFORM track_digital_download(v_new, v_other);
    IF (SELECT download_count FROM digital_contents WHERE id = v_new) <> 2 THEN RAISE EXCEPTION 'FALHA 4: contador = %', (SELECT download_count FROM digital_contents WHERE id = v_new); END IF;
    -- (a função só é do servidor: confere pelo catálogo, porque chamar função sem permissão derruba o Postgres LOCAL)
    IF has_function_privilege('authenticated', 'public.track_digital_download(uuid, uuid)', 'EXECUTE') OR has_function_privilege('anon', 'public.track_digital_download(uuid, uuid)', 'EXECUTE') THEN RAISE EXCEPTION 'FALHA 4b: usuário pode contar download'; END IF;
    IF has_table_privilege('authenticated', 'public.digital_downloads', 'SELECT') OR has_table_privilege('authenticated', 'public.digital_downloads', 'INSERT') THEN RAISE EXCEPTION 'FALHA 4c: acesso direto a digital_downloads'; END IF;

    -- 5) a vitrine conta os programas
    SELECT * INTO v_r FROM get_digital_showcase(100, 'Programa de teste') LIMIT 1;
    IF v_r.apps IS DISTINCT FROM 3 THEN RAISE EXCEPTION 'FALHA 5: vitrine apps = %', v_r.apps; END IF;

    RAISE EXCEPTION 'RESULT: OK (cenários dos programas para baixar passaram)';
END $$;
ROLLBACK;
