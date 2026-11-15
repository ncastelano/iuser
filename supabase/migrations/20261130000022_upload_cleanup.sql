-- Controle de uploads, Camada 6 (docs/CONTROLE-DE-UPLOADS.md): LIMPEZA de arquivos que nenhum lugar do app usa mais (órfãos), por exemplo a foto de perfil antiga depois de a pessoa trocar a foto,
-- e a conferência diária de arquivos que sumiram do Storage.
--
-- APAGAR É IRREVERSÍVEL (o Storage não tem lixeira), então a rotina é cautelosa em camadas:
--   1. Só tipos ELEGÍVEIS (upload_kinds.cleanup_eligible). NUNCA provas de entrega (evidência de disputa), arquivos digitais (conteúdo pago) nem fotos de corrida.
--   2. Só fotos e vídeos com nome seguro e arquivo registrado, com mais de `cleanup_min_age_days` (3) dias, e que não foram marcados "manter".
--   3. "Órfão" = o NOME do arquivo não aparece em NENHUMA coluna de texto, JSON ou lista de texto do banco (todas as tabelas de public, mais os metadados de auth.users): em vez de listar à mão
--      cada coluna que guarda um link (esquecer uma = apagar foto em uso), o banco procura o nome em tudo. Qualquer coincidência conta como "em uso" (erra para o lado seguro: histórico de
--      pedidos e avisos que citam a foto também a protegem).
--   4. QUARENTENA: o arquivo é só MARCADO (orphan_since) e continua no ar. Só vira apagável depois de `cleanup_quarantine_days` (7) dias marcado E depois de uma nova conferência no momento de apagar.
--      Se uma referência reaparecer, a marca sai sozinha.
--   5. DISJUNTOR: se mais de 30% dos arquivos elegíveis (e mais de 20) virarem "apagáveis" de uma vez, a rotina aborta com erro (isso parece defeito da busca, não sujeira).
--   6. Nasce DESLIGADA (cleanup_enabled = false): só simula e mostra o que apagaria. Um limite por rodada (cleanup_max_per_run, 200).
-- Quem apaga é uma rotina de servidor (rota /api/internal/uploads-cleanup, agendada pela Vercel, ou o botão do painel Admin → Uploads), pela API do Storage (o Storage proíbe DELETE direto em
-- storage.objects). O banco só marca, confere e confirma (upload_cleanup_*), tudo só do serviço. Cada rodada fica registrada em upload_cleanup_runs.
-- media_assets_reconcile() (arquivo que sumiu do Storage) passa a rodar todo dia (pg_cron).
-- Rollback: supabase/rollbacks/upload_cleanup_rollback.sql

-- ===== configurações =====
ALTER TABLE public.upload_settings
    ADD COLUMN IF NOT EXISTS cleanup_enabled         boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS cleanup_min_age_days    integer NOT NULL DEFAULT 3 CHECK (cleanup_min_age_days BETWEEN 1 AND 365),
    ADD COLUMN IF NOT EXISTS cleanup_quarantine_days integer NOT NULL DEFAULT 7 CHECK (cleanup_quarantine_days BETWEEN 1 AND 365),
    ADD COLUMN IF NOT EXISTS cleanup_max_per_run     integer NOT NULL DEFAULT 200 CHECK (cleanup_max_per_run BETWEEN 1 AND 1000);

ALTER TABLE public.upload_kinds ADD COLUMN IF NOT EXISTS cleanup_eligible boolean NOT NULL DEFAULT false;
UPDATE public.upload_kinds SET cleanup_eligible = true
WHERE kind IN ('avatar', 'background', 'store_logo', 'product_photo', 'flash_media', 'community_photo', 'service_request_photo', 'driver_car_photo', 'driver_selfie', 'post_image', 'store_link_image', 'mural_image');
-- (de fora de propósito: delivery_proof = evidência de disputa; digital_file = conteúdo pago; ride_object_photo = evidência de corrida)

ALTER TABLE public.media_assets
    ADD COLUMN IF NOT EXISTS orphan_since   timestamptz,                 -- desde quando nenhuma referência foi achada (início da quarentena)
    ADD COLUMN IF NOT EXISTS ref_checked_at timestamptz,                 -- última vez que a busca de referências olhou este arquivo
    ADD COLUMN IF NOT EXISTS keep           boolean NOT NULL DEFAULT false,  -- o admin mandou NUNCA apagar
    ADD COLUMN IF NOT EXISTS deleted_reason text;                         -- 'orphan' (limpeza) ou 'missing' (sumiu do Storage por outro caminho)
CREATE INDEX IF NOT EXISTS media_assets_orphan_idx ON public.media_assets (orphan_since) WHERE orphan_since IS NOT NULL AND state = 'ready';
CREATE INDEX IF NOT EXISTS media_assets_refcheck_idx ON public.media_assets (ref_checked_at NULLS FIRST) WHERE state = 'ready';

CREATE TABLE IF NOT EXISTS public.upload_cleanup_runs (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    started_at  timestamptz NOT NULL DEFAULT now(),
    finished_at timestamptz NOT NULL DEFAULT now(),
    source      text NOT NULL CHECK (source IN ('cron', 'admin')),
    dry_run     boolean NOT NULL,
    scanned     integer NOT NULL DEFAULT 0,
    marked      integer NOT NULL DEFAULT 0,
    cleared     integer NOT NULL DEFAULT 0,
    due         integer NOT NULL DEFAULT 0,
    deleted     integer NOT NULL DEFAULT 0,
    bytes_freed bigint  NOT NULL DEFAULT 0,
    reconciled  integer NOT NULL DEFAULT 0,
    errors      integer NOT NULL DEFAULT 0,
    note        text
);
CREATE INDEX IF NOT EXISTS upload_cleanup_runs_started_idx ON public.upload_cleanup_runs (started_at DESC);
ALTER TABLE public.upload_cleanup_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.upload_cleanup_runs FROM anon, authenticated;
GRANT ALL ON public.upload_cleanup_runs TO service_role;

-- ===== a busca de referências =====
-- Dos nomes recebidos (minúsculos, só o nome final, ex.: "<uid>-1793637678264.jpg"), devolve os que aparecem citados em alguma coluna. Varre todas as colunas de texto, JSON e lista de texto de
-- public (menos o próprio registro de uploads) e os metadados de auth.users. Extrai de cada valor só o que parece nome de foto/vídeo e compara o nome final.
CREATE OR REPLACE FUNCTION public._media_cited_names(p_names text[]) RETURNS text[]
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public SET statement_timeout = '300s' AS $$
DECLARE
    c       record;
    v_expr  text;
    v_part  text[];
    v_found text[] := '{}';
    v_pat   constant text := '([A-Za-z0-9._%-]+\.(?:jpe?g|png|webp|gif|avif|mp4|webm|mov))';
BEGIN
    IF p_names IS NULL OR cardinality(p_names) = 0 THEN RETURN '{}'; END IF;
    FOR c IN
        SELECT cc.table_name, cc.column_name, cc.data_type
        FROM information_schema.columns cc
        JOIN information_schema.tables t ON t.table_schema = cc.table_schema AND t.table_name = cc.table_name AND t.table_type = 'BASE TABLE'
        WHERE cc.table_schema = 'public'
          AND (cc.data_type IN ('text', 'character varying', 'jsonb', 'json') OR (cc.data_type = 'ARRAY' AND cc.udt_name IN ('_text', '_varchar')))
          AND cc.table_name NOT IN ('media_assets', 'upload_grants', 'upload_denials', 'upload_blocks', 'upload_kinds', 'upload_settings', 'upload_cleanup_runs', 'admin_config_audit')
    LOOP
        v_expr := CASE WHEN c.data_type = 'ARRAY' THEN format('array_to_string(%I, '' '')', c.column_name) ELSE format('%I::text', c.column_name) END;
        EXECUTE format($q$SELECT COALESCE(array_agg(DISTINCT x.n), '{}') FROM (
                              SELECT lower(split_part(m[1], '/', -1)) AS n FROM public.%I, LATERAL regexp_matches(%s, %L, 'gi') m WHERE %I IS NOT NULL) x
                          WHERE x.n = ANY ($1)$q$, c.table_name, v_expr, v_pat, c.column_name) INTO v_part USING p_names;
        v_found := v_found || v_part;
    END LOOP;
    -- metadados da conta (a foto escolhida no cadastro pode ficar aqui)
    SELECT COALESCE(array_agg(DISTINCT x.n), '{}') INTO v_part FROM (
        SELECT lower(split_part(m[1], '/', -1)) AS n FROM auth.users u, LATERAL regexp_matches(COALESCE(u.raw_user_meta_data::text, '') || ' ' || COALESCE(u.raw_app_meta_data::text, ''), v_pat, 'gi') m) x
    WHERE x.n = ANY (p_names);
    v_found := v_found || v_part;
    RETURN (SELECT COALESCE(array_agg(DISTINCT n), '{}') FROM unnest(v_found) n);
END; $$;
REVOKE ALL ON FUNCTION public._media_cited_names(text[]) FROM PUBLIC, anon, authenticated;

-- arquivo que a limpeza pode olhar: elegível, no Supabase, registrado e vivo, não marcado "manter", com nome seguro de foto/vídeo e idade mínima
CREATE OR REPLACE FUNCTION public._media_cleanup_candidate(m public.media_assets, k public.upload_kinds, s public.upload_settings) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
    SELECT m.state = 'ready' AND NOT m.keep AND k.cleanup_eligible AND k.provider = 'supabase' AND m.provider = 'supabase'
       AND m.key ~ '^[A-Za-z0-9._/-]+$' AND m.key !~ '(^|/)\.\.(/|$)' AND split_part(m.key, '/', -1) ~* '\.(jpe?g|png|webp|gif|avif|mp4|webm|mov)$'
       AND m.created_at < now() - make_interval(days => s.cleanup_min_age_days);
$$;
REVOKE ALL ON FUNCTION public._media_cleanup_candidate(public.media_assets, public.upload_kinds, public.upload_settings) FROM PUBLIC, anon, authenticated;

-- 1) MARCAR: olha um lote (os já marcados primeiro, depois os nunca vistos e os vistos há mais tempo) e marca ou desmarca. Não apaga nem mexe no Storage.
--    Devolve quantos foram olhados, marcados AGORA (antes tinham referência ou nunca foram vistos) e desmarcados AGORA (a referência reapareceu).
CREATE OR REPLACE FUNCTION public.upload_cleanup_scan(p_limit integer DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    s         public.upload_settings%ROWTYPE;
    v_lim     integer;
    v_ids     uuid[];
    v_names   text[];
    v_cited   text[];
    v_marked  integer := 0;
    v_cleared integer := 0;
BEGIN
    SELECT * INTO s FROM public.upload_settings WHERE id;
    v_lim := LEAST(GREATEST(COALESCE(p_limit, s.cleanup_max_per_run), 1), 1000);
    SELECT array_agg(t.id), array_agg(t.nm) INTO v_ids, v_names FROM (
        SELECT m.id, lower(split_part(m.key, '/', -1)) AS nm
        FROM public.media_assets m JOIN public.upload_kinds k ON k.kind = m.kind
        WHERE public._media_cleanup_candidate(m, k, s)
          AND (m.orphan_since IS NOT NULL OR m.ref_checked_at IS NULL OR m.ref_checked_at < now() - interval '7 days')
        ORDER BY (m.orphan_since IS NULL), m.ref_checked_at NULLS FIRST, m.created_at, m.id
        LIMIT v_lim) t;
    IF v_ids IS NULL THEN
        RETURN jsonb_build_object('scanned', 0, 'marked', 0, 'cleared', 0, 'orphans_total', (SELECT count(*) FROM public.media_assets WHERE state = 'ready' AND orphan_since IS NOT NULL));
    END IF;
    v_cited := public._media_cited_names(v_names);
    WITH before AS (
        SELECT m.id, (m.orphan_since IS NOT NULL) AS was_orphan FROM public.media_assets m WHERE m.id = ANY (v_ids)
    ), upd AS (
        UPDATE public.media_assets m SET
            orphan_since   = CASE WHEN lower(split_part(m.key, '/', -1)) = ANY (v_cited) THEN NULL ELSE COALESCE(m.orphan_since, now()) END,
            ref_checked_at = now()
        WHERE m.id = ANY (v_ids)
        RETURNING m.id, (m.orphan_since IS NOT NULL) AS is_orphan
    )
    SELECT count(*) FILTER (WHERE u.is_orphan AND NOT b.was_orphan), count(*) FILTER (WHERE NOT u.is_orphan AND b.was_orphan)
    INTO v_marked, v_cleared FROM upd u JOIN before b ON b.id = u.id;
    RETURN jsonb_build_object('scanned', cardinality(v_ids), 'marked', v_marked, 'cleared', v_cleared,
        'orphans_total', (SELECT count(*) FROM public.media_assets WHERE state = 'ready' AND orphan_since IS NOT NULL));
END; $$;
REVOKE ALL ON FUNCTION public.upload_cleanup_scan(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upload_cleanup_scan(integer) TO service_role;

-- 2) O QUE JÁ PODE SER APAGADO: marcados há mais que a quarentena, conferidos DE NOVO agora (quem ganhou referência é desmarcado e sai da lista). Não apaga nada.
--    DISJUNTOR: mais de 30% dos arquivos elegíveis (e mais de 20) "apagáveis" ao mesmo tempo = defeito provável da busca, não sujeira: aborta com erro.
CREATE OR REPLACE FUNCTION public.upload_cleanup_due(p_limit integer DEFAULT NULL) RETURNS TABLE (id uuid, bucket text, key text, bytes bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    s       public.upload_settings%ROWTYPE;
    v_lim   integer;
    v_total bigint;
    v_due   bigint;
    v_ids   uuid[];
    v_names text[];
    v_cited text[];
BEGIN
    SELECT * INTO s FROM public.upload_settings us WHERE us.id;   -- (qualificado: a função devolve uma coluna chamada id)
    v_lim := LEAST(GREATEST(COALESCE(p_limit, s.cleanup_max_per_run), 1), 1000);
    SELECT count(*) INTO v_total FROM public.media_assets m JOIN public.upload_kinds k ON k.kind = m.kind WHERE public._media_cleanup_candidate(m, k, s);
    SELECT count(*) INTO v_due FROM public.media_assets m JOIN public.upload_kinds k ON k.kind = m.kind
    WHERE public._media_cleanup_candidate(m, k, s) AND m.orphan_since IS NOT NULL AND m.orphan_since < now() - make_interval(days => s.cleanup_quarantine_days);
    IF v_due > 20 AND v_due > v_total * 0.3 THEN
        RAISE EXCEPTION 'circuit_breaker: % de % arquivos elegíveis estão prontos para apagar de uma vez (acima de 30%%); a busca de referências pode estar com defeito', v_due, v_total USING ERRCODE = 'P0001';
    END IF;
    SELECT array_agg(t.id), array_agg(t.nm) INTO v_ids, v_names FROM (
        SELECT m.id, lower(split_part(m.key, '/', -1)) AS nm
        FROM public.media_assets m JOIN public.upload_kinds k ON k.kind = m.kind
        WHERE public._media_cleanup_candidate(m, k, s) AND m.orphan_since IS NOT NULL AND m.orphan_since < now() - make_interval(days => s.cleanup_quarantine_days)
        ORDER BY m.orphan_since, m.id LIMIT v_lim) t;
    IF v_ids IS NULL THEN RETURN; END IF;
    v_cited := public._media_cited_names(v_names);
    UPDATE public.media_assets m SET orphan_since = NULL, ref_checked_at = now() WHERE m.id = ANY (v_ids) AND lower(split_part(m.key, '/', -1)) = ANY (v_cited);
    RETURN QUERY SELECT m.id, m.bucket, m.key, m.bytes FROM public.media_assets m WHERE m.id = ANY (v_ids) AND m.orphan_since IS NOT NULL ORDER BY m.orphan_since, m.id;
END; $$;
REVOKE ALL ON FUNCTION public.upload_cleanup_due(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upload_cleanup_due(integer) TO service_role;

-- 3) CONFIRMAR: depois de a rotina apagar pela API do Storage, marca como apagado SÓ o que realmente sumiu do Storage (se a API falhou para um arquivo, ele continua vivo e marcado).
CREATE OR REPLACE FUNCTION public.upload_cleanup_confirm(p_ids uuid[]) RETURNS TABLE (deleted integer, bytes bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, storage AS $$
BEGIN
    RETURN QUERY
    WITH done AS (
        UPDATE public.media_assets m SET state = 'deleted', deleted_at = now(), deleted_reason = 'orphan'
        WHERE m.id = ANY (COALESCE(p_ids, '{}')) AND m.state = 'ready'
          AND NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = m.bucket AND o.name = m.key)
        RETURNING m.bytes)
    SELECT count(*)::integer, COALESCE(sum(d.bytes), 0)::bigint FROM done d;
END; $$;
REVOKE ALL ON FUNCTION public.upload_cleanup_confirm(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upload_cleanup_confirm(uuid[]) TO service_role;

-- 4) REGISTRAR a rodada (o painel mostra as últimas)
CREATE OR REPLACE FUNCTION public.upload_cleanup_record_run(p_source text, p_dry boolean, p_started timestamptz, p_stats jsonb, p_note text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
    INSERT INTO public.upload_cleanup_runs (started_at, source, dry_run, scanned, marked, cleared, due, deleted, bytes_freed, reconciled, errors, note)
    VALUES (COALESCE(p_started, now()), p_source, COALESCE(p_dry, true), COALESCE((p_stats->>'scanned')::int, 0), COALESCE((p_stats->>'marked')::int, 0), COALESCE((p_stats->>'cleared')::int, 0),
            COALESCE((p_stats->>'due')::int, 0), COALESCE((p_stats->>'deleted')::int, 0), COALESCE((p_stats->>'bytes_freed')::bigint, 0), COALESCE((p_stats->>'reconciled')::int, 0),
            COALESCE((p_stats->>'errors')::int, 0), left(p_note, 500))
    RETURNING id INTO v_id;
    RETURN v_id;
END; $$;
REVOKE ALL ON FUNCTION public.upload_cleanup_record_run(text, boolean, timestamptz, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upload_cleanup_record_run(text, boolean, timestamptz, jsonb, text) TO service_role;

-- 5) conferência de arquivos que sumiram do Storage: agora com o motivo, e todo dia (03:40)
CREATE OR REPLACE FUNCTION public.media_assets_reconcile() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, storage AS $$
DECLARE v_n integer;
BEGIN
    UPDATE public.media_assets m SET state = 'deleted', deleted_at = now(), deleted_reason = COALESCE(m.deleted_reason, 'missing')
    WHERE m.state = 'ready' AND m.provider = 'supabase'
      AND NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = m.bucket AND o.name = m.key);
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RETURN v_n;
END; $$;
REVOKE ALL ON FUNCTION public.media_assets_reconcile() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.media_assets_reconcile() TO service_role;

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'media-assets-reconcile';
SELECT cron.schedule('media-assets-reconcile', '40 3 * * *', $job$SELECT public.media_assets_reconcile()$job$);

-- ===== painel (só serviço) =====
-- Visão geral da limpeza: configuração, números, últimas rodadas e os arquivos marcados (os maiores primeiro).
CREATE OR REPLACE FUNCTION public.admin_upload_cleanup_overview() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT jsonb_build_object(
        'settings', (SELECT jsonb_build_object('enabled', s.cleanup_enabled, 'min_age_days', s.cleanup_min_age_days, 'quarantine_days', s.cleanup_quarantine_days, 'max_per_run', s.cleanup_max_per_run) FROM public.upload_settings s WHERE s.id),
        'eligible_kinds', COALESCE((SELECT jsonb_agg(k.label ORDER BY k.label) FROM public.upload_kinds k WHERE k.cleanup_eligible), '[]'::jsonb),
        'protected_kinds', COALESCE((SELECT jsonb_agg(k.label ORDER BY k.label) FROM public.upload_kinds k WHERE NOT k.cleanup_eligible), '[]'::jsonb),
        'counts', jsonb_build_object(
            'orphans', (SELECT count(*) FROM public.media_assets WHERE state = 'ready' AND orphan_since IS NOT NULL AND NOT keep),
            'orphan_bytes', (SELECT COALESCE(sum(bytes), 0) FROM public.media_assets WHERE state = 'ready' AND orphan_since IS NOT NULL AND NOT keep),
            'due', (SELECT count(*) FROM public.media_assets m, public.upload_settings s WHERE s.id AND m.state = 'ready' AND NOT m.keep AND m.orphan_since < now() - make_interval(days => s.cleanup_quarantine_days)),
            'kept', (SELECT count(*) FROM public.media_assets WHERE state = 'ready' AND keep),
            'deleted_total', (SELECT count(*) FROM public.media_assets WHERE state = 'deleted' AND deleted_reason = 'orphan'),
            'freed_bytes', (SELECT COALESCE(sum(bytes), 0) FROM public.media_assets WHERE state = 'deleted' AND deleted_reason = 'orphan')),
        'runs', COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.started_at DESC) FROM (SELECT * FROM public.upload_cleanup_runs ORDER BY started_at DESC LIMIT 6) r), '[]'::jsonb),
        'candidates', COALESCE((
            SELECT jsonb_agg(to_jsonb(c) ORDER BY c.keep, c.bytes DESC, c.orphan_since)     -- os marcados primeiro (maiores antes), os "mantidos" depois
            FROM (SELECT m.id, m.kind, k.label AS kind_label, m.bucket, m.key, m.bytes, m.created_at, m.orphan_since, m.keep,
                         COALESCE(m.orphan_since < now() - make_interval(days => s.cleanup_quarantine_days), false) AS due,
                         CASE WHEN m.orphan_since IS NULL THEN NULL ELSE GREATEST(0, s.cleanup_quarantine_days - floor(extract(epoch FROM (now() - m.orphan_since)) / 86400))::int END AS days_left
                  FROM public.media_assets m JOIN public.upload_kinds k ON k.kind = m.kind CROSS JOIN public.upload_settings s
                  WHERE s.id AND m.state = 'ready' AND (m.orphan_since IS NOT NULL OR m.keep) ORDER BY m.keep, m.bytes DESC LIMIT 30) c), '[]'::jsonb));
$$;
REVOKE ALL ON FUNCTION public.admin_upload_cleanup_overview() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_upload_cleanup_overview() TO service_role;

-- "Manter": o arquivo NUNCA é apagado pela limpeza (e sai da quarentena). p_keep = false volta ao normal.
CREATE OR REPLACE FUNCTION public.admin_upload_cleanup_keep(p_asset uuid, p_keep boolean, p_admin uuid DEFAULT NULL) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_old boolean; v_key text;
BEGIN
    SELECT keep, bucket || '/' || key INTO v_old, v_key FROM public.media_assets WHERE id = p_asset AND state = 'ready' FOR UPDATE;
    IF NOT FOUND THEN RETURN false; END IF;
    UPDATE public.media_assets SET keep = COALESCE(p_keep, false), orphan_since = CASE WHEN COALESCE(p_keep, false) THEN NULL ELSE orphan_since END WHERE id = p_asset;
    IF v_old IS DISTINCT FROM COALESCE(p_keep, false) THEN
        INSERT INTO public.admin_config_audit (scope, setting, old_value, new_value, changed_by) VALUES ('upload_cleanup', v_key, to_jsonb(v_old), to_jsonb(COALESCE(p_keep, false)), p_admin);
    END IF;
    RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.admin_upload_cleanup_keep(uuid, boolean, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_upload_cleanup_keep(uuid, boolean, uuid) TO service_role;

-- Configurações da limpeza: cleanup_enabled, cleanup_min_age_days, cleanup_quarantine_days, cleanup_max_per_run. Grava auditoria de cada campo que mudou.
CREATE OR REPLACE FUNCTION public.admin_upload_cleanup_settings(p_patch jsonb, p_admin uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    o public.upload_settings%ROWTYPE;
    n public.upload_settings%ROWTYPE;
    f text;
    v_allowed text[] := ARRAY['cleanup_enabled', 'cleanup_min_age_days', 'cleanup_quarantine_days', 'cleanup_max_per_run'];
BEGIN
    SELECT * INTO o FROM public.upload_settings WHERE id FOR UPDATE;
    FOR f IN SELECT jsonb_object_keys(COALESCE(p_patch, '{}'::jsonb)) LOOP
        IF NOT (f = ANY (v_allowed)) THEN RAISE EXCEPTION 'Campo não editável: %', f USING ERRCODE = '22023'; END IF;
    END LOOP;
    n := o;
    IF p_patch ? 'cleanup_enabled'         THEN n.cleanup_enabled         := (p_patch->>'cleanup_enabled')::boolean; END IF;
    IF p_patch ? 'cleanup_min_age_days'    THEN n.cleanup_min_age_days    := (p_patch->>'cleanup_min_age_days')::integer; END IF;
    IF p_patch ? 'cleanup_quarantine_days' THEN n.cleanup_quarantine_days := (p_patch->>'cleanup_quarantine_days')::integer; END IF;
    IF p_patch ? 'cleanup_max_per_run'     THEN n.cleanup_max_per_run     := (p_patch->>'cleanup_max_per_run')::integer; END IF;
    UPDATE public.upload_settings SET cleanup_enabled = n.cleanup_enabled, cleanup_min_age_days = n.cleanup_min_age_days, cleanup_quarantine_days = n.cleanup_quarantine_days,
           cleanup_max_per_run = n.cleanup_max_per_run, updated_at = now() WHERE id;
    FOR f IN SELECT unnest(v_allowed) LOOP
        IF to_jsonb(o)->f IS DISTINCT FROM to_jsonb(n)->f THEN
            INSERT INTO public.admin_config_audit (scope, setting, old_value, new_value, changed_by) VALUES ('upload_settings', f, to_jsonb(o)->f, to_jsonb(n)->f, p_admin);
        END IF;
    END LOOP;
    RETURN jsonb_build_object('enabled', n.cleanup_enabled, 'min_age_days', n.cleanup_min_age_days, 'quarantine_days', n.cleanup_quarantine_days, 'max_per_run', n.cleanup_max_per_run);
END; $$;
REVOKE ALL ON FUNCTION public.admin_upload_cleanup_settings(jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_upload_cleanup_settings(jsonb, uuid) TO service_role;
