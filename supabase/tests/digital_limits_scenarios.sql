-- Cenários dos LIMITES DO DIGITAL por tipo, do MEU ESPAÇO e da ESTIMATIVA DE BANDA (migration 20261130000031). Roda LOCAL, numa transação desfeita:
--   docker exec -i supabase_db_iuser-local psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/digital_limits_scenarios.sql
BEGIN;
DO $$
DECLARE
    v_owner uuid; v_store uuid; v_user uuid; v_p uuid; v_app uuid; v_aud uuid; v_r jsonb; v_hint text; v_n integer; v_row record;
BEGIN
    SELECT s.id, s.owner_id INTO v_store, v_owner FROM stores s WHERE s."storeSlug" = 'pizzaria-forno-de-ouro';
    SELECT id INTO v_user FROM profiles WHERE id <> v_owner ORDER BY id LIMIT 1;

    -- 1) o catálogo: três baterias, cada uma no seu bucket, e o bucket do Storage com o mesmo limite
    FOR v_row IN SELECT * FROM (VALUES ('digital_music','digital-music',26214400::bigint,524288000::bigint), ('digital_app','digital-apps',52428800::bigint,524288000::bigint), ('digital_file','digital-files',52428800::bigint,524288000::bigint)) t(k,b,mx,pu) LOOP
        IF NOT EXISTS (SELECT 1 FROM upload_kinds WHERE kind = v_row.k AND bucket = v_row.b AND max_bytes = v_row.mx AND per_user_bytes = v_row.pu AND owner_folder) THEN RAISE EXCEPTION 'FALHA 1: catálogo de %', v_row.k; END IF;
        IF (SELECT file_size_limit FROM storage.buckets WHERE id = v_row.b) <> v_row.mx OR (SELECT public FROM storage.buckets WHERE id = v_row.b) THEN RAISE EXCEPTION 'FALHA 1b: bucket %', v_row.b; END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND cmd = 'INSERT' AND with_check LIKE '%' || v_row.b || '%' AND with_check LIKE '%_has_upload_grant%') THEN RAISE EXCEPTION 'FALHA 1c: política de envio de %', v_row.b; END IF;
    END LOOP;

    -- 2) a autorização: no limite passa, 1 byte a mais não; pasta alheia não
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    IF (authorize_upload('digital-music', v_user || '/p/faixa.mp3', 26214400, 'audio/mpeg')->>'ok')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'FALHA 2: música de 25 MB deveria passar'; END IF;
    IF authorize_upload('digital-music', v_user || '/p/faixa2.mp3', 26214401, 'audio/mpeg')->>'error' <> 'too_large' THEN RAISE EXCEPTION 'FALHA 2b: música acima de 25 MB'; END IF;
    IF (authorize_upload('digital-apps', v_user || '/p/setup.exe', 52428800, 'application/octet-stream')->>'ok')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'FALHA 2c: programa de 50 MB deveria passar'; END IF;
    IF authorize_upload('digital-apps', v_user || '/p/setup2.exe', 52428801, 'application/octet-stream')->>'error' <> 'too_large' THEN RAISE EXCEPTION 'FALHA 2d: programa acima de 50 MB'; END IF;
    IF authorize_upload('digital-apps', v_owner || '/p/setup3.exe', 1000, 'application/octet-stream')->>'ok' = 'true' THEN RAISE EXCEPTION 'FALHA 2e: aceitou pasta de outra pessoa'; END IF;
    RESET ROLE;

    PERFORM set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);   -- (a partir daqui o preparo é do servidor)
    -- 3) o produto: áudio novo só no bucket de música; programa só no de programas; o resto em digital-files
    INSERT INTO products (name, slug, price, type, store_id, owner_id, is_active) VALUES ('Limites de teste', 'limites-teste-x', 0, 'digital', v_store, v_owner, true) RETURNING id INTO v_p;
    BEGIN INSERT INTO digital_contents (product_id, owner_id, title, kind, storage_path, bucket) VALUES (v_p, v_owner, 'Faixa', 'audio', v_owner || '/x/f.mp3', 'digital-files');
        RAISE EXCEPTION 'FALHA 3: áudio novo aceito em digital-files';
    EXCEPTION WHEN check_violation THEN NULL; END;
    BEGIN INSERT INTO digital_contents (product_id, owner_id, title, kind, storage_path, bucket, platform, version) VALUES (v_p, v_owner, 'App', 'app', v_owner || '/x/a.exe', 'digital-music', 'windows', '1');
        RAISE EXCEPTION 'FALHA 3b: programa aceito no bucket de música';
    EXCEPTION WHEN check_violation THEN NULL; END;
    BEGIN INSERT INTO digital_contents (product_id, owner_id, title, kind, storage_path, bucket) VALUES (v_p, v_owner, 'PDF', 'document', v_owner || '/x/a.pdf', 'digital-music');
        RAISE EXCEPTION 'FALHA 3c: documento aceito no bucket de música';
    EXCEPTION WHEN check_violation THEN NULL; END;
    INSERT INTO digital_contents (product_id, owner_id, title, kind, storage_path, bucket) VALUES (v_p, v_owner, 'Faixa', 'audio', v_owner || '/x/f.mp3', 'digital-music') RETURNING id INTO v_aud;
    INSERT INTO digital_contents (product_id, owner_id, title, kind, storage_path, bucket, platform, version, size_bytes) VALUES (v_p, v_owner, 'App', 'app', v_owner || '/x/a.exe', 'digital-apps', 'windows', '1', 40000000) RETURNING id INTO v_app;
    INSERT INTO digital_contents (product_id, owner_id, title, kind, external_url) VALUES (v_p, v_owner, 'Link', 'link', 'https://exemplo.com/a');
    IF get_digital_item_access(v_aud) IS NULL THEN RAISE EXCEPTION 'FALHA 3d'; END IF;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    IF get_digital_item_access(v_aud)->>'bucket' <> 'digital-music' OR get_digital_item_access(v_app)->>'bucket' <> 'digital-apps' THEN RAISE EXCEPTION 'FALHA 3e: o acesso não devolveu o bucket'; END IF;
    RESET ROLE;

    -- 4) MEU ESPAÇO: o que a pessoa já usou aparece por tipo (total e nas últimas 24 h); sem login não vem nada
    INSERT INTO media_assets (owner_id, kind, provider, bucket, key, bytes, mime) VALUES
        (v_user, 'digital_music', 'supabase', 'digital-music', v_user || '/zz/a.mp3', 3000000, 'audio/mpeg'),
        (v_user, 'digital_music', 'supabase', 'digital-music', v_user || '/zz/b.mp3', 2000000, 'audio/mpeg');
    INSERT INTO media_assets (owner_id, kind, provider, bucket, key, bytes, mime, created_at) VALUES (v_user, 'digital_music', 'supabase', 'digital-music', v_user || '/zz/velha.mp3', 1000000, 'audio/mpeg', now() - interval '3 days');
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    SELECT * INTO v_row FROM get_my_upload_limits() WHERE kind = 'digital_music';
    IF v_row.used_bytes <> 6000000 OR v_row.used_files <> 3 OR v_row.used_day_bytes <> 5000000 OR v_row.max_bytes <> 26214400 OR v_row.per_user_bytes <> 524288000 THEN RAISE EXCEPTION 'FALHA 4: meu espaço = %', v_row; END IF;
    SELECT count(*) INTO v_n FROM get_my_upload_limits() WHERE kind = 'digital_app' AND used_bytes = 0;
    IF v_n <> 1 THEN RAISE EXCEPTION 'FALHA 4b: tipo sem uso não apareceu zerado'; END IF;
    RESET ROLE;
    IF has_function_privilege('anon', 'public.get_my_upload_limits()', 'EXECUTE') THEN RAISE EXCEPTION 'FALHA 4c: visitante pode ver limites'; END IF;   -- (pelo catálogo: chamar função sem permissão derruba o Postgres LOCAL)

    -- 5) ESTIMATIVA DE BANDA (só o servidor): tamanho × downloads; ninguém logado a chama (conferido pelo catálogo)
    IF has_function_privilege('authenticated', 'public.admin_download_bandwidth(integer)', 'EXECUTE') OR has_function_privilege('anon', 'public.admin_download_bandwidth(integer)', 'EXECUTE') THEN RAISE EXCEPTION 'FALHA 5: usuário pode ver a banda'; END IF;
    PERFORM set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
    PERFORM track_digital_download(v_app, v_user);
    PERFORM track_digital_download(v_app, v_owner);
    PERFORM track_digital_download(v_app, v_owner);   -- mesmo dia: não conta de novo
    v_r := admin_download_bandwidth(30);
    IF (v_r->>'downloads')::int < 2 OR (v_r->>'est_bytes')::bigint < 80000000 THEN RAISE EXCEPTION 'FALHA 5b: banda = %', v_r; END IF;
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_r->'items') i WHERE i->>'item_id' = v_app::text AND (i->>'downloads')::int = 2 AND (i->>'est_bytes')::bigint = 80000000) THEN RAISE EXCEPTION 'FALHA 5c: item da banda'; END IF;
    IF (v_r->>'month_projection_bytes')::bigint < (v_r->>'month_est_bytes')::bigint THEN RAISE EXCEPTION 'FALHA 5d: a projeção do mês ficou menor que o já gasto'; END IF;

    RAISE EXCEPTION 'RESULT: OK (cenários dos limites do digital passaram)';
END $$;
ROLLBACK;
