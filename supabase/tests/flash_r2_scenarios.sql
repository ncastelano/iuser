-- Cenários do Flash com vídeo no R2 (migration 20261130000024). Banco LOCAL (e staging), transação desfeita no final:
--   docker exec -i supabase_db_iuser-local psql -U postgres -d postgres -v ON_ERROR_STOP=1 -X < supabase/tests/flash_r2_scenarios.sql
BEGIN;

CREATE TEMP TABLE _t AS SELECT (SELECT id FROM public.profiles ORDER BY created_at LIMIT 1) AS a, (SELECT id FROM public.profiles ORDER BY created_at DESC LIMIT 1) AS b;
GRANT SELECT ON _t TO authenticated;

-- posta como a pessoa (papel authenticated + JWT); devolve 'ok' ou o HINT/mensagem do erro
CREATE FUNCTION pg_temp.post(p_uid uuid, p_content text, p_media text, p_type text) RETURNS text
LANGUAGE plpgsql AS $$
BEGIN
    BEGIN
        PERFORM set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
        SET LOCAL ROLE authenticated;
        INSERT INTO public.flashes (author_id, content, media_url, media_type) VALUES (p_uid, p_content, p_media, p_type);
        RESET ROLE;
        RETURN 'ok';
    EXCEPTION WHEN OTHERS THEN
        DECLARE h text;
        BEGIN
            GET STACKED DIAGNOSTICS h = PG_EXCEPTION_HINT;
            RESET ROLE;
            RETURN COALESCE(NULLIF(h, ''), SQLERRM);
        END;
    END;
END $$;

DELETE FROM public.flashes WHERE content LIKE 'r2test%';

-- 1) o nome comum do Supabase e o flash só de texto continuam passando
DO $$
DECLARE a uuid; r text;
BEGIN
    SELECT _t.a INTO a FROM _t;
    r := pg_temp.post(a, 'r2test texto', NULL, NULL);
    IF r <> 'ok' THEN RAISE EXCEPTION 'flash de texto recusado: %', r; END IF;
    r := pg_temp.post(a, 'r2test foto', a || '/1730000000000-abc123.jpg', 'image');
    IF r <> 'ok' THEN RAISE EXCEPTION 'flash com foto do Supabase recusado: %', r; END IF;
    r := pg_temp.post(a, 'r2test video do supabase', a || '/1730000000001-abc123.mp4', 'video');
    IF r <> 'ok' THEN RAISE EXCEPTION 'flash com vídeo do Supabase recusado: %', r; END IF;
    RAISE NOTICE 'OK 1: texto, foto e vídeo com nome do Supabase continuam passando';
END $$;

-- 2) nome no formato do R2 sem arquivo registrado: recusado
DO $$
DECLARE a uuid; r text;
BEGIN
    SELECT _t.a INTO a FROM _t;
    r := pg_temp.post(a, 'r2test sem registro', a || '/6f1c0f2e-3b1a-4c55-9a60-0d5d1f7a2b11.mp4', 'video');
    IF r <> 'r2_asset_required' THEN RAISE EXCEPTION 'sem registro deveria ser recusado: %', r; END IF;
    RAISE NOTICE 'OK 2: nome do R2 sem arquivo registrado é recusado';
END $$;

-- 3) com registro: passa; e as regras de dono, tipo, estado e reuso
DO $$
DECLARE a uuid; b uuid; k text; r text; k2 text; k3 text;
BEGIN
    SELECT _t.a, _t.b INTO a, b FROM _t;
    k := a || '/7a1c0f2e-3b1a-4c55-9a60-0d5d1f7a2b21.mp4';
    INSERT INTO public.media_assets (owner_id, kind, provider, bucket, key, bytes, mime) VALUES (a, 'media_r2', 'r2', 'iuser-media', k, 1000, 'video/mp4');
    r := pg_temp.post(a, 'r2test r2 foto', k, 'image');
    IF r <> 'r2_asset_required' THEN RAISE EXCEPTION 'imagem com arquivo do R2 deveria ser recusada: %', r; END IF;
    r := pg_temp.post(a, 'r2test r2 ok', k, 'video');
    IF r <> 'ok' THEN RAISE EXCEPTION 'vídeo registrado deveria passar: %', r; END IF;
    r := pg_temp.post(a, 'r2test r2 repetido', k, 'video');
    IF r <> 'r2_asset_required' THEN RAISE EXCEPTION 'o mesmo vídeo em dois flashes deveria ser recusado: %', r; END IF;
    -- arquivo registrado para OUTRA pessoa (o caminho começa pela pasta da outra pessoa: o CHECK da pasta já recusa; aqui o registro é que não é dela)
    k2 := a || '/8a1c0f2e-3b1a-4c55-9a60-0d5d1f7a2b31.mp4';
    INSERT INTO public.media_assets (owner_id, kind, provider, bucket, key, bytes, mime) VALUES (b, 'media_r2', 'r2', 'iuser-media', k2, 1000, 'video/mp4');
    r := pg_temp.post(a, 'r2test r2 de outro dono', k2, 'video');
    IF r <> 'r2_asset_required' THEN RAISE EXCEPTION 'registro de outra pessoa deveria ser recusado: %', r; END IF;
    -- registro apagado
    k3 := a || '/9a1c0f2e-3b1a-4c55-9a60-0d5d1f7a2b41.mp4';
    INSERT INTO public.media_assets (owner_id, kind, provider, bucket, key, bytes, mime, state) VALUES (a, 'media_r2', 'r2', 'iuser-media', k3, 1000, 'video/mp4', 'deleted');
    r := pg_temp.post(a, 'r2test r2 apagado', k3, 'video');
    IF r <> 'r2_asset_required' THEN RAISE EXCEPTION 'registro apagado deveria ser recusado: %', r; END IF;
    RAISE NOTICE 'OK 3: vídeo registrado passa; imagem, reuso, registro de outra pessoa e registro apagado são recusados';
END $$;

-- 4) liberar o arquivo ao apagar o flash
DO $$
DECLARE a uuid; b uuid; k text; ok1 boolean; ok2 boolean; ok3 boolean; ok4 boolean;
BEGIN
    SELECT _t.a, _t.b INTO a, b FROM _t;
    k := a || '/7a1c0f2e-3b1a-4c55-9a60-0d5d1f7a2b21.mp4';
    ok1 := public.release_r2_asset(a, k);                                  -- ainda em uso por um flash
    IF ok1 THEN RAISE EXCEPTION 'não pode liberar enquanto um flash usa o arquivo'; END IF;
    DELETE FROM public.flashes WHERE media_url = k;
    ok2 := public.release_r2_asset(b, k);                                  -- de outra pessoa
    IF ok2 THEN RAISE EXCEPTION 'outra pessoa não libera arquivo alheio'; END IF;
    ok3 := public.release_r2_asset(a, k);
    IF NOT ok3 THEN RAISE EXCEPTION 'deveria liberar quando ninguém usa'; END IF;
    IF (SELECT state || '/' || deleted_reason FROM public.media_assets WHERE key = k) <> 'deleted/owner' THEN RAISE EXCEPTION 'registro deveria ficar deleted/owner'; END IF;
    ok4 := public.release_r2_asset(a, k);
    IF ok4 THEN RAISE EXCEPTION 'liberar de novo não faz nada'; END IF;
    RAISE NOTICE 'OK 4: liberar só vale para o dono, só sem uso, e uma vez';
END $$;

-- 5) permissões
DO $$
BEGIN
    IF has_function_privilege('authenticated', 'public.release_r2_asset(uuid,text)', 'EXECUTE') OR has_function_privilege('anon', 'public.release_r2_asset(uuid,text)', 'EXECUTE')
       OR NOT has_function_privilege('service_role', 'public.release_r2_asset(uuid,text)', 'EXECUTE') THEN RAISE EXCEPTION 'release_r2_asset deve ser só do serviço'; END IF;
    IF has_function_privilege('authenticated', 'public.flashes_r2_guard()', 'EXECUTE') THEN RAISE EXCEPTION 'o gatilho não é chamável pelo app'; END IF;
    RAISE NOTICE 'OK 5: release_r2_asset só do serviço; o gatilho não é chamável pelo app';
END $$;

ROLLBACK;
