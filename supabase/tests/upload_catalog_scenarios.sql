-- Cenários do catálogo e do registro de uploads (migration 20261130000019). Roda no banco LOCAL (e no staging), dentro de uma transação desfeita:
--   docker exec -i supabase_db_iuser-local psql -U postgres -d postgres -v ON_ERROR_STOP=1 -X < supabase/tests/upload_catalog_scenarios.sql
-- Cada cenário imprime "OK ..." ou derruba o script com a falha.
BEGIN;

-- 1) o catálogo bate com os buckets do Storage: todo bucket está num tipo, e tamanho e tipos aceitos são os mesmos (é o que impede os dois de divergirem)
DO $$
DECLARE r record; n int := 0;
BEGIN
    FOR r IN SELECT b.id, b.file_size_limit, b.allowed_mime_types FROM storage.buckets b LOOP
        IF NOT EXISTS (SELECT 1 FROM public.upload_kinds k WHERE k.bucket = r.id) THEN
            RAISE EXCEPTION 'bucket % não está no catálogo upload_kinds', r.id;
        END IF;
    END LOOP;
    FOR r IN SELECT k.kind, k.bucket, k.max_bytes, k.mime_types, b.file_size_limit, b.allowed_mime_types
             FROM public.upload_kinds k JOIN storage.buckets b ON b.id = k.bucket WHERE k.provider = 'supabase' LOOP
        IF r.file_size_limit IS DISTINCT FROM r.max_bytes THEN
            RAISE EXCEPTION 'tipo % (bucket %): catálogo diz % bytes, o bucket tem %', r.kind, r.bucket, r.max_bytes, r.file_size_limit;
        END IF;
        IF (SELECT array_agg(x ORDER BY x) FROM unnest(r.mime_types) x) IS DISTINCT FROM (SELECT array_agg(x ORDER BY x) FROM unnest(r.allowed_mime_types) x) THEN
            RAISE EXCEPTION 'tipo % (bucket %): tipos aceitos diferem entre o catálogo e o bucket', r.kind, r.bucket;
        END IF;
        n := n + 1;
    END LOOP;
    RAISE NOTICE 'OK 1: catálogo e buckets batem (% tipos)', n;
END $$;

-- 2) o app não lê nem escreve as tabelas direto; anon nem executa as funções; reconcile é só do serviço
DO $$
BEGIN
    IF has_table_privilege('authenticated', 'public.media_assets', 'SELECT') OR has_table_privilege('authenticated', 'public.upload_kinds', 'SELECT')
       OR has_table_privilege('anon', 'public.media_assets', 'SELECT') OR has_table_privilege('authenticated', 'public.media_assets', 'INSERT') THEN
        RAISE EXCEPTION 'o app não deveria ter acesso direto às tabelas';
    END IF;
    IF has_function_privilege('anon', 'public.register_media_asset(text,text)', 'EXECUTE') OR has_function_privilege('anon', 'public.my_media_usage()', 'EXECUTE') THEN
        RAISE EXCEPTION 'anon não pode executar as funções';
    END IF;
    IF has_function_privilege('authenticated', 'public.media_assets_reconcile()', 'EXECUTE') THEN RAISE EXCEPTION 'reconcile deve ser só do serviço'; END IF;
    IF NOT has_function_privilege('authenticated', 'public.register_media_asset(text,text)', 'EXECUTE') THEN RAISE EXCEPTION 'authenticated deve registrar'; END IF;
    RAISE NOTICE 'OK 2: permissões (sem acesso direto, anon fora, reconcile só do serviço)';
END $$;

-- preparo: duas pessoas e um arquivo da primeira
CREATE TEMP TABLE _t AS SELECT (SELECT id FROM public.profiles ORDER BY created_at LIMIT 1) AS a, (SELECT id FROM public.profiles ORDER BY created_at DESC LIMIT 1) AS b;
GRANT SELECT ON _t TO authenticated;
INSERT INTO storage.objects (bucket_id, name, owner_id, metadata)
SELECT 'product-images', 'tst-upload-cat/foto.jpg', a::text, '{"size": 123456, "mimetype": "image/jpeg"}'::jsonb FROM _t;

-- 3) o dono registra: bytes e tipo vêm do Storage; repetir não duplica; trocar o arquivo atualiza
DO $$
DECLARE v_a uuid; v_id1 uuid; v_id2 uuid; v_row record;
BEGIN
    SELECT a INTO v_a FROM _t;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    v_id1 := public.register_media_asset('product-images', 'tst-upload-cat/foto.jpg');
    v_id2 := public.register_media_asset('product-images', 'tst-upload-cat/foto.jpg');
    RESET ROLE;
    IF v_id1 IS NULL OR v_id1 IS DISTINCT FROM v_id2 THEN RAISE EXCEPTION 'registro deve devolver o mesmo id na repetição (% / %)', v_id1, v_id2; END IF;
    SELECT * INTO v_row FROM public.media_assets WHERE id = v_id1;
    IF v_row.kind <> 'product_photo' OR v_row.bytes <> 123456 OR v_row.mime <> 'image/jpeg' OR v_row.owner_id <> v_a OR v_row.provider <> 'supabase' OR v_row.state <> 'ready' THEN
        RAISE EXCEPTION 'registro errado: %', row_to_json(v_row);
    END IF;
    UPDATE storage.objects SET metadata = '{"size": 999, "mimetype": "image/webp"}'::jsonb WHERE bucket_id = 'product-images' AND name = 'tst-upload-cat/foto.jpg';
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    PERFORM public.register_media_asset('product-images', 'tst-upload-cat/foto.jpg');
    RESET ROLE;
    SELECT * INTO v_row FROM public.media_assets WHERE id = v_id1;
    IF v_row.bytes <> 999 OR v_row.mime <> 'image/webp' THEN RAISE EXCEPTION 'troca de arquivo não atualizou o registro: %', row_to_json(v_row); END IF;
    IF (SELECT count(*) FROM public.media_assets WHERE bucket = 'product-images' AND key = 'tst-upload-cat/foto.jpg') <> 1 THEN RAISE EXCEPTION 'duplicou o registro'; END IF;
    RAISE NOTICE 'OK 3: dono registra; bytes/tipo vêm do Storage; repetir é idempotente; troca atualiza';
END $$;

-- 4) outra pessoa NÃO registra o arquivo de alguém; sem login não registra; bucket fora do catálogo e arquivo inexistente devolvem NULL
DO $$
DECLARE v_b uuid; v_err text; v_res uuid;
BEGIN
    SELECT b INTO v_b FROM _t;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    BEGIN
        PERFORM public.register_media_asset('product-images', 'tst-upload-cat/foto.jpg');
        v_err := 'registrou o arquivo de outra pessoa';
    EXCEPTION WHEN insufficient_privilege THEN v_err := NULL;
    END;
    IF v_err IS NOT NULL THEN RESET ROLE; RAISE EXCEPTION '%', v_err; END IF;
    v_res := public.register_media_asset('bucket-que-nao-existe', 'x.jpg');
    IF v_res IS NOT NULL THEN RESET ROLE; RAISE EXCEPTION 'bucket fora do catálogo deveria devolver NULL'; END IF;
    v_res := public.register_media_asset('product-images', 'tst-upload-cat/nao-existe.jpg');
    IF v_res IS NOT NULL THEN RESET ROLE; RAISE EXCEPTION 'arquivo inexistente deveria devolver NULL'; END IF;
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', '{"role":"authenticated"}', true);   -- sem sub = sem login
    SET LOCAL ROLE authenticated;
    BEGIN
        PERFORM public.register_media_asset('product-images', 'tst-upload-cat/foto.jpg');
        v_err := 'registrou sem login';
    EXCEPTION WHEN OTHERS THEN v_err := NULL;
    END;
    RESET ROLE;
    IF v_err IS NOT NULL THEN RAISE EXCEPTION '%', v_err; END IF;
    RAISE NOTICE 'OK 4: só o dono registra; sem login, bucket desconhecido e arquivo inexistente não registram';
END $$;

-- 5) my_media_usage devolve só o que é da pessoa (esperado calculado como administrador; as duas pessoas comparadas com o que cada uma recebe)
DO $$
DECLARE
    v_a uuid; v_b uuid;
    ea_f bigint; ea_b bigint; eb_f bigint; eb_b bigint;
    ga_f bigint; ga_b bigint; gb_f bigint; gb_b bigint;
BEGIN
    SELECT a, b INTO v_a, v_b FROM _t;
    IF v_a = v_b THEN RAISE EXCEPTION 'o teste precisa de duas pessoas diferentes'; END IF;
    SELECT count(*), COALESCE(sum(bytes), 0) INTO ea_f, ea_b FROM public.media_assets WHERE owner_id = v_a AND kind = 'product_photo' AND state = 'ready';
    SELECT count(*), COALESCE(sum(bytes), 0) INTO eb_f, eb_b FROM public.media_assets WHERE owner_id = v_b AND kind = 'product_photo' AND state = 'ready';
    IF ea_f < 1 THEN RAISE EXCEPTION 'a pessoa A deveria ter ao menos o arquivo do teste'; END IF;

    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    SELECT COALESCE(sum(files), 0), COALESCE(sum(bytes), 0) INTO ga_f, ga_b FROM public.my_media_usage() WHERE kind = 'product_photo';
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    SELECT COALESCE(sum(files), 0), COALESCE(sum(bytes), 0) INTO gb_f, gb_b FROM public.my_media_usage() WHERE kind = 'product_photo';
    RESET ROLE;

    IF ga_f <> ea_f OR ga_b <> ea_b THEN RAISE EXCEPTION 'uso da pessoa A errado: recebeu %/%, esperado %/%', ga_f, ga_b, ea_f, ea_b; END IF;
    IF gb_f <> eb_f OR gb_b <> eb_b THEN RAISE EXCEPTION 'uso da pessoa B errado: recebeu %/%, esperado %/%', gb_f, gb_b, eb_f, eb_b; END IF;
    RAISE NOTICE 'OK 5: my_media_usage conta só os arquivos da própria pessoa (A: % arquivo(s), B: %)', ga_f, gb_f;
END $$;

-- 6) reconcile: o arquivo some do Storage → o registro vira 'deleted'; o que continua fica 'ready'
DO $$
DECLARE v_n int; v_state text;
BEGIN
    PERFORM set_config('storage.allow_delete_query', 'true', true);   -- o Storage proíbe DELETE direto (protege contra órfãos); só na transação do teste
    DELETE FROM storage.objects WHERE bucket_id = 'product-images' AND name = 'tst-upload-cat/foto.jpg';
    v_n := public.media_assets_reconcile();
    SELECT state INTO v_state FROM public.media_assets WHERE bucket = 'product-images' AND key = 'tst-upload-cat/foto.jpg';
    IF v_state <> 'deleted' OR v_n < 1 THEN RAISE EXCEPTION 'reconcile não marcou como apagado (estado %, % linhas)', v_state, v_n; END IF;
    IF EXISTS (SELECT 1 FROM public.media_assets m WHERE m.state = 'deleted' AND m.key <> 'tst-upload-cat/foto.jpg') THEN
        RAISE EXCEPTION 'reconcile apagou do registro algo que ainda existe no Storage';
    END IF;
    RAISE NOTICE 'OK 6: reconcile marca só o que sumiu do Storage (% marcado)', v_n;
END $$;

-- 7) o histórico foi preenchido: todo arquivo do Storage de um bucket do catálogo tem registro
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM storage.objects o JOIN public.upload_kinds k ON k.bucket = o.bucket_id
               WHERE o.name NOT LIKE '%.emptyFolderPlaceholder'
                 AND NOT EXISTS (SELECT 1 FROM public.media_assets m WHERE m.provider = k.provider AND m.bucket = o.bucket_id AND m.key = o.name)) THEN
        RAISE EXCEPTION 'há arquivo no Storage sem registro em media_assets';
    END IF;
    RAISE NOTICE 'OK 7: todo arquivo existente tem registro';
END $$;

ROLLBACK;
