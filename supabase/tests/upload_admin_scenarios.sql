-- Cenários do painel Admin → Uploads (migration 20261130000021): anotação de recusas, embrulho transparente e leituras agregadas. Banco LOCAL (e staging), transação desfeita:
--   docker exec -i supabase_db_iuser-local psql -U postgres -d postgres -v ON_ERROR_STOP=1 -X < supabase/tests/upload_admin_scenarios.sql
BEGIN;

CREATE TEMP TABLE _t AS SELECT (SELECT id FROM public.profiles ORDER BY created_at LIMIT 1) AS a, (SELECT id FROM public.profiles ORDER BY created_at DESC LIMIT 1) AS b;
GRANT SELECT ON _t TO authenticated;

CREATE FUNCTION pg_temp.authz(p_uid uuid, p_bucket text, p_path text, p_bytes bigint, p_mime text, p_upsert boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE r jsonb;
BEGIN
    PERFORM set_config('request.jwt.claims', CASE WHEN p_uid IS NULL THEN '{"role":"authenticated"}' ELSE json_build_object('sub', p_uid, 'role', 'authenticated')::text END, true);
    SET LOCAL ROLE authenticated;
    r := public.authorize_upload(p_bucket, p_path, p_bytes, p_mime, p_upsert);
    RESET ROLE;
    RETURN r;
END $$;

-- 1) o embrulho é transparente: mesmas respostas do núcleo (sucesso e cada recusa), e o núcleo não é chamável pelo app
DO $$
DECLARE a uuid; w jsonb; c jsonb; i int; p text;
    cases text[][] := ARRAY[
        ['avatars', 'x1.jpg', '1000', 'image/svg+xml'],
        ['avatars', 'x2.jpg', '0', 'image/png'],
        ['avatars', 'x3.jpg', '9999999', 'image/png'],
        ['community-photos', 'alheio/x.jpg', '1000', 'image/png'],
        ['avatars', '../x.jpg', '1000', 'image/png']
    ];
BEGIN
    SELECT _t.a INTO a FROM _t;
    FOR i IN 1..array_length(cases, 1) LOOP
        w := pg_temp.authz(a, cases[i][1], cases[i][2], cases[i][3]::bigint, cases[i][4]);
        PERFORM set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
        c := public._authorize_upload_core(cases[i][1], cases[i][2], cases[i][3]::bigint, cases[i][4], false);   -- como postgres (o núcleo não é do app)
        IF w IS DISTINCT FROM c THEN RAISE EXCEPTION 'o embrulho mudou a resposta do caso %: embrulho % x núcleo %', i, w, c; END IF;
    END LOOP;
    w := pg_temp.authz(a, 'avatars', a || '-t1.jpg', 1000, 'image/jpeg');
    IF (w->>'ok')::boolean IS NOT TRUE OR w->>'kind' <> 'avatar' OR w->'grant' IS NULL THEN RAISE EXCEPTION 'sucesso pelo embrulho: %', w; END IF;
    IF has_function_privilege('authenticated', 'public._authorize_upload_core(text,text,bigint,text,boolean)', 'EXECUTE') OR has_function_privilege('anon', 'public._authorize_upload_core(text,text,bigint,text,boolean)', 'EXECUTE') THEN
        RAISE EXCEPTION 'o núcleo não pode ser chamado pelo app';
    END IF;
    IF has_function_privilege('authenticated', 'public._upload_log_denial(uuid,text,text)', 'EXECUTE') THEN RAISE EXCEPTION 'quem anota recusa não pode ser chamado pelo app'; END IF;
    IF NOT has_function_privilege('authenticated', 'public.authorize_upload(text,text,bigint,text,boolean)', 'EXECUTE') OR has_function_privilege('anon', 'public.authorize_upload(text,text,bigint,text,boolean)', 'EXECUTE') THEN
        RAISE EXCEPTION 'authorize_upload: só quem está logado';
    END IF;
    RAISE NOTICE 'OK 1: o embrulho devolve exatamente o que o núcleo devolve; núcleo e anotador só do banco';
END $$;

-- 2) recusas são anotadas: uma linha por pessoa+tipo+motivo a cada 10 min, com contador; sucesso e "sem login" não entram
DO $$
DECLARE a uuid; b uuid; n int; h int;
BEGIN
    SELECT _t.a, _t.b INTO a, b FROM _t;
    DELETE FROM public.upload_denials;
    PERFORM pg_temp.authz(a, 'avatars', a || '-ok.jpg', 1000, 'image/jpeg');
    PERFORM pg_temp.authz(NULL, 'avatars', 'x.jpg', 1000, 'image/jpeg');
    IF (SELECT count(*) FROM public.upload_denials) <> 0 THEN RAISE EXCEPTION 'sucesso e "sem login" não devem ser anotados'; END IF;

    PERFORM pg_temp.authz(a, 'avatars', 'f1.jpg', 1000, 'image/svg+xml');
    SELECT count(*), max(hits) INTO n, h FROM public.upload_denials WHERE profile_id = a AND kind = 'avatar' AND code = 'type_not_allowed';
    IF n <> 1 OR h <> 1 THEN RAISE EXCEPTION 'a 1ª recusa cria 1 linha com 1 tentativa (% / %)', n, h; END IF;
    PERFORM pg_temp.authz(a, 'avatars', 'f2.jpg', 1000, 'image/svg+xml');
    PERFORM pg_temp.authz(a, 'avatars', 'f3.jpg', 1000, 'image/svg+xml');
    SELECT count(*), max(hits) INTO n, h FROM public.upload_denials WHERE profile_id = a AND kind = 'avatar' AND code = 'type_not_allowed';
    IF n <> 1 OR h <> 3 THEN RAISE EXCEPTION 'repetir soma na MESMA linha (% linhas, % tentativas)', n, h; END IF;

    PERFORM pg_temp.authz(a, 'avatars', 'f4.jpg', 0, 'image/png');                 -- outro motivo
    PERFORM pg_temp.authz(a, 'backgrounds', 'f5.jpg', 1000, 'image/svg+xml');      -- outro tipo
    PERFORM pg_temp.authz(b, 'avatars', 'f6.jpg', 1000, 'image/svg+xml');          -- outra pessoa
    IF (SELECT count(*) FROM public.upload_denials) <> 4 THEN RAISE EXCEPTION 'motivo, tipo e pessoa diferentes são linhas diferentes (%)', (SELECT count(*) FROM public.upload_denials); END IF;

    UPDATE public.upload_denials SET last_at = now() - interval '11 minutes' WHERE profile_id = a AND kind = 'avatar' AND code = 'type_not_allowed';
    PERFORM pg_temp.authz(a, 'avatars', 'f7.jpg', 1000, 'image/svg+xml');
    IF (SELECT count(*) FROM public.upload_denials WHERE profile_id = a AND kind = 'avatar' AND code = 'type_not_allowed') <> 2 THEN RAISE EXCEPTION 'passados 10 min a recusa abre uma nova linha'; END IF;
    RAISE NOTICE 'OK 2: recusa anotada por pessoa+tipo+motivo em janelas de 10 min (com contador); sucesso e sem login não entram';
END $$;

-- 3) anotar NUNCA muda a resposta: mesmo com a tabela de recusas quebrada, a autorização responde igual
DO $$
DECLARE a uuid; r jsonb;
BEGIN
    SELECT _t.a INTO a FROM _t;
    ALTER TABLE public.upload_denials ADD CONSTRAINT upload_denials_teste_quebra CHECK (hits < 0) NOT VALID;   -- toda anotação nova viola isto
    r := pg_temp.authz(a, 'avatars', 'g1.jpg', 1000, 'image/svg+xml');
    IF r->>'error' <> 'type_not_allowed' THEN RAISE EXCEPTION 'com a anotação quebrada a resposta deveria continuar a mesma: %', r; END IF;
    r := pg_temp.authz(a, 'avatars', a || '-g2.jpg', 1000, 'image/jpeg');
    IF (r->>'ok')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'o sucesso não pode ser afetado: %', r; END IF;
    ALTER TABLE public.upload_denials DROP CONSTRAINT upload_denials_teste_quebra;
    RAISE NOTICE 'OK 3: falha ao anotar não muda a resposta da autorização';
END $$;

-- 4) visão geral: todos os tipos do catálogo (15 do Supabase + o do R2), totais conferem com os dados, atividade das 24 h por tipo
DO $$
DECLARE a uuid; o jsonb; k jsonb; v_files bigint; v_bytes bigint;
BEGIN
    SELECT _t.a INTO a FROM _t;
    DELETE FROM public.upload_denials; DELETE FROM public.upload_grants;
    INSERT INTO public.media_assets (owner_id, kind, provider, bucket, key, bytes, mime) VALUES
        (a, 'avatar', 'supabase', 'avatars', 'adm-1.jpg', 1000, 'image/jpeg'), (a, 'avatar', 'supabase', 'avatars', 'adm-2.jpg', 2000, 'image/jpeg'),
        (NULL, 'avatar', 'supabase', 'avatars', 'adm-3.jpg', 500, 'image/jpeg'), (a, 'avatar', 'supabase', 'avatars', 'adm-4-apagado.jpg', 9999, 'image/jpeg');
    UPDATE public.media_assets SET state = 'deleted' WHERE key = 'adm-4-apagado.jpg';
    PERFORM pg_temp.authz(a, 'avatars', a || '-adm-g.jpg', 7000, 'image/jpeg');
    PERFORM pg_temp.authz(a, 'avatars', 'adm-h.jpg', 1000, 'image/svg+xml');
    o := public.admin_upload_overview();
    SELECT count(*), COALESCE(sum(bytes), 0) INTO v_files, v_bytes FROM public.media_assets WHERE state = 'ready';
    IF (o->'totals'->>'files')::bigint <> v_files OR (o->'totals'->>'bytes')::bigint <> v_bytes THEN RAISE EXCEPTION 'totais: % x % arquivos / % bytes', o->'totals', v_files, v_bytes; END IF;
    IF (o->'totals'->>'unknown_owner_files')::bigint < 1 THEN RAISE EXCEPTION 'arquivos de dono desconhecido deveriam ser contados'; END IF;
    IF (o->'totals'->>'grants_24h')::int <> 1 OR (o->'totals'->>'denials_24h')::int <> 1 THEN RAISE EXCEPTION 'autorizações e recusas das 24 h: %', o->'totals'; END IF;
    IF jsonb_array_length(o->'kinds') <> (SELECT count(*) FROM public.upload_kinds) THEN RAISE EXCEPTION 'deveria listar todos os tipos do catálogo (%)', jsonb_array_length(o->'kinds'); END IF;
    SELECT x INTO k FROM jsonb_array_elements(o->'kinds') x WHERE x->>'kind' = 'avatar';
    IF (k->>'files')::bigint <> (SELECT count(*) FROM public.media_assets WHERE kind = 'avatar' AND state = 'ready')
       OR (k->>'bytes')::bigint <> (SELECT sum(bytes) FROM public.media_assets WHERE kind = 'avatar' AND state = 'ready')
       OR (k->>'grants_24h')::int <> 1 OR (k->>'bytes_24h')::bigint <> 7000 OR (k->>'denials_24h')::int <> 1 THEN RAISE EXCEPTION 'tipo avatar: %', k; END IF;
    IF (k->>'max_bytes')::bigint <> 5242880 OR (k->>'per_hour_files')::int <> 20 OR k->>'provider' <> 'supabase' OR (k->>'enabled')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'limites do tipo avatar: %', k; END IF;
    IF (o->>'enforced')::boolean IS NOT FALSE THEN RAISE EXCEPTION 'o interruptor deveria aparecer desligado'; END IF;
    PERFORM public.admin_upload_set_enforced(true, NULL);
    IF (public.admin_upload_overview()->>'enforced')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'o interruptor ligado deveria aparecer'; END IF;
    IF (SELECT x->>'kind' FROM jsonb_array_elements(o->'kinds') x LIMIT 1) <> (SELECT kind FROM public.media_assets WHERE state = 'ready' GROUP BY kind ORDER BY sum(bytes) DESC, kind LIMIT 1) THEN
        RAISE EXCEPTION 'os tipos deveriam vir do que mais ocupa para o que menos ocupa';
    END IF;
    RAISE NOTICE 'OK 4: visão geral (todos os tipos, totais batem, apagado não conta, dono desconhecido contado, atividade das 24 h, interruptor, ordem por uso)';
END $$;

-- 5) maiores consumidores: ordem por bytes, só dono conhecido, filtro por tipo, atividade das 24 h, bloqueado, limite
DO $$
DECLARE a uuid; b uuid; r record; n int; v_blk uuid;
BEGIN
    SELECT _t.a, _t.b INTO a, b FROM _t;
    DELETE FROM public.media_assets WHERE key LIKE 'adm-%';
    INSERT INTO public.media_assets (owner_id, kind, provider, bucket, key, bytes, mime) VALUES
        (a, 'avatar', 'supabase', 'avatars', 'adm-a1.jpg', 4000000000, 'image/jpeg'), (a, 'store_logo', 'supabase', 'store-logos', 'adm-a2.jpg', 1000, 'image/jpeg'),
        (b, 'avatar', 'supabase', 'avatars', 'adm-b1.jpg', 3000000000, 'image/jpeg'), (NULL, 'avatar', 'supabase', 'avatars', 'adm-n1.jpg', 9000000000, 'image/jpeg');
    SELECT * INTO r FROM public.admin_upload_top_owners(NULL, 15) LIMIT 1;
    IF r.profile_id IS DISTINCT FROM a OR r.bytes < 4000000000 OR r.files < 2 THEN RAISE EXCEPTION 'o maior consumidor deveria ser A: %', row_to_json(r); END IF;
    IF EXISTS (SELECT 1 FROM public.admin_upload_top_owners(NULL, 100) WHERE profile_id IS NULL) THEN RAISE EXCEPTION 'dono desconhecido não entra na lista de pessoas'; END IF;
    SELECT * INTO r FROM public.admin_upload_top_owners('store_logo', 15) WHERE profile_id = a;
    IF r.bytes <> (SELECT sum(bytes) FROM public.media_assets WHERE owner_id = a AND kind = 'store_logo' AND state = 'ready') THEN RAISE EXCEPTION 'filtro por tipo: %', row_to_json(r); END IF;
    IF EXISTS (SELECT 1 FROM public.admin_upload_top_owners('store_logo', 100) t
               WHERE t.bytes <> COALESCE((SELECT sum(m.bytes) FROM public.media_assets m WHERE m.owner_id = t.profile_id AND m.kind = 'store_logo' AND m.state = 'ready'), 0)
                  OR t.files <> (SELECT count(*) FROM public.media_assets m WHERE m.owner_id = t.profile_id AND m.kind = 'store_logo' AND m.state = 'ready')) THEN
        RAISE EXCEPTION 'com o filtro por tipo, cada pessoa deve mostrar só os arquivos daquele tipo';
    END IF;
    IF (SELECT count(*) FROM public.admin_upload_top_owners(NULL, 1)) <> 1 OR (SELECT count(*) FROM public.admin_upload_top_owners(NULL, 0)) <> 1 THEN RAISE EXCEPTION 'limite 1 e 0 (vira 1) devolvem 1 linha'; END IF;
    IF (SELECT count(*) FROM public.admin_upload_top_owners(NULL, 100000)) > 100 THEN RAISE EXCEPTION 'o limite máximo é 100'; END IF;
    IF (SELECT blocked FROM public.admin_upload_top_owners(NULL, 100) WHERE profile_id = a) THEN RAISE EXCEPTION 'A ainda não está bloqueado'; END IF;
    v_blk := public.admin_upload_block(a, NULL, 'teste', 1, NULL);
    IF NOT (SELECT blocked FROM public.admin_upload_top_owners(NULL, 100) WHERE profile_id = a) THEN RAISE EXCEPTION 'A bloqueado deveria aparecer como bloqueado'; END IF;
    PERFORM public.admin_upload_unblock(v_blk, NULL);
    IF (SELECT blocked FROM public.admin_upload_top_owners(NULL, 100) WHERE profile_id = a) THEN RAISE EXCEPTION 'depois de liberar deixa de aparecer bloqueado'; END IF;
    IF (SELECT name FROM public.admin_upload_top_owners(NULL, 100) WHERE profile_id = a) IS NULL AND (SELECT slug FROM public.admin_upload_top_owners(NULL, 100) WHERE profile_id = a) IS NULL THEN RAISE EXCEPTION 'deveria trazer nome ou @ da pessoa'; END IF;
    RAISE NOTICE 'OK 5: maiores consumidores (ordem, só dono conhecido, filtro por tipo, limite 1–100, bloqueado)';
END $$;

-- 6) recusas recentes: agrupadas por pessoa+tipo+motivo, somando tentativas, só dentro da janela de horas
DO $$
DECLARE a uuid; b uuid; r record; i int;
BEGIN
    SELECT _t.a, _t.b INTO a, b FROM _t;
    DELETE FROM public.upload_denials;
    FOR i IN 1..5 LOOP PERFORM pg_temp.authz(a, 'avatars', 'd' || i || '.jpg', 1000, 'image/svg+xml'); END LOOP;
    PERFORM pg_temp.authz(b, 'avatars', 'e1.jpg', 1000, 'image/svg+xml');
    INSERT INTO public.upload_denials (profile_id, kind, code, hits, created_at, last_at) VALUES (b, 'avatar', 'rate_limited', 50, now() - interval '30 hours', now() - interval '30 hours');
    SELECT * INTO r FROM public.admin_upload_denials(24, 20) LIMIT 1;
    IF r.profile_id <> a OR r.kind <> 'avatar' OR r.code <> 'type_not_allowed' OR r.hits <> 5 THEN RAISE EXCEPTION 'a pessoa que mais insiste vem primeiro, com as 5 tentativas: %', row_to_json(r); END IF;
    IF (SELECT count(*) FROM public.admin_upload_denials(24, 20)) <> 2 THEN RAISE EXCEPTION 'a recusa de 30 h atrás não entra na janela de 24 h'; END IF;
    IF (SELECT count(*) FROM public.admin_upload_denials(48, 20)) <> 3 THEN RAISE EXCEPTION 'com 48 h ela entra'; END IF;
    IF (SELECT count(*) FROM public.admin_upload_denials(24, 1)) <> 1 THEN RAISE EXCEPTION 'limite de linhas'; END IF;
    RAISE NOTICE 'OK 6: recusas recentes agrupadas, ordenadas por insistência e limitadas pela janela de horas';
END $$;

-- 7) limpeza diária leva também as recusas antigas; leituras do painel e anotadores só do serviço
DO $$
DECLARE a uuid; n int;
BEGIN
    SELECT _t.a INTO a FROM _t;
    DELETE FROM public.upload_denials; DELETE FROM public.upload_grants;
    INSERT INTO public.upload_denials (profile_id, kind, code, last_at, created_at) VALUES (a, 'avatar', 'x_velha', now() - interval '9 days', now() - interval '9 days'), (a, 'avatar', 'x_nova', now() - interval '1 day', now() - interval '1 day');
    INSERT INTO public.upload_grants (profile_id, kind, bucket, key, declared_bytes, created_at, expires_at) VALUES (a, 'avatar', 'avatars', 'velha.jpg', 10, now() - interval '9 days', now() - interval '9 days');
    n := public.upload_grants_purge();
    IF n <> 2 OR EXISTS (SELECT 1 FROM public.upload_denials WHERE code = 'x_velha') OR NOT EXISTS (SELECT 1 FROM public.upload_denials WHERE code = 'x_nova') THEN RAISE EXCEPTION 'limpeza: % linhas; só as de mais de 8 dias saem', n; END IF;
    IF has_function_privilege('authenticated', 'public.admin_upload_overview()', 'EXECUTE') OR has_function_privilege('authenticated', 'public.admin_upload_top_owners(text,integer)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.admin_upload_denials(integer,integer)', 'EXECUTE') OR has_function_privilege('anon', 'public.admin_upload_overview()', 'EXECUTE')
       OR has_table_privilege('authenticated', 'public.upload_denials', 'SELECT') THEN RAISE EXCEPTION 'as leituras do painel e a tabela de recusas são só do serviço'; END IF;
    RAISE NOTICE 'OK 7: limpeza leva recusas com mais de 8 dias; leituras do painel só do serviço';
END $$;

ROLLBACK;
