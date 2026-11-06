-- Desfaz 20261130000026_r2_cleanup.sql: a limpeza volta a olhar só o Supabase. Os arquivos do R2 não são tocados.
UPDATE public.upload_kinds SET cleanup_eligible = false WHERE kind = 'media_r2';
DROP FUNCTION IF EXISTS public.r2_known_keys(text[]);
DROP FUNCTION IF EXISTS public.upload_cleanup_due(integer);
CREATE FUNCTION public.upload_cleanup_due(p_limit integer DEFAULT NULL) RETURNS TABLE (id uuid, bucket text, key text, bytes bigint)
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
    RETURN QUERY SELECT m.id, m.bucket, m.key, m.bytes FROM public.media_assets m WHERE m.id = ANY (v_ids) AND m.orphan_since IS NOT NULL ORDER BY m.orphan_since, m.id;
END; $$;
REVOKE ALL ON FUNCTION public.upload_cleanup_due(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upload_cleanup_due(integer) TO service_role;
CREATE OR REPLACE FUNCTION public._media_cleanup_candidate(m public.media_assets, k public.upload_kinds, s public.upload_settings) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
    SELECT m.state = 'ready' AND NOT m.keep AND k.cleanup_eligible AND k.provider = 'supabase' AND m.provider = 'supabase'
       AND m.key ~ '^[A-Za-z0-9._/-]+$' AND m.key !~ '(^|/)\.\.(/|$)' AND split_part(m.key, '/', -1) ~* '\.(jpe?g|png|webp|gif|avif|mp4|webm|mov)$'
       AND m.created_at < now() - make_interval(days => s.cleanup_min_age_days);
$$;
REVOKE ALL ON FUNCTION public._media_cleanup_candidate(public.media_assets, public.upload_kinds, public.upload_settings) FROM PUBLIC, anon, authenticated;
