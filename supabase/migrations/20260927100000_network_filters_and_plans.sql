-- A visão de rede do Administrador ganha filtros (todos / por convite / sem
-- convite / por status) e mostra os planos ativos de cada pessoa.
DROP FUNCTION IF EXISTS public.list_network_internal(uuid, uuid, text, integer, integer);
CREATE FUNCTION public.list_network_internal(
    p_actor uuid, p_parent uuid DEFAULT NULL, p_search text DEFAULT NULL,
    p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_filter text DEFAULT 'all'
) RETURNS TABLE(
    id uuid, name text, profile_slug text, avatar_url text, created_at timestamptz,
    upline_id uuid, upline_name text, upline_slug text,
    status_slug text, status_name text, status_level integer, children_count bigint,
    active_plans text[]
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public STABLE
AS $$
DECLARE
    v_q text := btrim(COALESCE(p_search, ''));
    v_filter text := COALESCE(p_filter, 'all');
BEGIN
    IF NOT public.has_permission(p_actor, 'manage_hierarchy') THEN RETURN; END IF;

    RETURN QUERY
    SELECT p.id, p.name, p."profileSlug", p.avatar_url, p.created_at,
           p.upline_id, u.name, u."profileSlug",
           COALESCE(s.slug, 'usuario'), COALESCE(s.name, 'Usuário'), COALESCE(s.level, 0),
           (SELECT count(*) FROM public.profiles c WHERE c.upline_id = p.id),
           COALESCE((
               SELECT array_agg(DISTINCT pl.code)
               FROM public.subscriptions sb JOIN public.plans pl ON pl.id = sb.plan_id
               WHERE sb.user_id = p.id AND sb.status = 'active'
                 AND (sb.starts_at IS NULL OR sb.starts_at <= now()) AND sb.current_period_end > now()
           ), ARRAY[]::text[])
    FROM public.profiles p
    LEFT JOIN public.profiles u ON u.id = p.upline_id
    LEFT JOIN public.user_statuses s ON s.id = p.status_id
    WHERE (CASE
            WHEN v_q <> '' THEN (p.name ILIKE '%' || v_q || '%' OR p."profileSlug" ILIKE '%' || v_q || '%')
            WHEN p_parent IS NOT NULL THEN p.upline_id = p_parent
            ELSE true
          END)
      AND (CASE
            WHEN p_parent IS NOT NULL AND v_q = '' THEN true
            WHEN v_filter = 'invited' THEN p.upline_id IS NOT NULL
            WHEN v_filter = 'roots' THEN p.upline_id IS NULL
            WHEN v_filter LIKE 'status:%' THEN COALESCE(s.slug, 'usuario') = substr(v_filter, 8)
            ELSE true
          END)
    ORDER BY p.created_at DESC
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200)
    OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$$;
REVOKE ALL ON FUNCTION public.list_network_internal(uuid, uuid, text, integer, integer, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_network_internal(uuid, uuid, text, integer, integer, text) TO service_role;
