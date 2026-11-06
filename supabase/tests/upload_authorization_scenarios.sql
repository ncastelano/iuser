-- Cenários da autorização de envio, cotas, ritmo e bloqueios (migration 20261130000020). Banco LOCAL (e staging), transação desfeita no final:
--   docker exec -i supabase_db_iuser-local psql -U postgres -d postgres -v ON_ERROR_STOP=1 -X < supabase/tests/upload_authorization_scenarios.sql
-- Cada cenário imprime "OK ..." ou derruba o script. Não testa concorrência real (isso está em scripts/local/test-upload-authorization.mjs).
BEGIN;

-- 0) alinha com a PRODUÇÃO: lá o bloqueio 20261106 já trocou as políticas antigas por 5. O banco local ainda traz as antigas e permissivas ("Allow authenticated upload"...),
--    que fariam o interruptor parecer inútil. As do tipo ALL ("Update/Delete Avatars"...) valem até para o papel public (inserem SEM login!). Só dentro desta transação, descarta as de
--    INSERT e ALL que não são as storage_insert_*.
DO $$
DECLARE r record; n int := 0;
BEGIN
    FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND cmd IN ('INSERT', 'ALL') AND policyname NOT LIKE 'storage\_insert\_%' LOOP
        EXECUTE format('DROP POLICY %I ON storage.objects', r.policyname); n := n + 1;
    END LOOP;
    RAISE NOTICE 'preparo: % política(s) antiga(s) de INSERT/ALL descartada(s) nesta transação', n;
END $$;

CREATE TEMP TABLE _t AS SELECT (SELECT id FROM public.profiles ORDER BY created_at LIMIT 1) AS a, (SELECT id FROM public.profiles ORDER BY created_at DESC LIMIT 1) AS b;
GRANT SELECT ON _t TO authenticated;

-- ajudantes: rodam como a pessoa (papel authenticated + JWT) e devolvem o resultado
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

CREATE FUNCTION pg_temp.ins_as(p_uid uuid, p_bucket text, p_name text) RETURNS text   -- 'ok' ou o SQLSTATE do erro (42501 = política recusou)
LANGUAGE plpgsql AS $$
BEGIN
    BEGIN
        PERFORM set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
        SET LOCAL ROLE authenticated;
        INSERT INTO storage.objects (bucket_id, name, owner, owner_id, metadata) VALUES (p_bucket, p_name, p_uid, p_uid::text, '{"size": 1234, "mimetype": "image/jpeg"}'::jsonb);
        RESET ROLE;
        RETURN 'ok';
    EXCEPTION WHEN OTHERS THEN
        RESET ROLE;
        RETURN SQLSTATE;
    END;
END $$;

-- 1) o básico: sem login, bucket fora do catálogo, caminho feliz (cria a autorização com a validade do tipo)
DO $$
DECLARE a uuid; r jsonb; g record;
BEGIN
    SELECT _t.a INTO a FROM _t;
    r := pg_temp.authz(NULL, 'avatars', 'x.jpg', 1000, 'image/jpeg');
    IF r->>'error' <> 'not_authenticated' THEN RAISE EXCEPTION 'sem login deveria ser recusado: %', r; END IF;
    r := pg_temp.authz(a, 'bucket-que-nao-existe', 'x.jpg', 1000, 'image/jpeg');
    IF (r->>'ok')::boolean IS NOT TRUE OR (r->>'controlled')::boolean IS NOT FALSE THEN RAISE EXCEPTION 'bucket fora do catálogo: ok sem controle esperado: %', r; END IF;
    r := pg_temp.authz(a, 'avatars', a || '-123.jpg', 200000, 'image/jpeg');
    IF (r->>'ok')::boolean IS NOT TRUE OR r->>'kind' <> 'avatar' THEN RAISE EXCEPTION 'caminho feliz recusado: %', r; END IF;
    SELECT * INTO g FROM public.upload_grants WHERE id = (r->>'grant')::uuid;
    IF g.profile_id <> a OR g.declared_bytes <> 200000 OR g.bucket <> 'avatars' OR g.key <> a || '-123.jpg' OR g.used_at IS NOT NULL THEN RAISE EXCEPTION 'autorização gravada errada: %', row_to_json(g); END IF;
    IF g.expires_at < now() + interval '14 minutes' OR g.expires_at > now() + interval '16 minutes' THEN RAISE EXCEPTION 'validade fora de 15 min: %', g.expires_at; END IF;
    RAISE NOTICE 'OK 1: sem login recusa; bucket fora do catálogo passa sem controle; caminho feliz grava a autorização (15 min)';
END $$;

-- 2) tipo, vazio, grande demais, caminho e pasta
DO $$
DECLARE a uuid; r jsonb; p text;
BEGIN
    SELECT _t.a INTO a FROM _t;
    IF pg_temp.authz(a, 'avatars', 'a1.png', 1000, 'image/svg+xml')->>'error' <> 'type_not_allowed' THEN RAISE EXCEPTION 'svg deveria ser recusado'; END IF;
    IF pg_temp.authz(a, 'avatars', 'a2.png', 1000, 'IMAGE/HEIC')->>'error' <> 'type_not_allowed' THEN RAISE EXCEPTION 'heic deveria ser recusado'; END IF;
    IF (pg_temp.authz(a, 'avatars', 'a3.png', 1000, ' IMAGE/PNG ')->>'ok')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'tipo com maiúsculas/espaços deveria passar'; END IF;
    IF pg_temp.authz(a, 'avatars', 'a4.png', 0, 'image/png')->>'error' <> 'empty_file' THEN RAISE EXCEPTION 'vazio deveria ser recusado'; END IF;
    IF pg_temp.authz(a, 'avatars', 'a5.png', NULL, 'image/png')->>'error' <> 'empty_file' THEN RAISE EXCEPTION 'tamanho nulo deveria ser recusado'; END IF;
    r := pg_temp.authz(a, 'avatars', 'a6.png', 5242881, 'image/png');
    IF r->>'error' <> 'too_large' OR (r->>'limit')::bigint <> 5242880 THEN RAISE EXCEPTION 'grande demais: %', r; END IF;
    IF (pg_temp.authz(a, 'avatars', 'a7.png', 5242880, 'image/png')->>'ok')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'exatamente no limite deveria passar'; END IF;
    FOREACH p IN ARRAY ARRAY['', '../x.jpg', 'a/../b.jpg', '/x.jpg', 'x/', E'a\\b.jpg', E'a\nb.jpg', repeat('x', 401)] LOOP
        IF pg_temp.authz(a, 'avatars', p, 1000, 'image/png')->>'error' <> 'invalid_path' THEN RAISE EXCEPTION 'caminho inválido passou: [%]', p; END IF;
    END LOOP;
    IF pg_temp.authz(a, 'community-photos', 'outra-pessoa/x.jpg', 1000, 'image/png')->>'error' <> 'wrong_folder' THEN RAISE EXCEPTION 'pasta de outra pessoa deveria ser recusada'; END IF;
    IF pg_temp.authz(a, 'community-photos', 'sem-pasta.jpg', 1000, 'image/png')->>'error' <> 'wrong_folder' THEN RAISE EXCEPTION 'sem pasta deveria ser recusado'; END IF;
    IF (pg_temp.authz(a, 'community-photos', a || '/x.jpg', 1000, 'image/png')->>'ok')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'pasta própria deveria passar'; END IF;
    IF pg_temp.authz(a, 'flash-media', a || '/v.mp4', 15728641, 'video/mp4')->>'error' <> 'too_large' THEN RAISE EXCEPTION 'flash acima de 15 MB'; END IF;
    IF (pg_temp.authz(a, 'flash-media', a || '/v.mp4', 15728640, 'video/mp4')->>'ok')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'flash de vídeo até 15 MB deveria passar'; END IF;
    IF (pg_temp.authz(a, 'digital-files', a || '/p/aula.pdf', 52428800, 'application/pdf')->>'ok')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'digital (curso/e-book/arquivos, até 50 MB) deveria passar'; END IF;
    IF pg_temp.authz(a, 'digital-files', a || '/p/aula.pdf', 52428801, 'application/pdf')->>'error' <> 'too_large' THEN RAISE EXCEPTION 'digital acima de 50 MB deveria ser recusado'; END IF;
    RAISE NOTICE 'OK 2: tipo, vazio, tamanho (no limite passa, 1 byte a mais não), caminhos inválidos e pasta própria';
END $$;

-- 3) trocar arquivo (upsert) só se é seu
DO $$
DECLARE a uuid; b uuid; r jsonb;
BEGIN
    SELECT _t.a, _t.b INTO a, b FROM _t;
    IF a = b THEN RAISE EXCEPTION 'preciso de duas pessoas'; END IF;
    INSERT INTO storage.objects (bucket_id, name, owner, owner_id, metadata) VALUES ('product-images', 'tst-up/dele.jpg', b, b::text, '{"size": 10}'::jsonb);
    INSERT INTO storage.objects (bucket_id, name, owner, owner_id, metadata) VALUES ('product-images', 'tst-up/meu.jpg', a, a::text, '{"size": 10}'::jsonb);
    IF pg_temp.authz(a, 'product-images', 'tst-up/dele.jpg', 1000, 'image/jpeg', true)->>'error' <> 'not_owner' THEN RAISE EXCEPTION 'trocar arquivo de outra pessoa deveria ser recusado'; END IF;
    IF (pg_temp.authz(a, 'product-images', 'tst-up/dele.jpg', 1000, 'image/jpeg', false)->>'ok')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'sem upsert quem recusa é o Storage (409); aqui passa'; END IF;
    IF (pg_temp.authz(a, 'product-images', 'tst-up/meu.jpg', 1000, 'image/jpeg', true)->>'ok')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'trocar o próprio arquivo deveria passar'; END IF;
    RAISE NOTICE 'OK 3: upsert só sobre arquivo próprio';
END $$;

-- 4) ritmo: N arquivos por hora, por pessoa e tipo, com "tente de novo em"
DO $$
DECLARE a uuid; b uuid; r jsonb; i int;
BEGIN
    SELECT _t.a, _t.b INTO a, b FROM _t;
    UPDATE public.upload_kinds SET per_hour_files = 3 WHERE kind = 'store_logo';
    FOR i IN 1..3 LOOP
        IF (pg_temp.authz(a, 'store-logos', 'logo-' || i || '.png', 1000, 'image/png')->>'ok')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'envio % deveria passar', i; END IF;
    END LOOP;
    r := pg_temp.authz(a, 'store-logos', 'logo-4.png', 1000, 'image/png');
    IF r->>'error' <> 'rate_limited' OR (r->>'limit')::int <> 3 OR (r->>'retry_after')::int NOT BETWEEN 1 AND 3600 THEN RAISE EXCEPTION 'o 4º deveria ser recusado por ritmo: %', r; END IF;
    IF (pg_temp.authz(b, 'store-logos', 'logo-b1.png', 1000, 'image/png')->>'ok')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'outra pessoa não pode ser afetada'; END IF;
    IF (pg_temp.authz(a, 'avatars', a || '-99.jpg', 1000, 'image/png')->>'ok')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'outro tipo da mesma pessoa não pode ser afetado'; END IF;
    UPDATE public.upload_grants SET created_at = now() - interval '61 minutes' WHERE profile_id = a AND kind = 'store_logo';
    IF (pg_temp.authz(a, 'store-logos', 'logo-5.png', 1000, 'image/png')->>'ok')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'passada 1 hora o ritmo deveria liberar'; END IF;
    UPDATE public.upload_kinds SET per_hour_files = NULL WHERE kind = 'store_logo';
    FOR i IN 1..10 LOOP
        IF (pg_temp.authz(a, 'store-logos', 'livre-' || i || '.png', 1000, 'image/png')->>'ok')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'sem limite (NULL) nada deveria barrar'; END IF;
    END LOOP;
    UPDATE public.upload_kinds SET per_hour_files = 30 WHERE kind = 'store_logo';          -- volta ao valor da migration
    RAISE NOTICE 'OK 4: ritmo por hora (por pessoa e tipo; libera depois de 1 h; NULL = sem limite)';
END $$;

-- 5) cota do dia (usa o tamanho REAL quando já foi registrado) e cota total (conta o que já existe e desconta a troca do mesmo caminho)
DO $$
DECLARE a uuid; r jsonb; v_grant uuid;
BEGIN
    SELECT _t.a INTO a FROM _t;
    UPDATE public.upload_kinds SET per_day_bytes = 1000000 WHERE kind = 'driver_selfie';
    r := pg_temp.authz(a, 'driver-selfie-photos', a || '/s1.jpg', 600000, 'image/jpeg');
    IF (r->>'ok')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'primeiro envio do dia deveria passar: %', r; END IF;
    v_grant := (r->>'grant')::uuid;
    r := pg_temp.authz(a, 'driver-selfie-photos', a || '/s2.jpg', 600000, 'image/jpeg');
    IF r->>'error' <> 'daily_quota' OR (r->>'limit')::bigint <> 1000000 OR (r->>'used')::bigint <> 600000 THEN RAISE EXCEPTION 'cota do dia: %', r; END IF;
    UPDATE public.upload_grants SET actual_bytes = 100 WHERE id = v_grant;    -- o arquivo real era bem menor que o declarado
    IF (pg_temp.authz(a, 'driver-selfie-photos', a || '/s3.jpg', 600000, 'image/jpeg')->>'ok')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'com o tamanho real (100 B) a cota deveria liberar'; END IF;

    UPDATE public.upload_kinds SET per_user_bytes = 500000 WHERE kind = 'background';
    INSERT INTO public.media_assets (owner_id, kind, provider, bucket, key, bytes, mime) VALUES (a, 'background', 'supabase', 'backgrounds', 'bg-existente.jpg', 400000, 'image/jpeg');
    r := pg_temp.authz(a, 'backgrounds', 'bg-novo.jpg', 200000, 'image/jpeg');
    IF r->>'error' <> 'storage_quota' OR (r->>'used')::bigint <> 400000 THEN RAISE EXCEPTION 'cota total: %', r; END IF;
    IF (pg_temp.authz(a, 'backgrounds', 'bg-existente.jpg', 200000, 'image/jpeg', true)->>'ok')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'trocar o mesmo caminho não pode contar em dobro'; END IF;
    UPDATE public.media_assets SET state = 'deleted' WHERE key = 'bg-existente.jpg';
    IF (pg_temp.authz(a, 'backgrounds', 'bg-novo2.jpg', 200000, 'image/jpeg')->>'ok')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'arquivo apagado não conta na cota total'; END IF;
    UPDATE public.upload_kinds SET per_day_bytes = 52428800 WHERE kind = 'driver_selfie';  -- volta aos valores da migration
    UPDATE public.upload_kinds SET per_user_bytes = 209715200 WHERE kind = 'background';
    RAISE NOTICE 'OK 5: cota do dia (tamanho real vence o declarado) e cota total (conta o existente, a troca não duplica, apagado não conta)';
END $$;

-- 6) bloqueios: pessoa, tipo para todos, pessoa+tipo, com prazo e levantado; conta bloqueada
DO $$
DECLARE a uuid; b uuid; r jsonb; v_blk uuid; v_old boolean;
BEGIN
    SELECT _t.a, _t.b INTO a, b FROM _t;
    v_blk := public.admin_upload_block(a, NULL, 'envio de spam', 2, NULL);
    r := pg_temp.authz(a, 'avatars', a || '-b1.jpg', 1000, 'image/png');
    IF r->>'error' <> 'blocked' OR r->>'reason' <> 'envio de spam' THEN RAISE EXCEPTION 'pessoa bloqueada: %', r; END IF;
    IF pg_temp.authz(a, 'product-images', 'b2.jpg', 1000, 'image/png')->>'error' <> 'blocked' THEN RAISE EXCEPTION 'bloqueio da pessoa vale para todos os tipos'; END IF;
    IF (pg_temp.authz(b, 'avatars', b || '-b1.jpg', 1000, 'image/png')->>'ok')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'outra pessoa não pode ser bloqueada junto'; END IF;
    IF NOT public.admin_upload_unblock(v_blk, NULL) THEN RAISE EXCEPTION 'unblock deveria devolver true'; END IF;
    IF public.admin_upload_unblock(v_blk, NULL) THEN RAISE EXCEPTION 'unblock repetido deveria devolver false'; END IF;
    IF (pg_temp.authz(a, 'avatars', a || '-b3.jpg', 1000, 'image/png')->>'ok')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'depois de liberar deveria passar'; END IF;

    PERFORM public.admin_upload_block(NULL, 'avatar', 'manutenção', NULL, NULL);       -- o tipo inteiro, para todos
    IF pg_temp.authz(a, 'avatars', a || '-b4.jpg', 1000, 'image/png')->>'error' <> 'blocked' OR pg_temp.authz(b, 'avatars', b || '-b4.jpg', 1000, 'image/png')->>'error' <> 'blocked' THEN RAISE EXCEPTION 'tipo bloqueado vale para todos'; END IF;
    IF (pg_temp.authz(a, 'backgrounds', 'b5.jpg', 1000, 'image/png')->>'ok')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'tipo bloqueado não pode afetar outros tipos'; END IF;
    UPDATE public.upload_blocks SET lifted_at = now() WHERE kind = 'avatar';

    v_blk := public.admin_upload_block(b, 'background', NULL, 1, NULL);                 -- pessoa + tipo
    IF pg_temp.authz(b, 'backgrounds', 'b6.jpg', 1000, 'image/png')->>'error' <> 'blocked' THEN RAISE EXCEPTION 'pessoa+tipo'; END IF;
    IF (pg_temp.authz(b, 'avatars', b || '-b6.jpg', 1000, 'image/png')->>'ok')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'pessoa+tipo não pode bloquear outros tipos'; END IF;
    UPDATE public.upload_blocks SET blocked_until = now() - interval '1 minute' WHERE id = v_blk;
    IF (pg_temp.authz(b, 'backgrounds', 'b7.jpg', 1000, 'image/png')->>'ok')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'bloqueio vencido não vale'; END IF;

    BEGIN PERFORM public.admin_upload_block(NULL, NULL, 'x', 1, NULL); RAISE EXCEPTION 'bloqueio sem pessoa e sem tipo deveria falhar';
    EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
    BEGIN PERFORM public.admin_upload_block(a, 'tipo-que-nao-existe', 'x', 1, NULL); RAISE EXCEPTION 'tipo desconhecido deveria falhar';
    EXCEPTION WHEN invalid_parameter_value THEN NULL; END;

    UPDATE public.profiles SET is_blocked = true WHERE id = b;
    IF pg_temp.authz(b, 'avatars', b || '-b8.jpg', 1000, 'image/png')->>'error' <> 'account_blocked' THEN RAISE EXCEPTION 'conta bloqueada deveria ser recusada'; END IF;
    UPDATE public.profiles SET is_blocked = false WHERE id = b;
    RAISE NOTICE 'OK 6: bloqueio de pessoa, de tipo (todos), de pessoa+tipo, com prazo, levantado, conta bloqueada; argumentos inválidos';
END $$;

-- 7) plano exigido, tipo desligado e provedor ainda não pronto
DO $$
DECLARE a uuid; v_noplan uuid; v_plan uuid;
BEGIN
    SELECT p.id INTO v_noplan FROM public.profiles p JOIN auth.users u ON u.id = p.id, LATERAL public.get_active_plan_grants(p.id) g
    WHERE NOT (g.has_driver OR g.has_provider OR g.has_store OR g.has_recruiter) AND u.email <> 'ncastelano@gmail.com' LIMIT 1;
    SELECT p.id INTO v_plan FROM public.profiles p, LATERAL public.get_active_plan_grants(p.id) g
    WHERE (g.has_driver OR g.has_provider OR g.has_store OR g.has_recruiter) LIMIT 1;
    SELECT _t.a INTO a FROM _t;
    UPDATE public.upload_kinds SET requires_plan = true WHERE kind = 'post_image';
    IF v_noplan IS NOT NULL THEN
        IF pg_temp.authz(v_noplan, 'posts', v_noplan || '/p.jpg', 1000, 'image/png')->>'error' <> 'plan_required' THEN RAISE EXCEPTION 'sem plano deveria ser recusado'; END IF;
    ELSE RAISE NOTICE 'aviso: nenhum perfil sem plano no banco; cenário "sem plano" pulado'; END IF;
    IF v_plan IS NOT NULL THEN
        IF (pg_temp.authz(v_plan, 'posts', v_plan || '/p.jpg', 1000, 'image/png')->>'ok')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'com plano deveria passar'; END IF;
    ELSE RAISE NOTICE 'aviso: nenhum perfil com plano no banco; cenário "com plano" pulado'; END IF;
    UPDATE public.upload_kinds SET requires_plan = false WHERE kind = 'post_image';

    UPDATE public.upload_kinds SET enabled = false WHERE kind = 'mural_image';
    IF pg_temp.authz(a, 'mural-images', 'm.jpg', 1000, 'image/png')->>'error' <> 'kind_disabled' THEN RAISE EXCEPTION 'tipo desligado deveria ser recusado'; END IF;
    UPDATE public.upload_kinds SET enabled = true WHERE kind = 'mural_image';
    UPDATE public.upload_kinds SET provider = 'r2' WHERE kind = 'mural_image';
    IF pg_temp.authz(a, 'mural-images', 'm.jpg', 1000, 'image/png')->>'error' <> 'wrong_provider' THEN RAISE EXCEPTION 'provedor não pronto deveria ser recusado'; END IF;
    UPDATE public.upload_kinds SET provider = 'supabase' WHERE kind = 'mural_image';
    RAISE NOTICE 'OK 7: plano exigido (sem plano recusa, com plano passa), tipo desligado, provedor que não é o Supabase';
END $$;

-- 8) A POLÍTICA DO STORAGE: com o interruptor desligado o envio direto passa (como hoje); ligado, só com autorização válida para o caminho exato
DO $$
DECLARE a uuid; r jsonb; v_grant uuid;
BEGIN
    SELECT _t.a INTO a FROM _t;
    IF (SELECT signed_required FROM public.upload_settings) IS NOT FALSE THEN RAISE EXCEPTION 'o padrão do interruptor deve ser DESLIGADO'; END IF;
    IF pg_temp.ins_as(a, 'avatars', a || '-direto1.jpg') <> 'ok' THEN RAISE EXCEPTION 'com o interruptor desligado o envio direto deveria passar'; END IF;
    IF pg_temp.ins_as(a, 'community-photos', a || '/direto1.jpg') <> 'ok' THEN RAISE EXCEPTION 'desligado: pasta própria deveria passar'; END IF;

    IF NOT public.admin_upload_set_enforced(true, NULL) THEN RAISE EXCEPTION 'set_enforced devolve o novo valor'; END IF;
    IF pg_temp.ins_as(a, 'avatars', a || '-direto2.jpg') <> '42501' THEN RAISE EXCEPTION 'ligado e SEM autorização, o envio direto deveria ser recusado pela política'; END IF;
    IF pg_temp.ins_as(a, 'community-photos', a || '/direto2.jpg') <> '42501' THEN RAISE EXCEPTION 'ligado: pasta própria também exige autorização'; END IF;
    IF pg_temp.ins_as(a, 'flash-media', a || '/direto2.mp4') <> '42501' OR pg_temp.ins_as(a, 'delivery-proofs', a || '/direto2.jpg') <> '42501' OR pg_temp.ins_as(a, 'digital-files', a || '/p/direto2.pdf') <> '42501' THEN
        RAISE EXCEPTION 'ligado: flash, provas e digitais também exigem autorização';
    END IF;

    r := pg_temp.authz(a, 'avatars', a || '-direto2.jpg', 1000, 'image/jpeg');
    v_grant := (r->>'grant')::uuid;
    IF pg_temp.ins_as(a, 'avatars', a || '-direto2.jpg') <> 'ok' THEN RAISE EXCEPTION 'com autorização válida o envio deveria passar'; END IF;
    IF pg_temp.ins_as(a, 'avatars', a || '-outro-caminho.jpg') <> '42501' THEN RAISE EXCEPTION 'a autorização vale só para o caminho exato'; END IF;
    PERFORM pg_temp.authz(a, 'flash-media', a || '/f.mp4', 1000, 'video/mp4');
    IF pg_temp.ins_as(a, 'flash-media', a || '/f.mp4') <> 'ok' THEN RAISE EXCEPTION 'flash com autorização deveria passar'; END IF;

    PERFORM pg_temp.authz(a, 'avatars', a || '-vencida.jpg', 1000, 'image/jpeg');
    UPDATE public.upload_grants SET expires_at = now() - interval '1 second' WHERE profile_id = a AND key = a || '-vencida.jpg';
    IF pg_temp.ins_as(a, 'avatars', a || '-vencida.jpg') <> '42501' THEN RAISE EXCEPTION 'autorização vencida não vale'; END IF;

    -- registrar o arquivo fecha a autorização (tamanho real + usada) e ela não vale mais
    PERFORM set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    PERFORM public.register_media_asset('avatars', a || '-direto2.jpg');
    RESET ROLE;
    IF NOT EXISTS (SELECT 1 FROM public.upload_grants WHERE id = v_grant AND used_at IS NOT NULL AND actual_bytes = 1234) THEN RAISE EXCEPTION 'registrar deveria marcar a autorização como usada e guardar o tamanho real'; END IF;
    IF (SELECT bytes FROM public.media_assets WHERE bucket = 'avatars' AND key = a || '-direto2.jpg') <> 1234 THEN RAISE EXCEPTION 'tamanho do registro deveria vir do Storage'; END IF;

    IF public.admin_upload_set_enforced(false, NULL) THEN RAISE EXCEPTION 'desligar devolve false'; END IF;
    IF pg_temp.ins_as(a, 'avatars', a || '-direto3.jpg') <> 'ok' THEN RAISE EXCEPTION 'desligado de novo, o envio direto volta a passar'; END IF;
    IF (SELECT count(*) FROM public.admin_config_audit WHERE scope = 'upload_settings' AND setting = 'signed_required') < 2 THEN RAISE EXCEPTION 'ligar e desligar deveriam ter gravado a auditoria'; END IF;
    RAISE NOTICE 'OK 8: política do Storage (desligado: direto passa; ligado: só com autorização válida do caminho exato; vencida/usada não vale; auditoria gravada)';
END $$;

-- 9) administração: editar limites (com sincronia do limite do bucket), campo inválido, auditoria, limpeza
DO $$
DECLARE a uuid; n public.upload_kinds; v_n int; v_lim bigint;
BEGIN
    SELECT _t.a INTO a FROM _t;
    n := public.admin_upload_update_kind('store_link_image', '{"per_hour_files": 5, "max_bytes": 1000000, "requires_plan": true}'::jsonb, NULL);
    IF n.per_hour_files <> 5 OR n.max_bytes <> 1000000 OR n.requires_plan IS NOT TRUE THEN RAISE EXCEPTION 'update_kind não aplicou: %', row_to_json(n); END IF;
    SELECT file_size_limit INTO v_lim FROM storage.buckets WHERE id = 'store-links';
    IF v_lim <> 1000000 THEN RAISE EXCEPTION 'o limite do bucket deveria acompanhar o catálogo (%)', v_lim; END IF;
    IF (SELECT count(*) FROM public.admin_config_audit WHERE scope = 'upload_kinds' AND setting LIKE 'store_link_image.%') <> 3 THEN RAISE EXCEPTION 'cada campo alterado deveria gerar uma linha de auditoria'; END IF;
    n := public.admin_upload_update_kind('store_link_image', '{"per_hour_files": null}'::jsonb, NULL);
    IF n.per_hour_files IS NOT NULL THEN RAISE EXCEPTION 'null deveria limpar o limite'; END IF;
    BEGIN PERFORM public.admin_upload_update_kind('store_link_image', '{"bucket": "outro"}'::jsonb, NULL); RAISE EXCEPTION 'campo fora da lista deveria falhar';
    EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
    BEGIN PERFORM public.admin_upload_update_kind('nao-existe', '{}'::jsonb, NULL); RAISE EXCEPTION 'tipo desconhecido deveria falhar';
    EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
    BEGIN PERFORM public.admin_upload_update_kind('store_link_image', '{"max_bytes": 0}'::jsonb, NULL); RAISE EXCEPTION 'tamanho zero deveria falhar';
    EXCEPTION WHEN check_violation THEN NULL; END;

    INSERT INTO public.upload_grants (profile_id, kind, bucket, key, declared_bytes, created_at, expires_at) VALUES (a, 'avatar', 'avatars', 'velha.jpg', 10, now() - interval '9 days', now() - interval '9 days');
    INSERT INTO public.upload_grants (profile_id, kind, bucket, key, declared_bytes, created_at, expires_at) VALUES (a, 'avatar', 'avatars', 'recente.jpg', 10, now() - interval '2 days', now() - interval '2 days');
    v_n := public.upload_grants_purge();
    IF v_n < 1 OR EXISTS (SELECT 1 FROM public.upload_grants WHERE key = 'velha.jpg') OR NOT EXISTS (SELECT 1 FROM public.upload_grants WHERE key = 'recente.jpg') THEN RAISE EXCEPTION 'limpeza: só as de mais de 8 dias saem (% removidas)', v_n; END IF;
    RAISE NOTICE 'OK 9: editar limites sincroniza o bucket e audita cada campo; campo inválido/zero/tipo desconhecido falham; limpeza de 8 dias';
END $$;

-- 10) permissões: o app não toca nas tabelas nem nas funções de administração; só as funções de apoio e a autorização
DO $$
BEGIN
    IF has_table_privilege('authenticated', 'public.upload_grants', 'SELECT') OR has_table_privilege('authenticated', 'public.upload_blocks', 'SELECT')
       OR has_table_privilege('authenticated', 'public.upload_settings', 'SELECT') OR has_table_privilege('anon', 'public.upload_grants', 'SELECT')
       OR has_table_privilege('authenticated', 'public.upload_kinds', 'UPDATE') THEN
        RAISE EXCEPTION 'o app não deveria ter acesso direto às tabelas';
    END IF;
    IF has_function_privilege('authenticated', 'public.admin_upload_set_enforced(boolean,uuid)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.admin_upload_block(uuid,text,text,integer,uuid)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.admin_upload_unblock(uuid,uuid)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.admin_upload_update_kind(text,jsonb,uuid)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.upload_grants_purge()', 'EXECUTE')
       OR has_function_privilege('anon', 'public.admin_upload_set_enforced(boolean,uuid)', 'EXECUTE') THEN
        RAISE EXCEPTION 'as funções de administração são só do serviço';
    END IF;
    IF has_function_privilege('anon', 'public.authorize_upload(text,text,bigint,text,boolean)', 'EXECUTE') OR has_function_privilege('anon', 'public._has_upload_grant(text,text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'anon não autoriza envio';
    END IF;
    IF NOT has_function_privilege('authenticated', 'public.authorize_upload(text,text,bigint,text,boolean)', 'EXECUTE') THEN RAISE EXCEPTION 'authenticated deve poder pedir autorização'; END IF;
    RAISE NOTICE 'OK 10: permissões (sem acesso direto às tabelas; administração só do serviço; anon fora)';
END $$;

-- 11) o catálogo ainda bate com os buckets (inclusive depois das edições deste teste) e todo tipo tem os limites preenchidos
DO $$
DECLARE r record;
BEGIN
    FOR r IN SELECT k.kind, k.max_bytes, b.file_size_limit FROM public.upload_kinds k JOIN storage.buckets b ON b.id = k.bucket WHERE k.provider = 'supabase' LOOP
        IF r.max_bytes IS DISTINCT FROM r.file_size_limit THEN RAISE EXCEPTION 'tipo %: catálogo % x bucket %', r.kind, r.max_bytes, r.file_size_limit; END IF;
    END LOOP;
    IF EXISTS (SELECT 1 FROM public.upload_kinds WHERE kind <> 'store_link_image' AND (per_hour_files IS NULL OR per_day_bytes IS NULL OR per_user_bytes IS NULL)) THEN
        RAISE EXCEPTION 'todo tipo deve nascer com ritmo e cotas';
    END IF;
    IF EXISTS (SELECT 1 FROM public.upload_kinds WHERE per_day_bytes < max_bytes OR per_user_bytes < per_day_bytes) THEN
        RAISE EXCEPTION 'cotas incoerentes: a do dia deve caber ao menos um arquivo máximo e a total ao menos a do dia';
    END IF;
    RAISE NOTICE 'OK 11: catálogo e buckets batem; todo tipo tem ritmo e cotas coerentes';
END $$;

ROLLBACK;
