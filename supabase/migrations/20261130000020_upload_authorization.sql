-- Controle de uploads, Camadas 3 e 4 (docs/CONTROLE-DE-UPLOADS.md): AUTORIZAÇÃO de cada envio + COTAS e RITMO por pessoa + BLOQUEIO de pessoa ou tipo.
--
-- COMO FUNCIONA (e por que NÃO há rota /api/uploads/sign, ao contrário do que o plano previa):
--   1. Antes de enviar, o app chama authorize_upload(bucket, caminho, bytes, tipo, upsert) COMO A PRÓPRIA PESSOA. A função confere login, conta bloqueada, bloqueios, tipo, tamanho, caminho,
--      plano (se o tipo exigir), ritmo (arquivos por hora) e cotas (bytes por dia e total) e, se tudo passa, grava uma AUTORIZAÇÃO curta (upload_grants) para aquele caminho exato.
--   2. As políticas de INSERT do Storage passam a aceitar o envio quando há essa autorização válida. Enquanto o interruptor upload_settings.signed_required estiver DESLIGADO (padrão),
--      o envio direto continua aceito como hoje: nada quebra para código antigo. Ligar o interruptor (admin_upload_set_enforced) fecha o "pular o app": sem autorização, sem envio.
--   O arquivo continua sendo enviado pela própria pessoa, então o DONO fica certo (um link assinado criado pelo servidor gravaria o arquivo SEM dono e quebraria trocar/apagar o que é seu).
--   O tamanho exato continua sendo imposto pelo limite do bucket (20261130000018); a autorização cuida de quem, quanto, com que ritmo e de que tipo.
--
-- Cotas e limites ficam em upload_kinds (editáveis pelo Admin na Camada 5): per_hour_files, per_day_bytes, per_user_bytes (NULL = sem limite), requires_plan, grant_minutes, owner_folder.
-- Valores iniciais abaixo são PROPOSTAS conservadoras que cobrem o uso normal (cadastrar dezenas de produtos de uma vez, trocar avatar, enviar prova de entrega) e barram abuso.
-- Tabelas sem acesso do app (tudo por função). Rollback: supabase/rollbacks/upload_authorization_rollback.sql

-- ===== interruptor (linha única) =====
CREATE TABLE IF NOT EXISTS public.upload_settings (
    id              boolean PRIMARY KEY DEFAULT true CHECK (id),
    signed_required boolean NOT NULL DEFAULT false,
    updated_at      timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.upload_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.upload_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.upload_settings FROM anon, authenticated;
GRANT ALL ON public.upload_settings TO service_role;

-- ===== catálogo: limites por pessoa =====
ALTER TABLE public.upload_kinds
    ADD COLUMN IF NOT EXISTS owner_folder   boolean NOT NULL DEFAULT false,   -- o caminho TEM de começar com <id da pessoa>/ (mesma regra das políticas do Storage)
    ADD COLUMN IF NOT EXISTS requires_plan  boolean NOT NULL DEFAULT false,   -- só quem tem plano ativo envia (nenhum tipo exige hoje: decisão do dono)
    ADD COLUMN IF NOT EXISTS per_hour_files integer CHECK (per_hour_files IS NULL OR per_hour_files > 0),
    ADD COLUMN IF NOT EXISTS per_day_bytes  bigint  CHECK (per_day_bytes  IS NULL OR per_day_bytes  > 0),
    ADD COLUMN IF NOT EXISTS per_user_bytes bigint  CHECK (per_user_bytes IS NULL OR per_user_bytes > 0),
    ADD COLUMN IF NOT EXISTS grant_minutes  integer NOT NULL DEFAULT 15 CHECK (grant_minutes BETWEEN 1 AND 240);

UPDATE public.upload_kinds k
SET owner_folder = v.owner_folder, per_hour_files = v.per_hour, per_day_bytes = v.per_day, per_user_bytes = v.per_user, grant_minutes = v.grant_min
FROM (VALUES
    --  tipo                     pasta própria  arq/hora  bytes/dia            bytes no total        minutos da autorização
    ('avatar',                   false,           20,     52428800::bigint,    209715200::bigint,    15),    --  50 MB/dia, 200 MB
    ('background',               false,           20,     52428800::bigint,    209715200::bigint,    15),
    ('store_logo',               false,           30,     52428800::bigint,    209715200::bigint,    15),
    ('product_photo',            false,          200,    419430400::bigint,   3221225472::bigint,    15),    -- 400 MB/dia, 3 GB (cadastro em lote de catálogo)
    ('community_photo',          true,            60,    209715200::bigint,   1073741824::bigint,    15),
    ('service_request_photo',    true,            60,    209715200::bigint,   1073741824::bigint,    15),
    ('ride_object_photo',        true,            30,    104857600::bigint,    524288000::bigint,    15),
    ('driver_car_photo',         true,            30,    104857600::bigint,    524288000::bigint,    15),
    ('driver_selfie',            true,            20,     52428800::bigint,    209715200::bigint,    15),
    ('mural_image',              false,           60,    209715200::bigint,   1073741824::bigint,    15),
    ('post_image',               true,            60,    209715200::bigint,   1073741824::bigint,    15),
    ('store_link_image',         true,            60,    209715200::bigint,   1073741824::bigint,    15),
    ('flash_media',              true,            30,    314572800::bigint,   2147483648::bigint,    60),    -- vídeo de até 15 MB: 1 h de folga
    ('delivery_proof',           true,           120,    314572800::bigint,   2147483648::bigint,    15),
    ('digital_file',             true,            20,   2147483648::bigint,  21474836480::bigint,   180)     -- arquivo de até 500 MB: 3 h de folga
) AS v(kind, owner_folder, per_hour, per_day, per_user, grant_min)
WHERE k.kind = v.kind;

-- ===== bloqueios (uma pessoa, um tipo, ou uma pessoa num tipo) =====
CREATE TABLE IF NOT EXISTS public.upload_blocks (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id    uuid REFERENCES public.profiles(id) ON DELETE CASCADE,            -- NULL = todos
    kind          text REFERENCES public.upload_kinds(kind) ON DELETE CASCADE,      -- NULL = todos os tipos
    reason        text CHECK (reason IS NULL OR char_length(reason) <= 300),
    blocked_until timestamptz,                                                      -- NULL = sem data para acabar
    created_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at    timestamptz NOT NULL DEFAULT now(),
    lifted_at     timestamptz,
    CHECK (profile_id IS NOT NULL OR kind IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS upload_blocks_profile_idx ON public.upload_blocks (profile_id) WHERE lifted_at IS NULL;
CREATE INDEX IF NOT EXISTS upload_blocks_kind_idx ON public.upload_blocks (kind) WHERE lifted_at IS NULL;
ALTER TABLE public.upload_blocks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.upload_blocks FROM anon, authenticated;
GRANT ALL ON public.upload_blocks TO service_role;

-- ===== autorizações emitidas (base do ritmo e das cotas, e do que a política do Storage confere) =====
CREATE TABLE IF NOT EXISTS public.upload_grants (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    kind           text NOT NULL REFERENCES public.upload_kinds(kind),
    bucket         text NOT NULL,
    key            text NOT NULL,
    declared_bytes bigint NOT NULL CHECK (declared_bytes > 0),
    actual_bytes   bigint,                       -- o que o Storage realmente guardou (preenchido quando o arquivo é registrado)
    upsert         boolean NOT NULL DEFAULT false,
    created_at     timestamptz NOT NULL DEFAULT now(),
    expires_at     timestamptz NOT NULL,
    used_at        timestamptz                   -- preenchido quando o arquivo é registrado: a autorização não vale de novo
);
CREATE INDEX IF NOT EXISTS upload_grants_profile_kind_idx ON public.upload_grants (profile_id, kind, created_at DESC);
CREATE INDEX IF NOT EXISTS upload_grants_lookup_idx ON public.upload_grants (profile_id, bucket, key, expires_at);
ALTER TABLE public.upload_grants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.upload_grants FROM anon, authenticated;
GRANT ALL ON public.upload_grants TO service_role;

-- ===== o que as políticas do Storage consultam =====
CREATE OR REPLACE FUNCTION public._direct_upload_allowed() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT NOT COALESCE((SELECT signed_required FROM public.upload_settings WHERE id), false);
$$;
REVOKE ALL ON FUNCTION public._direct_upload_allowed() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._direct_upload_allowed() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public._has_upload_grant(p_bucket text, p_key text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.upload_grants g
        WHERE g.profile_id = auth.uid() AND g.bucket = p_bucket AND g.key = p_key AND g.expires_at > now() AND g.used_at IS NULL
    );
$$;
REVOKE ALL ON FUNCTION public._has_upload_grant(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._has_upload_grant(text, text) TO authenticated, service_role;

-- As 5 políticas de INSERT (as mesmas condições de antes) ganham: "...e (envio direto permitido OU há autorização válida para este caminho)".
DROP POLICY IF EXISTS "storage_insert_flat" ON storage.objects;
CREATE POLICY "storage_insert_flat" ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id IN ('avatars', 'backgrounds', 'mural-images', 'product-images', 'store-logos')
                AND (public._direct_upload_allowed() OR public._has_upload_grant(bucket_id, name)));

DROP POLICY IF EXISTS "storage_insert_own_folder" ON storage.objects;
CREATE POLICY "storage_insert_own_folder" ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id IN ('community-photos', 'driver-car-photos', 'driver-selfie-photos', 'posts',
                              'ride-object-photos', 'service-request-photos', 'store-links')
                AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
                AND (public._direct_upload_allowed() OR public._has_upload_grant(bucket_id, name)));

DROP POLICY IF EXISTS "storage_insert_flash_media" ON storage.objects;
CREATE POLICY "storage_insert_flash_media" ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'flash-media' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
                AND (public._direct_upload_allowed() OR public._has_upload_grant(bucket_id, name)));

DROP POLICY IF EXISTS "storage_insert_delivery_proofs" ON storage.objects;
CREATE POLICY "storage_insert_delivery_proofs" ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'delivery-proofs' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
                AND (public._direct_upload_allowed() OR public._has_upload_grant(bucket_id, name)));

DROP POLICY IF EXISTS "storage_insert_digital_files" ON storage.objects;
CREATE POLICY "storage_insert_digital_files" ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'digital-files' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
                AND (public._direct_upload_allowed() OR public._has_upload_grant(bucket_id, name)));

-- ===== a autorização =====
-- Devolve jsonb {ok:true,...} ou {ok:false, error:'<código>', ...detalhes}; nunca levanta erro por regra de negócio (o app mostra o texto do código).
-- Códigos: not_authenticated, kind_disabled, wrong_provider, account_blocked, blocked, type_not_allowed, empty_file, too_large, invalid_path, wrong_folder, not_owner,
--          plan_required, rate_limited (retry_after), daily_quota (limit, used), storage_quota (limit, used).
CREATE OR REPLACE FUNCTION public.authorize_upload(p_bucket text, p_path text, p_bytes bigint, p_mime text, p_upsert boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, storage AS $$
DECLARE
    v_uid     uuid := auth.uid();
    k         public.upload_kinds%ROWTYPE;
    v_mime    text := lower(btrim(COALESCE(p_mime, '')));
    v_reason  text;
    v_n       integer;
    v_oldest  timestamptz;
    v_day     bigint;
    v_total   bigint;
    v_replace bigint := 0;
    v_owner   text;
    v_exists  boolean := false;
    v_has_plan boolean := false;
    v_grant   uuid;
    g         record;
BEGIN
    IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated'); END IF;

    SELECT * INTO k FROM public.upload_kinds WHERE bucket = p_bucket ORDER BY enabled DESC, kind LIMIT 1;
    IF NOT FOUND THEN RETURN jsonb_build_object('ok', true, 'controlled', false); END IF;   -- bucket fora do catálogo: quem decide é a política do Storage
    IF NOT k.enabled THEN RETURN jsonb_build_object('ok', false, 'error', 'kind_disabled', 'kind', k.kind); END IF;
    IF k.provider <> 'supabase' THEN RETURN jsonb_build_object('ok', false, 'error', 'wrong_provider', 'kind', k.kind, 'provider', k.provider); END IF;

    IF EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_uid AND (p.is_blocked IS TRUE OR p.is_active IS FALSE)) THEN
        RETURN jsonb_build_object('ok', false, 'error', 'account_blocked');
    END IF;
    SELECT COALESCE(b.reason, '') INTO v_reason FROM public.upload_blocks b
    WHERE b.lifted_at IS NULL AND (b.blocked_until IS NULL OR b.blocked_until > now())
      AND (b.profile_id = v_uid OR b.profile_id IS NULL) AND (b.kind = k.kind OR b.kind IS NULL)
    ORDER BY b.created_at DESC LIMIT 1;
    IF FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'blocked', 'kind', k.kind, 'reason', v_reason); END IF;

    IF k.mime_types IS NOT NULL AND NOT (v_mime = ANY (k.mime_types)) THEN
        RETURN jsonb_build_object('ok', false, 'error', 'type_not_allowed', 'kind', k.kind);
    END IF;
    IF p_bytes IS NULL OR p_bytes <= 0 THEN RETURN jsonb_build_object('ok', false, 'error', 'empty_file'); END IF;
    IF p_bytes > k.max_bytes THEN RETURN jsonb_build_object('ok', false, 'error', 'too_large', 'limit', k.max_bytes); END IF;

    IF p_path IS NULL OR p_path = '' OR char_length(p_path) > 400 OR left(p_path, 1) = '/' OR right(p_path, 1) = '/'
       OR p_path ~ '[[:cntrl:]]' OR p_path ~ '\\' OR p_path ~ '(^|/)\.\.(/|$)' THEN
        RETURN jsonb_build_object('ok', false, 'error', 'invalid_path');
    END IF;
    IF k.owner_folder AND split_part(p_path, '/', 1) <> v_uid::text THEN
        RETURN jsonb_build_object('ok', false, 'error', 'wrong_folder');
    END IF;

    -- trocar um arquivo que já existe só é permitido se ele é seu (dono ou pasta própria); o Storage também recusaria, mas assim não gasta cota à toa
    SELECT o.owner_id INTO v_owner FROM storage.objects o WHERE o.bucket_id = p_bucket AND o.name = p_path;
    v_exists := FOUND;
    IF v_exists AND p_upsert AND v_owner IS NOT NULL AND v_owner <> v_uid::text AND split_part(p_path, '/', 1) <> v_uid::text THEN
        RETURN jsonb_build_object('ok', false, 'error', 'not_owner');
    END IF;

    IF k.requires_plan THEN
        SELECT COALESCE(pg.has_driver OR pg.has_provider OR pg.has_store OR pg.has_recruiter, false) INTO v_has_plan FROM public.get_active_plan_grants(v_uid) pg;
        IF NOT COALESCE(v_has_plan, false) THEN RETURN jsonb_build_object('ok', false, 'error', 'plan_required', 'kind', k.kind); END IF;
    END IF;

    -- daqui para baixo conta o que a pessoa já enviou: serializa por pessoa+tipo para dois envios ao mesmo tempo não passarem juntos pelo limite
    PERFORM pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || k.kind, 0));

    IF k.per_hour_files IS NOT NULL THEN
        SELECT count(*), min(created_at) INTO v_n, v_oldest FROM public.upload_grants
        WHERE profile_id = v_uid AND kind = k.kind AND created_at > now() - interval '1 hour';
        IF v_n >= k.per_hour_files THEN
            RETURN jsonb_build_object('ok', false, 'error', 'rate_limited', 'limit', k.per_hour_files,
                                      'retry_after', GREATEST(1, ceil(extract(epoch FROM (v_oldest + interval '1 hour' - now())))::int));
        END IF;
    END IF;
    IF k.per_day_bytes IS NOT NULL THEN
        SELECT COALESCE(sum(COALESCE(actual_bytes, declared_bytes)), 0) INTO v_day FROM public.upload_grants
        WHERE profile_id = v_uid AND kind = k.kind AND created_at > now() - interval '24 hours';
        IF v_day + p_bytes > k.per_day_bytes THEN
            RETURN jsonb_build_object('ok', false, 'error', 'daily_quota', 'limit', k.per_day_bytes, 'used', v_day);
        END IF;
    END IF;
    IF k.per_user_bytes IS NOT NULL THEN
        SELECT COALESCE(sum(m.bytes), 0) INTO v_total FROM public.media_assets m WHERE m.owner_id = v_uid AND m.kind = k.kind AND m.state = 'ready';
        v_total := v_total + COALESCE((SELECT sum(g2.declared_bytes) FROM public.upload_grants g2
                                       WHERE g2.profile_id = v_uid AND g2.kind = k.kind AND g2.actual_bytes IS NULL AND g2.used_at IS NULL AND g2.expires_at > now()), 0);
        IF p_upsert THEN   -- trocar o arquivo do mesmo caminho não soma duas vezes
            SELECT COALESCE(m.bytes, 0) INTO v_replace FROM public.media_assets m WHERE m.bucket = p_bucket AND m.key = p_path AND m.owner_id = v_uid AND m.state = 'ready';
        END IF;
        IF v_total - COALESCE(v_replace, 0) + p_bytes > k.per_user_bytes THEN
            RETURN jsonb_build_object('ok', false, 'error', 'storage_quota', 'limit', k.per_user_bytes, 'used', v_total);
        END IF;
    END IF;

    INSERT INTO public.upload_grants (profile_id, kind, bucket, key, declared_bytes, upsert, expires_at)
    VALUES (v_uid, k.kind, p_bucket, p_path, p_bytes, COALESCE(p_upsert, false), now() + make_interval(mins => k.grant_minutes))
    RETURNING id INTO v_grant;
    RETURN jsonb_build_object('ok', true, 'controlled', true, 'kind', k.kind, 'grant', v_grant, 'expires_in', k.grant_minutes * 60);
END; $$;
REVOKE ALL ON FUNCTION public.authorize_upload(text, text, bigint, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.authorize_upload(text, text, bigint, text, boolean) TO authenticated;

-- o registro (20261130000019) agora também fecha a autorização: guarda o tamanho REAL e marca como usada (a autorização não vale para um segundo envio)
CREATE OR REPLACE FUNCTION public.register_media_asset(p_bucket text, p_path text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, storage AS $$
DECLARE
    v_uid   uuid := auth.uid();
    v_kind  public.upload_kinds%ROWTYPE;
    v_owner text;
    v_meta  jsonb;
    v_id    uuid;
    v_bytes bigint;
BEGIN
    IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000'; END IF;
    SELECT * INTO v_kind FROM public.upload_kinds WHERE bucket = p_bucket AND enabled ORDER BY kind LIMIT 1;
    IF NOT FOUND THEN RETURN NULL; END IF;
    SELECT o.owner_id, o.metadata INTO v_owner, v_meta FROM storage.objects o WHERE o.bucket_id = p_bucket AND o.name = p_path;
    IF NOT FOUND THEN RETURN NULL; END IF;
    IF v_owner IS DISTINCT FROM v_uid::text THEN RAISE EXCEPTION 'not_owner' USING ERRCODE = '42501'; END IF;
    v_bytes := COALESCE((v_meta->>'size')::bigint, 0);
    INSERT INTO public.media_assets (owner_id, kind, provider, bucket, key, bytes, mime)
    VALUES (v_uid, v_kind.kind, v_kind.provider, p_bucket, p_path, v_bytes, v_meta->>'mimetype')
    ON CONFLICT (provider, bucket, key) DO UPDATE
        SET owner_id = EXCLUDED.owner_id, kind = EXCLUDED.kind, bytes = EXCLUDED.bytes, mime = EXCLUDED.mime, state = 'ready', deleted_at = NULL
    RETURNING id INTO v_id;
    UPDATE public.upload_grants SET actual_bytes = v_bytes, used_at = now()
    WHERE id = (SELECT g.id FROM public.upload_grants g WHERE g.profile_id = v_uid AND g.bucket = p_bucket AND g.key = p_path AND g.used_at IS NULL
                ORDER BY g.created_at DESC LIMIT 1);
    RETURN v_id;
END; $$;
REVOKE ALL ON FUNCTION public.register_media_asset(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_media_asset(text, text) TO authenticated;

-- ===== administração (só serviço; a tela do Admin é a Camada 5). Tudo que muda grava admin_config_audit. =====
-- Liga/desliga o "envio só com autorização". Ligue SÓ depois de o código novo estar no ar (o código antigo não pede autorização e deixaria de enviar).
CREATE OR REPLACE FUNCTION public.admin_upload_set_enforced(p_on boolean, p_admin uuid DEFAULT NULL) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_old boolean;
BEGIN
    SELECT signed_required INTO v_old FROM public.upload_settings WHERE id;
    UPDATE public.upload_settings SET signed_required = COALESCE(p_on, false), updated_at = now() WHERE id;
    IF v_old IS DISTINCT FROM COALESCE(p_on, false) THEN
        INSERT INTO public.admin_config_audit (scope, setting, old_value, new_value, changed_by)
        VALUES ('upload_settings', 'signed_required', to_jsonb(v_old), to_jsonb(COALESCE(p_on, false)), p_admin);
    END IF;
    RETURN COALESCE(p_on, false);
END; $$;
REVOKE ALL ON FUNCTION public.admin_upload_set_enforced(boolean, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_upload_set_enforced(boolean, uuid) TO service_role;

-- Bloqueia uma pessoa (todos os tipos ou um), um tipo para todos, ou uma pessoa num tipo. p_hours NULL = até alguém liberar.
CREATE OR REPLACE FUNCTION public.admin_upload_block(p_profile uuid, p_kind text, p_reason text, p_hours integer, p_admin uuid DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
    IF p_profile IS NULL AND p_kind IS NULL THEN RAISE EXCEPTION 'Informe a pessoa, o tipo, ou os dois.' USING ERRCODE = '22023'; END IF;
    IF p_hours IS NOT NULL AND p_hours <= 0 THEN RAISE EXCEPTION 'A duração deve ser maior que zero.' USING ERRCODE = '22023'; END IF;
    IF p_kind IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.upload_kinds WHERE kind = p_kind) THEN RAISE EXCEPTION 'Tipo de upload desconhecido: %', p_kind USING ERRCODE = '22023'; END IF;
    INSERT INTO public.upload_blocks (profile_id, kind, reason, blocked_until, created_by)
    VALUES (p_profile, p_kind, left(NULLIF(btrim(p_reason), ''), 300), CASE WHEN p_hours IS NULL THEN NULL ELSE now() + make_interval(hours => p_hours) END, p_admin)
    RETURNING id INTO v_id;
    INSERT INTO public.admin_config_audit (scope, setting, old_value, new_value, changed_by)
    VALUES ('upload_blocks', COALESCE(p_kind, '*') || ':' || COALESCE(p_profile::text, '*'), NULL, jsonb_build_object('block', v_id, 'hours', p_hours, 'reason', p_reason), p_admin);
    RETURN v_id;
END; $$;
REVOKE ALL ON FUNCTION public.admin_upload_block(uuid, text, text, integer, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_upload_block(uuid, text, text, integer, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_upload_unblock(p_block uuid, p_admin uuid DEFAULT NULL) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n integer;
BEGIN
    UPDATE public.upload_blocks SET lifted_at = now() WHERE id = p_block AND lifted_at IS NULL;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n > 0 THEN
        INSERT INTO public.admin_config_audit (scope, setting, old_value, new_value, changed_by)
        VALUES ('upload_blocks', p_block::text, jsonb_build_object('active', true), jsonb_build_object('active', false), p_admin);
    END IF;
    RETURN v_n > 0;
END; $$;
REVOKE ALL ON FUNCTION public.admin_upload_unblock(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_upload_unblock(uuid, uuid) TO service_role;

-- Edita limites de um tipo. p_patch aceita: enabled, requires_plan, per_hour_files, per_day_bytes, per_user_bytes, grant_minutes, max_bytes (null limpa os "per_*").
-- max_bytes também atualiza o limite do bucket no Storage (para o catálogo e o bucket nunca divergirem). Tipos aceitos (mime_types) só mudam por migration.
CREATE OR REPLACE FUNCTION public.admin_upload_update_kind(p_kind text, p_patch jsonb, p_admin uuid DEFAULT NULL) RETURNS public.upload_kinds
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, storage AS $$
DECLARE
    o public.upload_kinds%ROWTYPE;
    n public.upload_kinds%ROWTYPE;
    f text;
    v_allowed text[] := ARRAY['enabled', 'requires_plan', 'per_hour_files', 'per_day_bytes', 'per_user_bytes', 'grant_minutes', 'max_bytes'];
BEGIN
    SELECT * INTO o FROM public.upload_kinds WHERE kind = p_kind FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Tipo de upload desconhecido: %', p_kind USING ERRCODE = '22023'; END IF;
    FOR f IN SELECT jsonb_object_keys(COALESCE(p_patch, '{}'::jsonb)) LOOP
        IF NOT (f = ANY (v_allowed)) THEN RAISE EXCEPTION 'Campo não editável: %', f USING ERRCODE = '22023'; END IF;
    END LOOP;
    n := o;
    IF p_patch ? 'enabled'        THEN n.enabled        := (p_patch->>'enabled')::boolean; END IF;
    IF p_patch ? 'requires_plan'  THEN n.requires_plan  := (p_patch->>'requires_plan')::boolean; END IF;
    IF p_patch ? 'per_hour_files' THEN n.per_hour_files := (p_patch->>'per_hour_files')::integer; END IF;
    IF p_patch ? 'per_day_bytes'  THEN n.per_day_bytes  := (p_patch->>'per_day_bytes')::bigint; END IF;
    IF p_patch ? 'per_user_bytes' THEN n.per_user_bytes := (p_patch->>'per_user_bytes')::bigint; END IF;
    IF p_patch ? 'grant_minutes'  THEN n.grant_minutes  := (p_patch->>'grant_minutes')::integer; END IF;
    IF p_patch ? 'max_bytes'      THEN n.max_bytes      := (p_patch->>'max_bytes')::bigint; END IF;
    UPDATE public.upload_kinds SET enabled = n.enabled, requires_plan = n.requires_plan, per_hour_files = n.per_hour_files, per_day_bytes = n.per_day_bytes,
           per_user_bytes = n.per_user_bytes, grant_minutes = n.grant_minutes, max_bytes = n.max_bytes, updated_at = now()
    WHERE kind = p_kind RETURNING * INTO n;
    IF n.max_bytes IS DISTINCT FROM o.max_bytes AND n.provider = 'supabase' THEN
        UPDATE storage.buckets SET file_size_limit = n.max_bytes WHERE id = n.bucket;
    END IF;
    FOR f IN SELECT unnest(v_allowed) LOOP
        IF to_jsonb(o)->f IS DISTINCT FROM to_jsonb(n)->f THEN
            INSERT INTO public.admin_config_audit (scope, setting, old_value, new_value, changed_by)
            VALUES ('upload_kinds', p_kind || '.' || f, to_jsonb(o)->f, to_jsonb(n)->f, p_admin);
        END IF;
    END LOOP;
    RETURN n;
END; $$;
REVOKE ALL ON FUNCTION public.admin_upload_update_kind(text, jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_upload_update_kind(text, jsonb, uuid) TO service_role;

-- ===== limpeza: autorizações com mais de 8 dias saem (já não contam para nenhum limite) =====
CREATE OR REPLACE FUNCTION public.upload_grants_purge() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n integer;
BEGIN
    DELETE FROM public.upload_grants WHERE created_at < now() - interval '8 days';
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RETURN v_n;
END; $$;
REVOKE ALL ON FUNCTION public.upload_grants_purge() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upload_grants_purge() TO service_role;

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'upload-grants-purge';
SELECT cron.schedule('upload-grants-purge', '17 3 * * *', $job$SELECT public.upload_grants_purge()$job$);
