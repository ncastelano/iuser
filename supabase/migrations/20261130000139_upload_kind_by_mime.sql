-- 20261130000139 — a autorização escolhe o TIPO pelo formato quando vários tipos dividem o bucket (chat: foto, vídeo e áudio no iuser-chat).
-- Antes pegava sempre o primeiro tipo do bucket (ordem alfabética): com chat_audio ligado, foto e vídeo eram recusados.
-- Rollback: supabase/rollbacks/upload_kind_by_mime_rollback.sql (restaura a função de antes).
CREATE OR REPLACE FUNCTION public._authorize_upload_core(p_bucket text, p_path text, p_bytes bigint, p_mime text, p_upsert boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'storage'
AS $function$
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

    -- Vários tipos podem dividir o MESMO bucket (ex.: foto, vídeo e áudio do chat, no iuser-chat): escolhe o que aceita este formato;
    -- se nenhum aceitar, cai no tipo do bucket de sempre, que recusa o arquivo (type_not_allowed).
    SELECT * INTO k FROM public.upload_kinds WHERE bucket = p_bucket AND (mime_types IS NULL OR v_mime = ANY (mime_types)) ORDER BY enabled DESC, kind LIMIT 1;
    IF NOT FOUND THEN SELECT * INTO k FROM public.upload_kinds WHERE bucket = p_bucket ORDER BY enabled DESC, kind LIMIT 1; END IF;
    IF NOT FOUND THEN RETURN jsonb_build_object('ok', true, 'controlled', false); END IF;   -- bucket fora do catálogo: quem decide é a política do Storage
    IF NOT k.enabled THEN RETURN jsonb_build_object('ok', false, 'error', 'kind_disabled', 'kind', k.kind); END IF;
    IF k.provider NOT IN ('supabase', 'r2') THEN RETURN jsonb_build_object('ok', false, 'error', 'wrong_provider', 'kind', k.kind, 'provider', k.provider); END IF;

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
    SELECT o.owner_id INTO v_owner FROM storage.objects o WHERE k.provider = 'supabase' AND o.bucket_id = p_bucket AND o.name = p_path;
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
END; $function$;
