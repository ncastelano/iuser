-- Cenários da limpeza de arquivos sem uso NO R2 (migration 20261130000026). Banco LOCAL (e staging), transação desfeita no final:
--   docker exec -i supabase_db_iuser-local psql -U postgres -d postgres -v ON_ERROR_STOP=1 -X < supabase/tests/r2_cleanup_scenarios.sql
BEGIN;

CREATE TEMP TABLE _t AS SELECT (SELECT id FROM public.profiles ORDER BY created_at LIMIT 1) AS a;
DELETE FROM public.media_assets WHERE provider = 'r2';
-- isolamento: só os arquivos criados aqui contam (os do Supabase ficam "mantidos" nesta transação)
UPDATE public.media_assets SET keep = true WHERE provider = 'supabase';
UPDATE public.upload_settings SET cleanup_min_age_days = 3, cleanup_quarantine_days = 7, cleanup_max_per_run = 1000 WHERE id;
UPDATE public.upload_kinds SET cleanup_eligible = true WHERE kind = 'media_r2';

-- ajudante: registra um arquivo do R2 de 10 dias de idade (nome <uuid>.<ext>)
CREATE FUNCTION pg_temp.mk(p_name text, p_age_days int DEFAULT 10, p_keep boolean DEFAULT false) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE v_key text := (SELECT a FROM _t) || '/' || p_name;
BEGIN
    INSERT INTO public.media_assets (owner_id, kind, provider, bucket, key, bytes, mime, created_at, keep)
    VALUES ((SELECT a FROM _t), 'media_r2', 'r2', 'iuser-media', v_key, 5000, 'video/mp4', now() - make_interval(days => p_age_days), p_keep);
    RETURN v_key;
END $$;

-- 1) quem é candidato: vídeo velho, sem "manter", do tipo elegível; áudio, novo, mantido e tipo desligado da limpeza ficam de fora
DO $$
DECLARE s public.upload_settings%ROWTYPE; k public.upload_kinds%ROWTYPE; r text; ok boolean;
BEGIN
    SELECT * INTO s FROM public.upload_settings WHERE id; SELECT * INTO k FROM public.upload_kinds WHERE kind = 'media_r2';
    PERFORM pg_temp.mk('11111111-1111-4111-8111-111111111111.mp4');
    PERFORM pg_temp.mk('22222222-2222-4222-8222-222222222222.mp3');                    -- áudio
    PERFORM pg_temp.mk('33333333-3333-4333-8333-333333333333.mp4', 1);                  -- novo demais
    PERFORM pg_temp.mk('44444444-4444-4444-8444-444444444444.webm', 10, true);          -- mantido
    FOR r, ok IN SELECT split_part(m.key, '/', 2), public._media_cleanup_candidate(m, k, s) FROM public.media_assets m WHERE m.provider = 'r2' ORDER BY 1 LOOP
        IF (r LIKE '1111%') <> ok THEN RAISE EXCEPTION 'candidato errado para %: %', r, ok; END IF;
        IF (r NOT LIKE '1111%') AND ok THEN RAISE EXCEPTION '% não deveria ser candidato', r; END IF;
    END LOOP;
    UPDATE public.upload_kinds SET cleanup_eligible = false WHERE kind = 'media_r2';
    SELECT * INTO k FROM public.upload_kinds WHERE kind = 'media_r2';
    IF public._media_cleanup_candidate((SELECT m FROM public.media_assets m WHERE m.key LIKE '%1111111%'), k, s) THEN RAISE EXCEPTION 'tipo não elegível não pode entrar'; END IF;
    UPDATE public.upload_kinds SET cleanup_eligible = true WHERE kind = 'media_r2';
    RAISE NOTICE 'OK 1: só vídeo velho, do tipo elegível e sem "manter" é candidato (áudio, novo e mantido ficam de fora)';
END $$;

-- 2) a busca marca o sem uso e protege o que um flash usa; depois da quarentena a lista traz o provedor e a rotina confirma
DO $$
DECLARE a uuid; k_used text; k_free text; r jsonb; d record; n int; c record; flash_id uuid;
BEGIN
    SELECT _t.a INTO a FROM _t;
    DELETE FROM public.media_assets WHERE provider = 'r2';
    k_free := pg_temp.mk('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.mp4');
    k_used := pg_temp.mk('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.mp4');
    INSERT INTO public.flashes (author_id, content, media_url, media_type) VALUES (a, 'r2cleanup uso', k_used, 'video') RETURNING id INTO flash_id;
    r := public.upload_cleanup_scan(1000);
    IF (SELECT orphan_since IS NULL FROM public.media_assets WHERE key = k_free) THEN RAISE EXCEPTION 'o vídeo sem uso deveria ser marcado'; END IF;
    IF (SELECT orphan_since IS NOT NULL FROM public.media_assets WHERE key = k_used) THEN RAISE EXCEPTION 'o vídeo de um flash não pode ser marcado'; END IF;
    -- ainda na quarentena: nada pronto
    SELECT count(*) INTO n FROM public.upload_cleanup_due(1000) WHERE provider = 'r2';
    IF n <> 0 THEN RAISE EXCEPTION 'na quarentena nada fica pronto (%)', n; END IF;
    UPDATE public.media_assets SET orphan_since = now() - interval '8 days' WHERE key = k_free;
    SELECT * INTO d FROM public.upload_cleanup_due(1000) WHERE key = k_free;
    IF d.provider IS DISTINCT FROM 'r2' OR d.bucket <> 'iuser-media' OR d.bytes <> 5000 THEN RAISE EXCEPTION 'pronto errado: %', row_to_json(d); END IF;
    -- uma referência nova entre a marca e o ato de apagar: sai da lista e perde a marca
    DELETE FROM public.flashes WHERE id = flash_id;
    UPDATE public.media_assets SET orphan_since = now() - interval '8 days' WHERE key = k_used;
    INSERT INTO public.flashes (author_id, content, media_url, media_type) VALUES (a, 'r2cleanup uso2', k_free, 'video');
    SELECT count(*) INTO n FROM public.upload_cleanup_due(1000) WHERE key = k_free;
    IF n <> 0 THEN RAISE EXCEPTION 'referência nova deveria tirar da lista'; END IF;
    IF (SELECT orphan_since IS NOT NULL FROM public.media_assets WHERE key = k_free) THEN RAISE EXCEPTION 'e tirar a marca'; END IF;
    -- confirmar (a rotina já apagou do R2 e conferiu): só marca o que está pronto
    SELECT * INTO c FROM public.upload_cleanup_confirm(ARRAY(SELECT id FROM public.media_assets WHERE key = k_used));
    IF c.deleted <> 1 OR c.bytes <> 5000 THEN RAISE EXCEPTION 'confirmar errado: %', row_to_json(c); END IF;
    IF (SELECT state || '/' || deleted_reason FROM public.media_assets WHERE key = k_used) <> 'deleted/orphan' THEN RAISE EXCEPTION 'registro deveria ficar deleted/orphan'; END IF;
    RAISE NOTICE 'OK 2: marca o sem uso, protege o do flash, entrega o provedor depois da quarentena, uma referência nova salva e confirmar fecha o registro';
END $$;

-- 3) objeto solto: r2_known_keys devolve o que o banco conhece (registro pronto ou nome citado) e deixa de fora o resto
DO $$
DECLARE a uuid; reg text; cit text; sol text; got text[];
BEGIN
    SELECT _t.a INTO a FROM _t;
    DELETE FROM public.flashes WHERE content LIKE 'r2cleanup%'; DELETE FROM public.media_assets WHERE provider = 'r2';
    reg := pg_temp.mk('cccccccc-cccc-4ccc-8ccc-cccccccccccc.mp4');
    cit := a || '/dddddddd-dddd-4ddd-8ddd-dddddddddddd.mp4';
    INSERT INTO public.flashes (author_id, content, media_url, media_type) SELECT a, 'r2cleanup cit', cit, 'video' WHERE FALSE;   -- (o gatilho exige registro; a citação vem da coluna de texto abaixo)
    UPDATE public.profiles SET bio = 'olha ' || cit WHERE id = a;
    sol := a || '/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee.mp4';
    got := public.r2_known_keys(ARRAY[reg, cit, sol]);
    IF NOT (reg = ANY (got)) THEN RAISE EXCEPTION 'registro pronto deveria ser conhecido'; END IF;
    IF NOT (cit = ANY (got)) THEN RAISE EXCEPTION 'nome citado em uma coluna deveria ser conhecido'; END IF;
    IF sol = ANY (got) THEN RAISE EXCEPTION 'o solto não pode ser conhecido'; END IF;
    UPDATE public.media_assets SET state = 'deleted' WHERE key = reg;
    IF reg = ANY (public.r2_known_keys(ARRAY[reg])) THEN RAISE EXCEPTION 'registro apagado já não é conhecido'; END IF;
    IF public.r2_known_keys(ARRAY[]::text[]) <> '{}' OR public.r2_known_keys(NULL) <> '{}' THEN RAISE EXCEPTION 'lista vazia devolve vazio'; END IF;
    RAISE NOTICE 'OK 3: r2_known_keys conhece registro pronto e nome citado, e não conhece o solto nem o registro apagado';
END $$;

-- 4) permissões
DO $$
BEGIN
    IF has_function_privilege('authenticated', 'public.r2_known_keys(text[])', 'EXECUTE') OR has_function_privilege('anon', 'public.r2_known_keys(text[])', 'EXECUTE')
       OR NOT has_function_privilege('service_role', 'public.r2_known_keys(text[])', 'EXECUTE') THEN RAISE EXCEPTION 'r2_known_keys só do serviço'; END IF;
    IF has_function_privilege('authenticated', 'public.upload_cleanup_due(integer)', 'EXECUTE') THEN RAISE EXCEPTION 'upload_cleanup_due só do serviço'; END IF;
    RAISE NOTICE 'OK 4: tudo só do serviço';
END $$;

ROLLBACK;
