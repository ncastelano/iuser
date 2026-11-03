-- Cenários da LIMPEZA de arquivos órfãos (migration 20261130000022): busca de referências, marcação, quarentena, disjuntor, confirmação, "manter", configurações e permissões.
-- Banco LOCAL (e staging), transação desfeita. Não toca no Storage (a exclusão de verdade é do teste ponta a ponta: scripts/local/test-upload-cleanup.mjs):
--   docker exec -i supabase_db_iuser-local psql -U postgres -d postgres -v ON_ERROR_STOP=1 -X < supabase/tests/upload_cleanup_scenarios.sql
BEGIN;

-- os arquivos que já existem no banco ficam de fora (keep): o teste só enxerga os dele
UPDATE public.media_assets SET keep = true WHERE key NOT LIKE 'zz-cl-%';
-- tabela de prova com os três jeitos de guardar uma referência (texto, JSON, lista); fica em public para a busca enxergar, e some com o ROLLBACK
CREATE TABLE public.zz_cleanup_probe (id serial PRIMARY KEY, t text, j jsonb, a text[], v varchar);

CREATE FUNCTION pg_temp.mk(p_kind text, p_key text, p_age_days numeric, p_orphan_days numeric DEFAULT NULL, p_keep boolean DEFAULT false, p_state text DEFAULT 'ready', p_bytes bigint DEFAULT 1000) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE v_bucket text; v_id uuid;
BEGIN
    SELECT bucket INTO v_bucket FROM public.upload_kinds WHERE kind = p_kind;
    INSERT INTO public.media_assets (owner_id, kind, provider, bucket, key, bytes, mime, state, created_at, orphan_since, keep, deleted_at)
    VALUES (NULL, p_kind, 'supabase', v_bucket, p_key, p_bytes, 'image/jpeg', p_state, now() - make_interval(secs => p_age_days * 86400),
            CASE WHEN p_orphan_days IS NULL THEN NULL ELSE now() - make_interval(secs => p_orphan_days * 86400) END, p_keep, CASE WHEN p_state = 'deleted' THEN now() END)
    RETURNING id INTO v_id;
    RETURN v_id;
END $$;

-- 1) A BUSCA acha o nome em texto, em link completo, em link do proxy, em JSON aninhado, em lista e nos metadados da conta; não acha o que ninguém cita; o próprio registro não conta
DO $$
DECLARE r text[]; v_uid uuid;
BEGIN
    SELECT id INTO v_uid FROM public.profiles ORDER BY created_at LIMIT 1;
    INSERT INTO public.zz_cleanup_probe (t, j, a, v) VALUES
        ('https://abc.supabase.co/storage/v1/object/public/avatars/zz-cl-link-completo.jpg', NULL, NULL, NULL),
        ('https://www.iuser.com.br/img/product-images/zz-cl-proxy.png?t=1', NULL, NULL, NULL),
        ('zz-cl-caminho-cru.webp', NULL, NULL, NULL),
        (NULL, '{"a": {"b": ["x", {"foto": "zz-cl-json-aninhado.jpeg"}]}}', NULL, NULL),
        (NULL, NULL, ARRAY['nada.txt', 'pasta/ZZ-CL-lista-MAIUSCULA.GIF'], NULL),
        (NULL, NULL, NULL, 'zz-cl-varchar.avif');
    UPDATE auth.users SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || '{"avatar_url": "http://x/avatars/zz-cl-metadado-da-conta.jpg"}'::jsonb WHERE id = v_uid;
    PERFORM pg_temp.mk('avatar', 'zz-cl-ninguem-cita.jpg', 30);     -- o próprio media_assets tem esse nome na coluna key: não pode contar como referência
    r := public._media_cited_names(ARRAY['zz-cl-link-completo.jpg', 'zz-cl-proxy.png', 'zz-cl-caminho-cru.webp', 'zz-cl-json-aninhado.jpeg', 'zz-cl-lista-maiuscula.gif', 'zz-cl-varchar.avif', 'zz-cl-metadado-da-conta.jpg', 'zz-cl-ninguem-cita.jpg', 'zz-cl-nao-existe.jpg']);
    IF NOT (r @> ARRAY['zz-cl-link-completo.jpg', 'zz-cl-proxy.png', 'zz-cl-caminho-cru.webp', 'zz-cl-json-aninhado.jpeg', 'zz-cl-lista-maiuscula.gif', 'zz-cl-varchar.avif', 'zz-cl-metadado-da-conta.jpg']) THEN
        RAISE EXCEPTION 'a busca deixou de achar referências: achou só %', r;
    END IF;
    IF 'zz-cl-ninguem-cita.jpg' = ANY (r) OR 'zz-cl-nao-existe.jpg' = ANY (r) THEN RAISE EXCEPTION 'a busca achou o que ninguém cita: %', r; END IF;
    IF public._media_cited_names('{}') <> '{}' OR public._media_cited_names(NULL) <> '{}' THEN RAISE EXCEPTION 'lista vazia devolve vazio'; END IF;
    RAISE NOTICE 'OK 1: a busca acha referência em texto, link completo, proxy, JSON, lista e metadados da conta (sem diferenciar maiúscula) e ignora o próprio registro';
END $$;

-- 2) A MARCAÇÃO: só o que é elegível, velho o bastante, seguro e sem referência é marcado; o resto fica intocado
DO $$
DECLARE r jsonb; a_orfao uuid; a_usado uuid; a_novo uuid; a_dig uuid; a_keep uuid; a_esp uuid; a_pdf uuid; a_del uuid; a_prova uuid; a_corrida uuid; x record;
BEGIN
    INSERT INTO public.zz_cleanup_probe (t) VALUES ('/img/avatars/zz-cl-a-usado.jpg');
    a_orfao  := pg_temp.mk('avatar', 'zz-cl-a-orfao.jpg', 10);
    a_usado  := pg_temp.mk('avatar', 'zz-cl-a-usado.jpg', 10);
    a_novo   := pg_temp.mk('avatar', 'zz-cl-a-novo.jpg', 1);                       -- menos de 3 dias: pode ser foto ainda não salva num formulário
    a_dig    := pg_temp.mk('digital_file', 'zz-cl-a-digital.jpg', 30);             -- conteúdo pago: nunca
    a_prova  := pg_temp.mk('delivery_proof', 'zz-cl-a-prova.jpg', 30);            -- evidência de disputa: nunca
    a_corrida := pg_temp.mk('ride_object_photo', 'zz-cl-a-corrida.jpg', 30);      -- evidência de corrida: nunca
    a_keep   := pg_temp.mk('avatar', 'zz-cl-a-keep.jpg', 30, NULL, true);          -- o admin mandou manter
    a_esp    := pg_temp.mk('avatar', 'zz-cl-a-nome com espaço.jpg', 30);           -- nome fora do padrão seguro: não mexe
    a_pdf    := pg_temp.mk('avatar', 'zz-cl-a-documento.pdf', 30);                 -- não é foto nem vídeo: não mexe
    a_del    := pg_temp.mk('avatar', 'zz-cl-a-ja-apagado.jpg', 30, NULL, false, 'deleted');
    r := public.upload_cleanup_scan(1000);
    IF (SELECT orphan_since FROM public.media_assets WHERE id = a_orfao) IS NULL THEN RAISE EXCEPTION 'o órfão deveria ser marcado'; END IF;
    IF (SELECT orphan_since FROM public.media_assets WHERE id = a_usado) IS NOT NULL OR (SELECT ref_checked_at FROM public.media_assets WHERE id = a_usado) IS NULL THEN RAISE EXCEPTION 'o arquivo em uso não é marcado e fica "conferido"'; END IF;
    FOR x IN SELECT id, key FROM public.media_assets WHERE id IN (a_novo, a_dig, a_prova, a_corrida, a_keep, a_esp, a_pdf, a_del) AND (orphan_since IS NOT NULL OR ref_checked_at IS NOT NULL) LOOP
        RAISE EXCEPTION 'não deveria ter sido tocado: %', x.key;
    END LOOP;
    IF (r->>'marked')::int <> 2 OR (r->>'cleared')::int <> 0 OR (r->>'scanned')::int <> 3 THEN
        RAISE EXCEPTION 'contagem: esperado olhar 3 (o órfão, o em uso e o ex-órfão de teste 1), marcar 2 e desmarcar 0: %', r;
    END IF;
    RAISE NOTICE 'OK 2: marca só o elegível, velho, seguro e sem referência; digital, prova, corrida, manter, nome estranho, não-foto, apagado e novo ficam intocados';
END $$;

-- 3) repetir não marca de novo (a data da marcação não muda); referência que reaparece DESMARCA
DO $$
DECLARE r jsonb; a uuid; t0 timestamptz; t1 timestamptz;
BEGIN
    SELECT id, orphan_since INTO a, t0 FROM public.media_assets WHERE key = 'zz-cl-a-orfao.jpg';
    PERFORM pg_sleep(0.05);
    r := public.upload_cleanup_scan(1000);
    SELECT orphan_since INTO t1 FROM public.media_assets WHERE id = a;
    IF t0 IS DISTINCT FROM t1 THEN RAISE EXCEPTION 'repetir a busca não pode mudar o início da quarentena'; END IF;
    IF (r->>'marked')::int <> 0 THEN RAISE EXCEPTION 'nada novo para marcar: %', r; END IF;
    INSERT INTO public.zz_cleanup_probe (j) VALUES ('{"foto": "zz-cl-a-orfao.jpg"}');
    r := public.upload_cleanup_scan(1000);
    IF (SELECT orphan_since FROM public.media_assets WHERE id = a) IS NOT NULL OR (r->>'cleared')::int <> 1 THEN RAISE EXCEPTION 'a referência reapareceu: deveria desmarcar (%)', r; END IF;
    DELETE FROM public.zz_cleanup_probe WHERE j IS NOT NULL;
    RAISE NOTICE 'OK 3: repetir é inofensivo; se alguém volta a citar o arquivo, a marca sai sozinha';
END $$;

-- 4) A QUARENTENA: só é apagável depois de N dias marcado E de nova conferência; referência nova tira da lista; manter, tipo protegido e arquivo novo nunca entram
DO $$
DECLARE a_due uuid; a_cedo uuid; a_ref uuid; a_keep uuid; a_prova uuid; n int; ids uuid[];
BEGIN
    a_due  := pg_temp.mk('store_logo', 'zz-cl-q-apagavel.jpg', 30, 8);
    a_cedo := pg_temp.mk('store_logo', 'zz-cl-q-cedo.jpg', 30, 3);                -- marcado há 3 dias: ainda na quarentena de 7
    a_ref  := pg_temp.mk('store_logo', 'zz-cl-q-ganhou-referencia.jpg', 30, 9);   -- marcado há 9 dias, mas alguém passou a citar
    a_keep := pg_temp.mk('store_logo', 'zz-cl-q-manter.jpg', 30, 9, true);
    a_prova := pg_temp.mk('delivery_proof', 'zz-cl-q-prova.jpg', 30, 9);
    INSERT INTO public.zz_cleanup_probe (t) VALUES ('logo: zz-cl-q-ganhou-referencia.jpg');
    SELECT array_agg(id) INTO ids FROM public.upload_cleanup_due(1000);
    IF NOT (a_due = ANY (ids)) THEN RAISE EXCEPTION 'o marcado há 8 dias deveria estar pronto'; END IF;
    IF a_cedo = ANY (ids) OR a_ref = ANY (ids) OR a_keep = ANY (ids) OR a_prova = ANY (ids) THEN RAISE EXCEPTION 'só o apagável de verdade pode aparecer: %', ids; END IF;
    IF (SELECT orphan_since FROM public.media_assets WHERE id = a_ref) IS NOT NULL THEN RAISE EXCEPTION 'quem ganhou referência é desmarcado na conferência final'; END IF;
    UPDATE public.upload_settings SET cleanup_quarantine_days = 2;
    SELECT array_agg(id) INTO ids FROM public.upload_cleanup_due(1000);
    IF NOT (a_cedo = ANY (ids)) THEN RAISE EXCEPTION 'com quarentena de 2 dias o marcado há 3 deveria estar pronto'; END IF;
    UPDATE public.upload_settings SET cleanup_quarantine_days = 7;
    SELECT count(*) INTO n FROM public.upload_cleanup_due(1);
    IF n <> 1 THEN RAISE EXCEPTION 'o limite do lote vale (% linhas)', n; END IF;
    RAISE NOTICE 'OK 4: apagável só depois da quarentena e de nova conferência; referência nova, manter, prova e arquivo cedo demais ficam de fora; o limite do lote vale';
END $$;

-- 5) O DISJUNTOR: muita coisa "apagável" de uma vez é defeito da busca, não sujeira
DO $$
DECLARE i int; n int; ok boolean := false;
BEGIN
    UPDATE public.upload_kinds SET cleanup_eligible = (kind = 'mural_image');
    DELETE FROM public.media_assets WHERE key LIKE 'zz-cl-%';                      -- só os dados deste cenário
    FOR i IN 1..25 LOOP PERFORM pg_temp.mk('mural_image', 'zz-cl-d-' || i || '.jpg', 30, 10); END LOOP;      -- 25 de 25 elegíveis (100%) e mais de 20
    BEGIN PERFORM * FROM public.upload_cleanup_due(1000); RAISE EXCEPTION 'o disjuntor deveria ter disparado';
    EXCEPTION WHEN raise_exception THEN
        IF SQLERRM NOT LIKE 'circuit_breaker:%' THEN RAISE; END IF; ok := true;
    END;
    FOR i IN 26..100 LOOP PERFORM pg_temp.mk('mural_image', 'zz-cl-d-' || i || '.jpg', 30); END LOOP;        -- agora são 25 apagáveis de 100 (25%): abaixo de 30%
    SELECT count(*) INTO n FROM public.upload_cleanup_due(1000);
    IF n <> 25 THEN RAISE EXCEPTION 'com 25%% o disjuntor não dispara (voltaram % linhas)', n; END IF;
    DELETE FROM public.media_assets WHERE key LIKE 'zz-cl-d-%';
    FOR i IN 1..15 LOOP PERFORM pg_temp.mk('mural_image', 'zz-cl-e-' || i || '.jpg', 30, 10); END LOOP;      -- 15 de 15 (100%), mas não passa de 20: poucos, o disjuntor não dispara
    SELECT count(*) INTO n FROM public.upload_cleanup_due(1000);
    IF n <> 15 THEN RAISE EXCEPTION 'poucos arquivos (15) não disparam o disjuntor (%)', n; END IF;
    RAISE NOTICE 'OK 5: disjuntor — mais de 20 e mais de 30%% apagáveis aborta; 25%% passa; só 15 passa';
END $$;

-- 6) CONFIRMAR: só vale para o que sumiu do Storage de verdade (se a API falhou, o arquivo segue vivo e marcado)
DO $$
DECLARE a_sumiu uuid; a_ficou uuid; a_sumiu2 uuid; r record;
BEGIN
    UPDATE public.upload_kinds SET cleanup_eligible = true WHERE kind IN ('avatar');
    DELETE FROM public.media_assets WHERE key LIKE 'zz-cl-%';
    a_sumiu  := pg_temp.mk('avatar', 'zz-cl-c-sumiu.jpg', 30, 10, false, 'ready', 4000);
    a_sumiu2 := pg_temp.mk('avatar', 'zz-cl-c-sumiu2.jpg', 30, 10, false, 'ready', 6000);
    a_ficou  := pg_temp.mk('avatar', 'zz-cl-c-ficou.jpg', 30, 10, false, 'ready', 9000);
    INSERT INTO storage.objects (bucket_id, name, metadata) VALUES ('avatars', 'zz-cl-c-ficou.jpg', '{"size": 9000}'::jsonb);   -- a API "falhou" para este: o arquivo continua no Storage
    SELECT * INTO r FROM public.upload_cleanup_confirm(ARRAY[a_sumiu, a_sumiu2, a_ficou]);
    IF r.deleted <> 2 OR r.bytes <> 10000 THEN RAISE EXCEPTION 'confirmar: esperado 2 arquivos e 10000 bytes, veio % / %', r.deleted, r.bytes; END IF;
    IF (SELECT state FROM public.media_assets WHERE id = a_ficou) <> 'ready' THEN RAISE EXCEPTION 'quem ainda está no Storage não pode ser dado como apagado'; END IF;
    IF (SELECT state || ':' || deleted_reason FROM public.media_assets WHERE id = a_sumiu) <> 'deleted:orphan' THEN RAISE EXCEPTION 'motivo da exclusão'; END IF;
    SELECT * INTO r FROM public.upload_cleanup_confirm(ARRAY[a_sumiu]);
    IF r.deleted <> 0 THEN RAISE EXCEPTION 'confirmar de novo é inofensivo'; END IF;
    SELECT * INTO r FROM public.upload_cleanup_confirm(NULL); IF r.deleted <> 0 THEN RAISE EXCEPTION 'lista nula não faz nada'; END IF;
    RAISE NOTICE 'OK 6: confirmar só vale para o que realmente sumiu do Storage; repetir é inofensivo';
END $$;

-- 7) MANTER, configurações e auditoria
DO $$
DECLARE a uuid; s jsonb; n int;
BEGIN
    a := pg_temp.mk('avatar', 'zz-cl-m-manter.jpg', 30, 9);
    IF NOT public.admin_upload_cleanup_keep(a, true, NULL) THEN RAISE EXCEPTION 'manter devolve true'; END IF;
    IF (SELECT orphan_since FROM public.media_assets WHERE id = a) IS NOT NULL OR NOT (SELECT keep FROM public.media_assets WHERE id = a) THEN RAISE EXCEPTION 'manter tira da quarentena'; END IF;
    PERFORM public.upload_cleanup_scan(1000);
    IF (SELECT orphan_since FROM public.media_assets WHERE id = a) IS NOT NULL THEN RAISE EXCEPTION 'um arquivo mantido nunca mais é marcado'; END IF;
    IF NOT public.admin_upload_cleanup_keep(a, false, NULL) THEN RAISE EXCEPTION 'desfazer manter devolve true'; END IF;
    PERFORM public.upload_cleanup_scan(1000);
    IF (SELECT orphan_since FROM public.media_assets WHERE id = a) IS NULL THEN RAISE EXCEPTION 'sem "manter" volta a ser candidato'; END IF;
    IF public.admin_upload_cleanup_keep(gen_random_uuid(), true, NULL) THEN RAISE EXCEPTION 'arquivo inexistente devolve false'; END IF;
    IF (SELECT count(*) FROM public.admin_config_audit WHERE scope = 'upload_cleanup' AND setting = 'avatars/zz-cl-m-manter.jpg') <> 2 THEN RAISE EXCEPTION 'manter e desfazer ficam na auditoria'; END IF;

    s := public.admin_upload_cleanup_settings('{}'::jsonb, NULL);
    IF (s->>'enabled')::boolean IS NOT FALSE OR (s->>'min_age_days')::int <> 3 OR (s->>'quarantine_days')::int <> 7 OR (s->>'max_per_run')::int <> 200 THEN RAISE EXCEPTION 'padrões: desligada, 3 dias, 7 dias, 200: %', s; END IF;
    s := public.admin_upload_cleanup_settings('{"cleanup_enabled": true, "cleanup_max_per_run": 50}'::jsonb, NULL);
    IF (s->>'enabled')::boolean IS NOT TRUE OR (s->>'max_per_run')::int <> 50 THEN RAISE EXCEPTION 'não gravou: %', s; END IF;
    SELECT count(*) INTO n FROM public.admin_config_audit WHERE scope = 'upload_settings' AND setting IN ('cleanup_enabled', 'cleanup_max_per_run');
    IF n <> 2 THEN RAISE EXCEPTION 'só os 2 campos mudados ficam na auditoria (%)', n; END IF;
    PERFORM public.admin_upload_cleanup_settings('{"cleanup_enabled": true}'::jsonb, NULL);
    IF (SELECT count(*) FROM public.admin_config_audit WHERE scope = 'upload_settings' AND setting = 'cleanup_enabled') <> 1 THEN RAISE EXCEPTION 'repetir o mesmo valor não gera auditoria'; END IF;
    BEGIN PERFORM public.admin_upload_cleanup_settings('{"signed_required": true}'::jsonb, NULL); RAISE EXCEPTION 'campo fora da lista deveria falhar';
    EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
    BEGIN PERFORM public.admin_upload_cleanup_settings('{"cleanup_min_age_days": 0}'::jsonb, NULL); RAISE EXCEPTION 'idade 0 deveria falhar';
    EXCEPTION WHEN check_violation THEN NULL; END;
    BEGIN PERFORM public.admin_upload_cleanup_settings('{"cleanup_quarantine_days": 400}'::jsonb, NULL); RAISE EXCEPTION 'quarentena de 400 dias deveria falhar';
    EXCEPTION WHEN check_violation THEN NULL; END;
    BEGIN PERFORM public.admin_upload_cleanup_settings('{"cleanup_max_per_run": 5000}'::jsonb, NULL); RAISE EXCEPTION 'lote de 5000 deveria falhar';
    EXCEPTION WHEN check_violation THEN NULL; END;
    PERFORM public.admin_upload_cleanup_settings('{"cleanup_enabled": false, "cleanup_max_per_run": 200}'::jsonb, NULL);
    RAISE NOTICE 'OK 7: manter protege e é desfeito; configurações validadas, auditadas só quando mudam';
END $$;

-- 8) visão do painel: números, candidatos (com "falta N dias"), tipos protegidos e rodadas registradas
DO $$
DECLARE o jsonb; c jsonb; id uuid;
BEGIN
    DELETE FROM public.media_assets WHERE key LIKE 'zz-cl-%';
    PERFORM pg_temp.mk('avatar', 'zz-cl-o-grande.jpg', 30, 10, false, 'ready', 9000000);
    PERFORM pg_temp.mk('avatar', 'zz-cl-o-pequeno.jpg', 30, 3, false, 'ready', 1000);
    PERFORM pg_temp.mk('avatar', 'zz-cl-o-mantido.jpg', 30, NULL, true, 'ready', 500);
    PERFORM pg_temp.mk('avatar', 'zz-cl-o-apagado.jpg', 30, 20, false, 'deleted', 777);
    UPDATE public.media_assets SET deleted_reason = 'orphan' WHERE key = 'zz-cl-o-apagado.jpg';
    id := public.upload_cleanup_record_run('admin', true, now() - interval '1 minute', '{"scanned": 5, "marked": 2, "cleared": 1, "due": 1, "deleted": 0, "bytes_freed": 0, "reconciled": 0, "errors": 0}'::jsonb, 'teste');
    o := public.admin_upload_cleanup_overview();
    IF (o->'counts'->>'orphans')::int <> 2 OR (o->'counts'->>'orphan_bytes')::bigint <> 9001000 OR (o->'counts'->>'due')::int <> 1 OR (o->'counts'->>'kept')::int <> (SELECT count(*) FROM public.media_assets WHERE state = 'ready' AND keep) THEN RAISE EXCEPTION 'números: %', o->'counts'; END IF;
    IF (o->'counts'->>'deleted_total')::int <> 1 OR (o->'counts'->>'freed_bytes')::bigint <> 777 THEN RAISE EXCEPTION 'apagados: %', o->'counts'; END IF;
    c := o->'candidates'->0;
    IF c->>'key' <> 'zz-cl-o-grande.jpg' OR (c->>'due')::boolean IS NOT TRUE OR (c->>'days_left')::int <> 0 THEN RAISE EXCEPTION 'o maior vem primeiro e já está pronto: %', c; END IF;
    c := o->'candidates'->1;
    IF c->>'key' <> 'zz-cl-o-pequeno.jpg' OR (c->>'due')::boolean IS NOT FALSE OR (c->>'days_left')::int <> 4 THEN RAISE EXCEPTION 'o pequeno falta 4 dias (7 - 3): %', c; END IF;
    IF NOT (o->'protected_kinds') @> '["Foto da prova de entrega", "Arquivo de produto digital", "Foto do objeto da corrida"]'::jsonb THEN RAISE EXCEPTION 'tipos protegidos: %', o->'protected_kinds'; END IF;
    IF (o->'runs'->0->>'source') <> 'admin' OR (o->'runs'->0->>'dry_run')::boolean IS NOT TRUE OR (o->'runs'->0->>'marked')::int <> 2 THEN RAISE EXCEPTION 'última rodada: %', o->'runs'->0; END IF;
    IF (o->'settings'->>'enabled')::boolean IS NOT FALSE THEN RAISE EXCEPTION 'configuração na visão'; END IF;
    RAISE NOTICE 'OK 8: a visão traz números, candidatos ordenados com os dias que faltam, tipos protegidos e as rodadas';
END $$;

-- 9) a conferência de arquivos que sumiram do Storage
DO $$
DECLARE a_some uuid; a_fica uuid; n int;
BEGIN
    DELETE FROM public.media_assets WHERE key LIKE 'zz-cl-%';
    a_some := pg_temp.mk('avatar', 'zz-cl-r-some.jpg', 30);
    a_fica := pg_temp.mk('avatar', 'zz-cl-r-fica.jpg', 30);
    INSERT INTO storage.objects (bucket_id, name, metadata) VALUES ('avatars', 'zz-cl-r-fica.jpg', '{"size": 1}'::jsonb);
    n := public.media_assets_reconcile();
    IF (SELECT state || ':' || COALESCE(deleted_reason, '-') FROM public.media_assets WHERE id = a_some) <> 'deleted:missing' THEN RAISE EXCEPTION 'o que sumiu vira "deleted:missing"'; END IF;
    IF (SELECT state FROM public.media_assets WHERE id = a_fica) <> 'ready' THEN RAISE EXCEPTION 'o que está no Storage fica'; END IF;
    IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'media-assets-reconcile' AND schedule = '40 3 * * *') THEN RAISE EXCEPTION 'a conferência diária deveria estar agendada'; END IF;
    RAISE NOTICE 'OK 9: o que sumiu do Storage é marcado como "missing"; a rotina diária está agendada';
END $$;

-- 10) permissões: nada disto é do app; só o serviço
DO $$
DECLARE f text;
BEGIN
    FOREACH f IN ARRAY ARRAY['public._media_cited_names(text[])', 'public.upload_cleanup_scan(integer)', 'public.upload_cleanup_due(integer)', 'public.upload_cleanup_confirm(uuid[])',
        'public.upload_cleanup_record_run(text,boolean,timestamptz,jsonb,text)', 'public.admin_upload_cleanup_overview()', 'public.admin_upload_cleanup_keep(uuid,boolean,uuid)', 'public.admin_upload_cleanup_settings(jsonb,uuid)', 'public.media_assets_reconcile()'] LOOP
        IF has_function_privilege('authenticated', f, 'EXECUTE') OR has_function_privilege('anon', f, 'EXECUTE') OR has_function_privilege('public', f, 'EXECUTE') THEN RAISE EXCEPTION 'o app não pode executar %', f; END IF;
    END LOOP;
    FOREACH f IN ARRAY ARRAY['public.upload_cleanup_scan(integer)', 'public.upload_cleanup_due(integer)', 'public.upload_cleanup_confirm(uuid[])', 'public.admin_upload_cleanup_overview()', 'public.admin_upload_cleanup_keep(uuid,boolean,uuid)', 'public.admin_upload_cleanup_settings(jsonb,uuid)'] LOOP
        IF NOT has_function_privilege('service_role', f, 'EXECUTE') THEN RAISE EXCEPTION 'o serviço precisa executar %', f; END IF;
    END LOOP;
    IF has_table_privilege('authenticated', 'public.upload_cleanup_runs', 'SELECT') OR has_table_privilege('anon', 'public.upload_cleanup_runs', 'SELECT') THEN RAISE EXCEPTION 'a tabela de rodadas é só do serviço'; END IF;
    RAISE NOTICE 'OK 10: tudo só do serviço (app e visitante sem acesso)';
END $$;

ROLLBACK;
