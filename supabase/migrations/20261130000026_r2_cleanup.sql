-- Limpeza de arquivos sem uso, agora também no Cloudflare R2 (depende da 20261130000022, da 23 e da 24). As MESMAS travas da limpeza do Supabase: só o que o banco registrou e nenhuma coluna cita
-- (quarentena de 7 dias, idade mínima, nova conferência no ato, disjuntor, nasce desligada), mais um caso que só existe no R2: o objeto SOLTO, enviado e nunca registrado (a pessoa fechou o app no meio).
-- Só VÍDEO (mp4, webm, mov): a busca de referências (`_media_cited_names`) só conhece essas extensões, então áudio NUNCA entra na limpeza (um áudio em uso seria apagado por engano). Quando houver
-- uso real de áudio, a busca aprende as extensões antes de o áudio entrar aqui.
-- Quem apaga é o servidor (rotina `lib/uploadCleanup.ts`, pela API do R2); o banco só marca, confere e confirma.
-- Rollback: supabase/rollbacks/r2_cleanup_rollback.sql

-- 1) o candidato pode ser do Supabase OU do R2 (o provedor do arquivo tem de ser o do tipo); a extensão de vídeo/foto continua valendo (áudio não casa e fica de fora)
CREATE OR REPLACE FUNCTION public._media_cleanup_candidate(m public.media_assets, k public.upload_kinds, s public.upload_settings) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
    SELECT m.state = 'ready' AND NOT m.keep AND k.cleanup_eligible AND m.provider = k.provider AND m.provider IN ('supabase', 'r2')
       AND m.key ~ '^[A-Za-z0-9._/-]+$' AND m.key !~ '(^|/)\.\.(/|$)' AND split_part(m.key, '/', -1) ~* '\.(jpe?g|png|webp|gif|avif|mp4|webm|mov)$'
       AND (m.provider = 'supabase' OR split_part(m.key, '/', -1) ~* '\.(mp4|webm|mov)$')
       AND m.created_at < now() - make_interval(days => s.cleanup_min_age_days);
$$;
REVOKE ALL ON FUNCTION public._media_cleanup_candidate(public.media_assets, public.upload_kinds, public.upload_settings) FROM PUBLIC, anon, authenticated;

UPDATE public.upload_kinds SET cleanup_eligible = true WHERE kind = 'media_r2';

-- 2) a lista do que já pode ser apagado passa a dizer de qual provedor é cada arquivo (a rotina apaga do R2 pela API do R2 e do Supabase pela API do Storage)
DROP FUNCTION IF EXISTS public.upload_cleanup_due(integer);
CREATE FUNCTION public.upload_cleanup_due(p_limit integer DEFAULT NULL) RETURNS TABLE (id uuid, bucket text, key text, bytes bigint, provider text)
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
    SELECT * INTO s FROM public.upload_settings us WHERE us.id;
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
    RETURN QUERY SELECT m.id, m.bucket, m.key, m.bytes, m.provider FROM public.media_assets m WHERE m.id = ANY (v_ids) AND m.orphan_since IS NOT NULL ORDER BY m.orphan_since, m.id;
END; $$;
REVOKE ALL ON FUNCTION public.upload_cleanup_due(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upload_cleanup_due(integer) TO service_role;

-- 3) objeto SOLTO no R2: dos caminhos recebidos (`<id>/<uuid>.<ext>`), devolve os que o banco CONHECE (têm registro pronto, ou o nome é citado em alguma coluna, como o vídeo de um flash).
--    O que não volta daqui, e é antigo e tem o nome padrão, é lixo de envio abandonado. Qualquer dúvida (nome citado em qualquer lugar) conta como "conhecido".
CREATE OR REPLACE FUNCTION public.r2_known_keys(p_keys text[]) RETURNS text[]
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public SET statement_timeout = '120s' AS $$
DECLARE v_cited text[];
BEGIN
    IF p_keys IS NULL OR cardinality(p_keys) = 0 THEN RETURN '{}'; END IF;
    v_cited := public._media_cited_names((SELECT array_agg(DISTINCT lower(split_part(k, '/', -1))) FROM unnest(p_keys) k));
    RETURN COALESCE((
        SELECT array_agg(k) FROM unnest(p_keys) k
        WHERE EXISTS (SELECT 1 FROM public.media_assets m WHERE m.provider = 'r2' AND m.key = k AND m.state = 'ready')
           OR lower(split_part(k, '/', -1)) = ANY (v_cited)), '{}');
END; $$;
REVOKE ALL ON FUNCTION public.r2_known_keys(text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.r2_known_keys(text[]) TO service_role;
