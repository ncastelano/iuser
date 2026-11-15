-- Cenários do envio pelo R2 (migration 20261130000023). Banco LOCAL (e staging), transação desfeita no final:
--   docker exec -i supabase_db_iuser-local psql -U postgres -d postgres -v ON_ERROR_STOP=1 -X < supabase/tests/upload_r2_scenarios.sql
BEGIN;

CREATE TEMP TABLE _t AS SELECT (SELECT id FROM public.profiles ORDER BY created_at LIMIT 1) AS a, (SELECT id FROM public.profiles ORDER BY created_at DESC LIMIT 1) AS b;
GRANT SELECT ON _t TO authenticated;

CREATE FUNCTION pg_temp.authz(p_uid uuid, p_bucket text, p_path text, p_bytes bigint, p_mime text) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE r jsonb;
BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    r := public.authorize_upload(p_bucket, p_path, p_bytes, p_mime, false);
    RESET ROLE;
    RETURN r;
END $$;

-- isolamento: o tipo começa desligado e sem atividade anterior
DELETE FROM public.upload_grants WHERE kind = 'media_r2';
DELETE FROM public.media_assets WHERE provider = 'r2';

-- 1) o tipo nasce DESLIGADO e o provedor 'r2' já não é "wrong_provider"
DO $$
DECLARE a uuid; r jsonb; k public.upload_kinds%ROWTYPE;
BEGIN
    SELECT _t.a INTO a FROM _t;
    SELECT * INTO k FROM public.upload_kinds WHERE kind = 'media_r2';
    IF NOT FOUND OR k.provider <> 'r2' OR k.bucket <> 'iuser-media' OR NOT k.owner_folder OR NOT k.cleanup_eligible THEN RAISE EXCEPTION 'tipo media_r2 errado: %', row_to_json(k); END IF;
    IF k.enabled THEN RAISE EXCEPTION 'media_r2 deveria nascer desligado'; END IF;
    r := pg_temp.authz(a, 'iuser-media', a || '/x.mp4', 1000, 'video/mp4');
    IF r->>'error' <> 'kind_disabled' THEN RAISE EXCEPTION 'desligado deveria recusar: %', r; END IF;
    RAISE NOTICE 'OK 1: media_r2 existe (r2, privado, pasta própria, elegível à limpeza só para vídeo), nasce desligado e o provedor r2 é reconhecido';
END $$;

-- 2) ligado: as regras de sempre valem (tipo, tamanho, pasta, ritmo, bloqueio) e o caminho feliz grava a autorização
UPDATE public.upload_kinds SET enabled = true, per_hour_files = 2 WHERE kind = 'media_r2';
DO $$
DECLARE a uuid; b uuid; r jsonb; g record;
BEGIN
    SELECT _t.a, _t.b INTO a, b FROM _t;
    r := pg_temp.authz(a, 'iuser-media', a || '/x.mp4', 50000000, 'video/mp4');
    IF (r->>'ok')::boolean IS NOT TRUE OR r->>'kind' <> 'media_r2' OR (r->>'expires_in')::int <> 3600 THEN RAISE EXCEPTION 'caminho feliz recusado: %', r; END IF;
    SELECT * INTO g FROM public.upload_grants WHERE id = (r->>'grant')::uuid;
    IF g.profile_id <> a OR g.bucket <> 'iuser-media' OR g.key <> a || '/x.mp4' OR g.declared_bytes <> 50000000 THEN RAISE EXCEPTION 'autorização gravada errada: %', row_to_json(g); END IF;
    IF pg_temp.authz(a, 'iuser-media', a || '/i.jpg', 1000, 'image/jpeg')->>'error' <> 'type_not_allowed' THEN RAISE EXCEPTION 'imagem não é deste tipo'; END IF;
    IF pg_temp.authz(a, 'iuser-media', a || '/h.html', 1000, 'text/html')->>'error' <> 'type_not_allowed' THEN RAISE EXCEPTION 'html recusado'; END IF;
    IF pg_temp.authz(a, 'iuser-media', a || '/g.mp4', 209715201, 'video/mp4')->>'error' <> 'too_large' THEN RAISE EXCEPTION 'acima do máximo recusado'; END IF;
    IF pg_temp.authz(a, 'iuser-media', a || '/e.mp4', 0, 'video/mp4')->>'error' <> 'empty_file' THEN RAISE EXCEPTION 'vazio recusado'; END IF;
    IF pg_temp.authz(a, 'iuser-media', b || '/y.mp4', 1000, 'video/mp4')->>'error' <> 'wrong_folder' THEN RAISE EXCEPTION 'pasta de outra pessoa recusada'; END IF;
    IF pg_temp.authz(a, 'iuser-media', a || '/../' || b || '/y.mp4', 1000, 'video/mp4')->>'error' NOT IN ('invalid_path', 'wrong_folder') THEN RAISE EXCEPTION 'caminho com .. recusado'; END IF;
    -- ritmo: 2 por hora (um já foi usado acima) → o 2º passa e o 3º é barrado
    IF (pg_temp.authz(a, 'iuser-media', a || '/r2.mp4', 1000, 'video/mp4')->>'ok')::boolean IS NOT TRUE THEN RAISE EXCEPTION '2º envio da hora deveria passar'; END IF;
    IF pg_temp.authz(a, 'iuser-media', a || '/r3.mp4', 1000, 'video/mp4')->>'error' <> 'rate_limited' THEN RAISE EXCEPTION '3º envio da hora deveria ser barrado'; END IF;
    RAISE NOTICE 'OK 2: ligado, vale tipo, tamanho, vazio, pasta própria, caminho e ritmo; a autorização guarda o caminho exato';
END $$;

-- 3) bloqueio vale também no R2
DO $$
DECLARE b uuid; r jsonb;
BEGIN
    SELECT _t.b INTO b FROM _t;
    PERFORM public.admin_upload_block(b, 'media_r2', 'teste', 1, NULL);
    r := pg_temp.authz(b, 'iuser-media', b || '/z.mp4', 1000, 'video/mp4');
    IF r->>'error' <> 'blocked' THEN RAISE EXCEPTION 'bloqueio deveria valer: %', r; END IF;
    RAISE NOTICE 'OK 3: pessoa bloqueada no tipo é recusada também no R2';
END $$;

-- 4) o caminho do Supabase não mudou (avatar continua autorizado e controlado)
DO $$
DECLARE a uuid; r jsonb;
BEGIN
    SELECT _t.a INTO a FROM _t;
    r := pg_temp.authz(a, 'avatars', a || '-9.jpg', 1000, 'image/jpeg');
    IF (r->>'ok')::boolean IS NOT TRUE OR r->>'kind' <> 'avatar' THEN RAISE EXCEPTION 'supabase mudou: %', r; END IF;
    RAISE NOTICE 'OK 4: o caminho do Supabase continua igual';
END $$;

-- 5) register_r2_asset: só com autorização válida do mesmo caminho; registra com o tamanho REAL; fecha a autorização; repetir não vale
DO $$
DECLARE a uuid; b uuid; r jsonb; v_id uuid; v_id2 uuid; m record; g record; msg text;
BEGIN
    SELECT _t.a, _t.b INTO a, b FROM _t;
    UPDATE public.upload_kinds SET per_hour_files = NULL WHERE kind = 'media_r2';
    r := pg_temp.authz(a, 'iuser-media', a || '/ok.mp4', 90000000, 'video/mp4');
    v_id := public.register_r2_asset(a, 'media_r2', a || '/ok.mp4', 80000000, 'video/mp4');
    SELECT * INTO m FROM public.media_assets WHERE id = v_id;
    IF m.provider <> 'r2' OR m.bucket <> 'iuser-media' OR m.key <> a || '/ok.mp4' OR m.bytes <> 80000000 OR m.mime <> 'video/mp4' OR m.owner_id <> a OR m.state <> 'ready' OR m.kind <> 'media_r2' THEN RAISE EXCEPTION 'registro errado: %', row_to_json(m); END IF;
    SELECT * INTO g FROM public.upload_grants WHERE id = (r->>'grant')::uuid;
    IF g.used_at IS NULL OR g.actual_bytes <> 80000000 THEN RAISE EXCEPTION 'autorização deveria fechar com o tamanho real: %', row_to_json(g); END IF;

    -- sem autorização (ou já usada): recusa
    BEGIN PERFORM public.register_r2_asset(a, 'media_r2', a || '/ok.mp4', 80000000, 'video/mp4'); RAISE EXCEPTION 'segundo registro deveria falhar';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN PERFORM public.register_r2_asset(a, 'media_r2', a || '/sem-grant.mp4', 1000, 'video/mp4'); RAISE EXCEPTION 'sem autorização deveria falhar';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    -- autorização de outra pessoa não vale
    PERFORM pg_temp.authz(a, 'iuser-media', a || '/dela.mp4', 1000, 'video/mp4');
    BEGIN PERFORM public.register_r2_asset(b, 'media_r2', a || '/dela.mp4', 1000, 'video/mp4'); RAISE EXCEPTION 'registrar na pasta de outro deveria falhar';
    EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
    -- tamanho real acima do máximo, tipo errado, tipo desconhecido, caminho ruim
    PERFORM pg_temp.authz(a, 'iuser-media', a || '/real.mp4', 1000, 'video/mp4');
    FOREACH msg IN ARRAY ARRAY['too_large', 'type_not_allowed', 'unknown_kind', 'invalid_key'] LOOP
        BEGIN
            IF msg = 'too_large' THEN PERFORM public.register_r2_asset(a, 'media_r2', a || '/real.mp4', 209715201, 'video/mp4');
            ELSIF msg = 'type_not_allowed' THEN PERFORM public.register_r2_asset(a, 'media_r2', a || '/real.mp4', 1000, 'text/html');
            ELSIF msg = 'unknown_kind' THEN PERFORM public.register_r2_asset(a, 'avatar', a || '/real.mp4', 1000, 'video/mp4');
            ELSE PERFORM public.register_r2_asset(a, 'media_r2', a || '/../x.mp4', 1000, 'video/mp4'); END IF;
            RAISE EXCEPTION 'deveria falhar com %', msg;
        EXCEPTION WHEN invalid_parameter_value THEN
            GET STACKED DIAGNOSTICS msg = MESSAGE_TEXT; IF msg NOT IN ('too_large', 'type_not_allowed', 'unknown_kind', 'invalid_key') THEN RAISE; END IF;
        END;
    END LOOP;
    -- depois das recusas a autorização de /real.mp4 continua aberta (nada foi registrado)
    IF EXISTS (SELECT 1 FROM public.media_assets WHERE key = a || '/real.mp4') THEN RAISE EXCEPTION 'recusas não podem registrar'; END IF;
    RAISE NOTICE 'OK 5: registrar exige autorização do mesmo caminho e pessoa, guarda o tamanho real, fecha a autorização e recusa tamanho, tipo, tipo desconhecido e caminho ruins';
END $$;

-- 6) a cota total (per_user_bytes) conta o que já está registrado no R2
DO $$
DECLARE a uuid; r jsonb;
BEGIN
    SELECT _t.a INTO a FROM _t;
    UPDATE public.upload_kinds SET per_user_bytes = 100000000, per_day_bytes = NULL WHERE kind = 'media_r2';   -- 100 MB, e já há 80 MB registrados
    r := pg_temp.authz(a, 'iuser-media', a || '/cota.mp4', 30000000, 'video/mp4');
    IF r->>'error' <> 'storage_quota' THEN RAISE EXCEPTION 'cota total deveria barrar: %', r; END IF;
    RAISE NOTICE 'OK 6: a cota total por pessoa conta o que já foi registrado no R2';
END $$;

-- 7) a conferência diária (reconcile) só cuida do Supabase: arquivo do R2 nunca é dado como "sumido". A limpeza de sem-uso vale para VÍDEO do R2 (ver r2_cleanup_scenarios.sql)
DO $$
DECLARE a uuid; n int; st text; c boolean;
BEGIN
    SELECT _t.a INTO a FROM _t;
    UPDATE public.media_assets SET created_at = now() - interval '30 days' WHERE provider = 'r2';
    n := public.media_assets_reconcile();
    SELECT state INTO st FROM public.media_assets WHERE provider = 'r2' AND key = a || '/ok.mp4';
    IF st <> 'ready' THEN RAISE EXCEPTION 'reconcile não pode mexer no R2: %', st; END IF;
    RAISE NOTICE 'OK 7: a conferência diária ignora o R2';
END $$;

-- 8) permissões: o registro é só do serviço; o app logado e o visitante não chamam
DO $$
BEGIN
    IF has_function_privilege('authenticated', 'public.register_r2_asset(uuid,text,text,bigint,text)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.register_r2_asset(uuid,text,text,bigint,text)', 'EXECUTE')
       OR NOT has_function_privilege('service_role', 'public.register_r2_asset(uuid,text,text,bigint,text)', 'EXECUTE') THEN RAISE EXCEPTION 'permissões de register_r2_asset erradas'; END IF;
    IF has_function_privilege('authenticated', 'public._authorize_upload_core(text,text,bigint,text,boolean)', 'EXECUTE') THEN RAISE EXCEPTION 'o núcleo da autorização não é chamável pelo app'; END IF;
    RAISE NOTICE 'OK 8: register_r2_asset só do serviço; o núcleo da autorização continua interno';
END $$;

-- 9) Financeiro: a nota do Cloudflare diz que o R2 está ativado
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.service_expenses WHERE service_name ILIKE '%cloudflare%') AND NOT EXISTS (SELECT 1 FROM public.service_expenses WHERE service_name ILIKE '%cloudflare%' AND notes LIKE '%R2 ATIVADO em 03/11/2026%') THEN
        RAISE EXCEPTION 'nota do Cloudflare em Financeiro não foi atualizada';
    END IF;
    RAISE NOTICE 'OK 9: a nota do Cloudflare em Admin → Financeiro registra o R2';
END $$;

ROLLBACK;
