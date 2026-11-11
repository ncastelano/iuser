-- Controle de uploads, Camada 5 (docs/CONTROLE-DE-UPLOADS.md): o que o painel Admin → Uploads precisa ler do banco.
--
--   upload_denials : cada recusa da autorização de envio (limite de ritmo, cota, bloqueio, tipo...) vira UMA linha por pessoa+tipo+motivo a cada 10 minutos, com um contador de tentativas
--                    (hits). Serve para o admin ver QUEM está sendo barrado e por quê, sem a tabela crescer a cada tentativa (quem insiste 1.000 vezes gera 1 linha com hits = 1000).
--   authorize_upload agora é um EMBRULHO fino sobre a função da 20261130000020 (renomeada para _authorize_upload_core, que só o banco chama): devolve exatamente a mesma resposta e,
--   se foi recusa (menos "sem login"), anota em upload_denials. Falha ao anotar NUNCA muda a resposta.
--   admin_upload_overview / admin_upload_top_owners / admin_upload_denials : leituras agregadas SÓ para o serviço (rota /api/admin/uploads, que exige o admin geral).
--   upload_grants_purge também apaga recusas com mais de 8 dias.
-- Tabelas sem acesso do app. Rollback: supabase/rollbacks/upload_admin_rollback.sql

CREATE TABLE IF NOT EXISTS public.upload_denials (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    kind       text REFERENCES public.upload_kinds(kind) ON DELETE CASCADE,
    code       text NOT NULL,
    hits       integer NOT NULL DEFAULT 1 CHECK (hits > 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    last_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS upload_denials_last_idx ON public.upload_denials (last_at DESC);
CREATE INDEX IF NOT EXISTS upload_denials_window_idx ON public.upload_denials (profile_id, kind, code, last_at DESC);
ALTER TABLE public.upload_denials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.upload_denials FROM anon, authenticated;
GRANT ALL ON public.upload_denials TO service_role;

-- anota uma recusa: soma na linha da mesma pessoa+tipo+motivo se houve uma nos últimos 10 min; senão cria. Nunca levanta erro.
CREATE OR REPLACE FUNCTION public._upload_log_denial(p_profile uuid, p_kind text, p_code text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
    SELECT d.id INTO v_id FROM public.upload_denials d
    WHERE d.profile_id = p_profile AND d.kind IS NOT DISTINCT FROM p_kind AND d.code = p_code AND d.last_at > now() - interval '10 minutes'
    ORDER BY d.last_at DESC LIMIT 1;
    IF FOUND THEN
        UPDATE public.upload_denials SET hits = hits + 1, last_at = now() WHERE id = v_id;
    ELSE
        INSERT INTO public.upload_denials (profile_id, kind, code) VALUES (p_profile, p_kind, p_code);
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;   -- anotar é contabilidade: nunca derruba nem muda a resposta da autorização
END; $$;
REVOKE ALL ON FUNCTION public._upload_log_denial(uuid, text, text) FROM PUBLIC, anon, authenticated;

-- a função de 20261130000020 vira o "núcleo" (só o banco a chama) e authorize_upload passa a ser o embrulho que anota recusas. Seguro para rodar de novo.
DO $$
BEGIN
    IF to_regprocedure('public._authorize_upload_core(text,text,bigint,text,boolean)') IS NULL THEN
        ALTER FUNCTION public.authorize_upload(text, text, bigint, text, boolean) RENAME TO _authorize_upload_core;
    END IF;
END $$;
REVOKE ALL ON FUNCTION public._authorize_upload_core(text, text, bigint, text, boolean) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.authorize_upload(p_bucket text, p_path text, p_bytes bigint, p_mime text, p_upsert boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    r      jsonb;
    v_uid  uuid := auth.uid();
    v_kind text;
BEGIN
    r := public._authorize_upload_core(p_bucket, p_path, p_bytes, p_mime, p_upsert);
    IF v_uid IS NOT NULL AND COALESCE((r->>'ok')::boolean, false) IS NOT TRUE AND COALESCE(r->>'error', '') <> 'not_authenticated' THEN
        SELECT k.kind INTO v_kind FROM public.upload_kinds k WHERE k.bucket = p_bucket ORDER BY k.enabled DESC, k.kind LIMIT 1;
        PERFORM public._upload_log_denial(v_uid, v_kind, COALESCE(r->>'error', 'unknown'));
    END IF;
    RETURN r;
END; $$;
REVOKE ALL ON FUNCTION public.authorize_upload(text, text, bigint, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.authorize_upload(text, text, bigint, text, boolean) TO authenticated;

-- ===== leituras do painel (só serviço) =====
-- Visão geral: interruptor, totais e UMA linha por tipo (limites + uso + atividade das últimas 24 h).
CREATE OR REPLACE FUNCTION public.admin_upload_overview() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT jsonb_build_object(
        'enforced', COALESCE((SELECT s.signed_required FROM public.upload_settings s WHERE s.id), false),
        'totals', jsonb_build_object(
            'files',         (SELECT count(*) FROM public.media_assets WHERE state = 'ready'),
            'bytes',         (SELECT COALESCE(sum(bytes), 0) FROM public.media_assets WHERE state = 'ready'),
            'owners',        (SELECT count(DISTINCT owner_id) FROM public.media_assets WHERE state = 'ready' AND owner_id IS NOT NULL),
            'unknown_owner_files', (SELECT count(*) FROM public.media_assets WHERE state = 'ready' AND owner_id IS NULL),
            'grants_1h',     (SELECT count(*) FROM public.upload_grants WHERE created_at > now() - interval '1 hour'),
            'grants_24h',    (SELECT count(*) FROM public.upload_grants WHERE created_at > now() - interval '24 hours'),
            'denials_24h',   (SELECT COALESCE(sum(hits), 0) FROM public.upload_denials WHERE last_at > now() - interval '24 hours'),
            'blocks_active', (SELECT count(*) FROM public.upload_blocks WHERE lifted_at IS NULL AND (blocked_until IS NULL OR blocked_until > now()))
        ),
        'kinds', COALESCE((
            SELECT jsonb_agg(to_jsonb(t) ORDER BY t.bytes DESC, t.kind)
            FROM (
                SELECT k.kind, k.label, k.bucket, k.provider, k.max_bytes, k.mime_types, k.enabled, k.requires_plan, k.owner_folder,
                       k.per_hour_files, k.per_day_bytes, k.per_user_bytes, k.grant_minutes,
                       COALESCE(u.files, 0)::bigint AS files, COALESCE(u.bytes, 0)::bigint AS bytes, COALESCE(u.owners, 0)::bigint AS owners,
                       COALESCE(g.n, 0)::bigint AS grants_24h, COALESCE(g.b, 0)::bigint AS bytes_24h, COALESCE(d.n, 0)::bigint AS denials_24h
                FROM public.upload_kinds k
                LEFT JOIN (SELECT m.kind, count(*) AS files, sum(m.bytes) AS bytes, count(DISTINCT m.owner_id) AS owners
                           FROM public.media_assets m WHERE m.state = 'ready' GROUP BY m.kind) u ON u.kind = k.kind
                LEFT JOIN (SELECT x.kind, count(*) AS n, sum(COALESCE(x.actual_bytes, x.declared_bytes)) AS b
                           FROM public.upload_grants x WHERE x.created_at > now() - interval '24 hours' GROUP BY x.kind) g ON g.kind = k.kind
                LEFT JOIN (SELECT y.kind, sum(y.hits) AS n FROM public.upload_denials y WHERE y.last_at > now() - interval '24 hours' GROUP BY y.kind) d ON d.kind = k.kind
            ) t
        ), '[]'::jsonb)
    );
$$;
REVOKE ALL ON FUNCTION public.admin_upload_overview() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_upload_overview() TO service_role;

-- Quem mais ocupa espaço (todos os tipos ou um), com a atividade das últimas 24 h e se já está bloqueado. Só arquivos de dono conhecido.
CREATE OR REPLACE FUNCTION public.admin_upload_top_owners(p_kind text DEFAULT NULL, p_limit integer DEFAULT 15)
RETURNS TABLE (profile_id uuid, name text, slug text, files bigint, bytes bigint, files_24h bigint, bytes_24h bigint, blocked boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT m.owner_id, p.name, p."profileSlug", count(*)::bigint, COALESCE(sum(m.bytes), 0)::bigint,
           (SELECT count(*) FROM public.upload_grants g WHERE g.profile_id = m.owner_id AND (p_kind IS NULL OR g.kind = p_kind) AND g.created_at > now() - interval '24 hours')::bigint,
           (SELECT COALESCE(sum(COALESCE(g.actual_bytes, g.declared_bytes)), 0) FROM public.upload_grants g WHERE g.profile_id = m.owner_id AND (p_kind IS NULL OR g.kind = p_kind) AND g.created_at > now() - interval '24 hours')::bigint,
           EXISTS (SELECT 1 FROM public.upload_blocks b WHERE b.profile_id = m.owner_id AND b.lifted_at IS NULL AND (b.blocked_until IS NULL OR b.blocked_until > now()))
    FROM public.media_assets m
    JOIN public.profiles p ON p.id = m.owner_id
    WHERE m.state = 'ready' AND m.owner_id IS NOT NULL AND (p_kind IS NULL OR m.kind = p_kind)
    GROUP BY m.owner_id, p.name, p."profileSlug"
    ORDER BY sum(m.bytes) DESC, m.owner_id
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 15), 1), 100);
$$;
REVOKE ALL ON FUNCTION public.admin_upload_top_owners(text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_upload_top_owners(text, integer) TO service_role;

-- Quem está sendo barrado (últimas N horas), do que mais insiste para o que menos.
CREATE OR REPLACE FUNCTION public.admin_upload_denials(p_hours integer DEFAULT 24, p_limit integer DEFAULT 20)
RETURNS TABLE (profile_id uuid, name text, slug text, kind text, code text, hits bigint, last_at timestamptz, blocked boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT d.profile_id, p.name, p."profileSlug", d.kind, d.code, sum(d.hits)::bigint, max(d.last_at),
           EXISTS (SELECT 1 FROM public.upload_blocks b WHERE b.profile_id = d.profile_id AND b.lifted_at IS NULL AND (b.blocked_until IS NULL OR b.blocked_until > now()))
    FROM public.upload_denials d
    JOIN public.profiles p ON p.id = d.profile_id
    WHERE d.last_at > now() - make_interval(hours => LEAST(GREATEST(COALESCE(p_hours, 24), 1), 168))
    GROUP BY d.profile_id, p.name, p."profileSlug", d.kind, d.code
    ORDER BY sum(d.hits) DESC, max(d.last_at) DESC
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
$$;
REVOKE ALL ON FUNCTION public.admin_upload_denials(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_upload_denials(integer, integer) TO service_role;

-- a limpeza diária também apaga recusas antigas (devolve o total de linhas apagadas)
CREATE OR REPLACE FUNCTION public.upload_grants_purge() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_g integer; v_d integer;
BEGIN
    DELETE FROM public.upload_grants WHERE created_at < now() - interval '8 days';
    GET DIAGNOSTICS v_g = ROW_COUNT;
    DELETE FROM public.upload_denials WHERE last_at < now() - interval '8 days';
    GET DIAGNOSTICS v_d = ROW_COUNT;
    RETURN v_g + v_d;
END; $$;
REVOKE ALL ON FUNCTION public.upload_grants_purge() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upload_grants_purge() TO service_role;
