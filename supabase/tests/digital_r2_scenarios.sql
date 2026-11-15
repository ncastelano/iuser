-- Cenários do DIGITAL PESADO NO R2 PRIVADO (migration 20261130000033). Roda LOCAL, numa transação desfeita:
--   docker exec -i supabase_db_iuser-local psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/digital_r2_scenarios.sql
BEGIN;
DO $$
DECLARE
    v_store uuid; v_owner uuid; v_user uuid; v_other uuid; v_p uuid; v_p2 uuid; v_item uuid; v_hint text; v_n integer; v_a jsonb; v_bw jsonb; v_m1 jsonb; v_m2 jsonb;
    v_key1 text; v_key2 text; v_key3 text; v_bytes bigint := 7 * 1024 * 1024;
BEGIN
    SELECT s.id, s.owner_id INTO v_store, v_owner FROM stores s WHERE s."storeSlug" = 'pizzaria-forno-de-ouro';
    SELECT (SELECT id FROM profiles WHERE id <> v_owner ORDER BY id OFFSET 0 LIMIT 1), (SELECT id FROM profiles WHERE id <> v_owner ORDER BY id OFFSET 1 LIMIT 1) INTO v_user, v_other;
    INSERT INTO products (name, slug, price, type, store_id, owner_id, is_active) VALUES ('Curso pesado de teste', 'curso-pesado-teste-x', 50, 'digital', v_store, v_owner, true) RETURNING id INTO v_p;
    INSERT INTO products (name, slug, price, type, store_id, owner_id, is_active) VALUES ('Outro curso', 'outro-curso-pesado-x', 50, 'digital', v_store, v_owner, true) RETURNING id INTO v_p2;
    v_key1 := v_owner || '/' || gen_random_uuid() || '.mp4';
    v_key2 := v_owner || '/' || gen_random_uuid() || '.exe';
    v_key3 := v_other || '/' || gen_random_uuid() || '.mp4';

    -- 0) o catálogo: o tipo existe, é do R2, nasce DESLIGADO, sem válvula, sem limpeza automática, e aceita octet-stream
    IF NOT EXISTS (SELECT 1 FROM upload_kinds WHERE kind = 'digital_heavy' AND provider = 'r2' AND bucket = 'iuser-digital' AND max_bytes = 536870912 AND owner_folder AND valve_stage IS NULL AND NOT cleanup_eligible
                   AND 'application/octet-stream' = ANY (mime_types) AND 'video/mp4' = ANY (mime_types) AND NOT ('text/html' = ANY (mime_types))) THEN RAISE EXCEPTION 'FALHA 0: catálogo do tipo digital_heavy'; END IF;
    IF (SELECT enabled FROM upload_kinds WHERE kind = 'digital_heavy') THEN RAISE EXCEPTION 'FALHA 0b: o tipo nasceu ligado'; END IF;

    -- 1) sem o arquivo registrado no R2, o item do R2 não entra (nem com a pasta certa)
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    BEGIN INSERT INTO digital_contents (product_id, owner_id, title, kind, bucket, storage_path, file_name) VALUES (v_p, v_owner, 'Aula 1', 'video', 'iuser-digital', v_key1, 'aula1.mp4');
        RAISE EXCEPTION 'FALHA 1: item do R2 entrou sem registro';
    EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_hint = PG_EXCEPTION_HINT; IF v_hint <> 'r2_asset_required' THEN RAISE; END IF; END;
    RESET ROLE;

    -- (o servidor registra os arquivos, como /api/uploads/r2/complete faria)
    INSERT INTO media_assets (owner_id, kind, provider, bucket, key, bytes, mime) VALUES (v_owner, 'digital_heavy', 'r2', 'iuser-digital', v_key1, v_bytes, 'video/mp4');
    INSERT INTO media_assets (owner_id, kind, provider, bucket, key, bytes, mime) VALUES (v_owner, 'digital_heavy', 'r2', 'iuser-digital', v_key2, v_bytes, 'application/octet-stream');
    INSERT INTO media_assets (owner_id, kind, provider, bucket, key, bytes, mime) VALUES (v_other, 'digital_heavy', 'r2', 'iuser-digital', v_key3, v_bytes, 'video/mp4');

    -- 2) com o registro da MESMA pessoa entra; arquivo de outra pessoa, chave fora do formato e arquivo repetido não
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    INSERT INTO digital_contents (product_id, owner_id, title, kind, bucket, storage_path, file_name, size_bytes, mime_type) VALUES (v_p, v_owner, 'Aula 1', 'video', 'iuser-digital', v_key1, 'aula 1 — intro.mp4', v_bytes, 'video/mp4') RETURNING id INTO v_item;
    BEGIN INSERT INTO digital_contents (product_id, owner_id, title, kind, bucket, storage_path) VALUES (v_p, v_owner, 'Roubado', 'video', 'iuser-digital', v_key3);
        RAISE EXCEPTION 'FALHA 2: arquivo registrado por outra pessoa aceito';
    EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_hint = PG_EXCEPTION_HINT; IF v_hint <> 'r2_asset_required' AND SQLSTATE <> '42501' THEN RAISE; END IF; END;
    BEGIN INSERT INTO digital_contents (product_id, owner_id, title, kind, bucket, storage_path) VALUES (v_p, v_owner, 'Cópia', 'video', 'iuser-digital', v_owner || '/' || gen_random_uuid() || '.mp4');
        RAISE EXCEPTION 'FALHA 2b: arquivo nunca registrado aceito';
    EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_hint = PG_EXCEPTION_HINT; IF v_hint <> 'r2_asset_required' THEN RAISE; END IF; END;
    BEGIN INSERT INTO digital_contents (product_id, owner_id, title, kind, bucket, storage_path) VALUES (v_p2, v_owner, 'Repetido', 'video', 'iuser-digital', v_key1);
        RAISE EXCEPTION 'FALHA 2c: o mesmo arquivo em dois itens';
    EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_hint = PG_EXCEPTION_HINT; IF v_hint <> 'r2_asset_required' THEN RAISE; END IF; END;
    BEGIN INSERT INTO digital_contents (product_id, owner_id, title, kind, bucket, storage_path) VALUES (v_p, v_owner, 'Mal formado', 'video', 'iuser-digital', v_owner || '/aula-final.mp4');
        RAISE EXCEPTION 'FALHA 2d: chave fora do formato do servidor aceita';
    EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_hint = PG_EXCEPTION_HINT; IF v_hint <> 'r2_asset_required' THEN RAISE; END IF; END;
    -- link não vai para o R2 (sem arquivo) e o item não troca de armazenamento depois
    BEGIN UPDATE digital_contents SET bucket = 'digital-files' WHERE id = v_item;
        RAISE EXCEPTION 'FALHA 2e: item saiu do R2 por UPDATE';
    EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_hint = PG_EXCEPTION_HINT; IF v_hint <> 'r2_asset_required' AND SQLSTATE <> '23514' THEN RAISE; END IF; END;
    -- renomear continua livre (não mexe no arquivo)
    UPDATE digital_contents SET title = 'Aula 1 (renomeada)' WHERE id = v_item;
    RESET ROLE;

    -- 3) programa no R2 precisa de declaração, extensão da lista e ganha o nome original
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    PERFORM declare_digital_rights(v_p);
    INSERT INTO digital_contents (product_id, owner_id, title, kind, bucket, storage_path, file_name, platform, version, size_bytes) VALUES (v_p, v_owner, '1.0 · Setup.exe', 'app', 'iuser-digital', v_key2, 'Setup 1.0.exe', 'windows', '1.0', v_bytes);
    RESET ROLE;

    -- 4) quem pagou abre; quem não tem direito, não; e a resposta traz bucket e o nome original (a rota assina no R2 privado)
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    v_a := get_digital_item_access(v_item);
    IF (v_a->>'allowed')::boolean THEN RAISE EXCEPTION 'FALHA 4: abriu sem direito'; END IF;
    RESET ROLE;
    INSERT INTO digital_claims (profile_id, product_id) VALUES (v_user, v_p);   -- (o direito que a compra ou o "pegar grátis" gravaria)
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    v_a := get_digital_item_access(v_item);
    IF NOT (v_a->>'allowed')::boolean OR v_a->>'bucket' <> 'iuser-digital' OR v_a->>'storage_path' <> v_key1 OR v_a->>'file_name' <> 'aula 1 — intro.mp4' THEN RAISE EXCEPTION 'FALHA 4b: acesso do R2 (%)', v_a; END IF;
    RESET ROLE;

    -- 5) apagar o arquivo: enquanto um item usa, o banco não libera; depois que o item sai, libera (e só o dono)
    IF release_r2_asset(v_owner, v_key1) THEN RAISE EXCEPTION 'FALHA 5: liberou arquivo em uso'; END IF;
    DELETE FROM digital_contents WHERE id = v_item;
    IF release_r2_asset(v_other, v_key1) THEN RAISE EXCEPTION 'FALHA 5b: outra pessoa liberou o arquivo'; END IF;
    IF NOT release_r2_asset(v_owner, v_key1) THEN RAISE EXCEPTION 'FALHA 5c: não liberou arquivo sem uso'; END IF;
    IF (SELECT state FROM media_assets WHERE provider = 'r2' AND key = v_key1) <> 'deleted' THEN RAISE EXCEPTION 'FALHA 5d: registro não foi marcado como apagado'; END IF;

    -- 6) a banda do Supabase não conta o R2: o download de programa no R2 sai da estimativa e entra na linha do R2
    INSERT INTO digital_downloads (item_id, profile_id) SELECT id, v_user FROM digital_contents WHERE storage_path = v_key2;
    v_bw := admin_download_bandwidth(30);
    IF (v_bw->>'r2_month_downloads')::int < 1 OR (v_bw->>'r2_month_bytes')::bigint < v_bytes THEN RAISE EXCEPTION 'FALHA 6: o R2 não aparece na linha própria (%)', v_bw; END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_bw->'items') i WHERE i->>'product_id' = v_p::text AND (i->>'size_bytes')::bigint = v_bytes) THEN RAISE EXCEPTION 'FALHA 6b: o R2 entrou na estimativa do Supabase'; END IF;
    v_m1 := _upload_valve_measure();
    DELETE FROM digital_downloads WHERE item_id IN (SELECT id FROM digital_contents WHERE storage_path = v_key2);
    v_m2 := _upload_valve_measure();
    IF (v_m1->'egress_parts'->>'downloads')::bigint <> (v_m2->'egress_parts'->>'downloads')::bigint THEN RAISE EXCEPTION 'FALHA 6c: a válvula contou o download do R2'; END IF;

    -- 7) o Meu espaço mostra o tipo novo com o uso da pessoa (só o que está pronto)
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    SELECT used_files INTO v_n FROM get_my_upload_limits() WHERE kind = 'digital_heavy';
    IF v_n IS NULL OR v_n <> 1 THEN RAISE EXCEPTION 'FALHA 7: Meu espaço do R2 (% arquivos)', v_n; END IF;
    RESET ROLE;

    -- 8) privilégios (pelo catálogo: chamar função sem permissão derruba o Postgres local)
    IF has_function_privilege('anon', 'public.digital_r2_guard()', 'EXECUTE') OR has_function_privilege('authenticated', 'public.digital_r2_guard()', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.release_r2_asset(uuid, text)', 'EXECUTE') OR has_function_privilege('anon', 'public.admin_download_bandwidth(integer)', 'EXECUTE') THEN
        RAISE EXCEPTION 'FALHA 8: função aberta demais';
    END IF;

    RAISE EXCEPTION 'RESULT: OK (cenários do digital pesado no R2 passaram)';
END $$;
ROLLBACK;
