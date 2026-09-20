-- Visão do Administrador sobre a rede: todas as pessoas, quem convidou quem
-- (profiles.upline_id) e o status de cada uma. Só service role; a rota confere
-- manage_hierarchy e a função confere de novo.
CREATE OR REPLACE FUNCTION public.list_network_internal(
    p_actor uuid, p_parent uuid DEFAULT NULL, p_search text DEFAULT NULL,
    p_limit integer DEFAULT 50, p_offset integer DEFAULT 0
) RETURNS TABLE(
    id uuid, name text, profile_slug text, avatar_url text, created_at timestamptz,
    upline_id uuid, upline_name text, upline_slug text,
    status_slug text, status_name text, status_level integer, children_count bigint
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public STABLE
AS $$
DECLARE
    v_q text := btrim(COALESCE(p_search, ''));
BEGIN
    IF NOT public.has_permission(p_actor, 'manage_hierarchy') THEN RETURN; END IF;

    RETURN QUERY
    SELECT p.id, p.name, p."profileSlug", p.avatar_url, p.created_at,
           p.upline_id, u.name, u."profileSlug",
           COALESCE(s.slug, 'usuario'), COALESCE(s.name, 'Usuário'), COALESCE(s.level, 0),
           (SELECT count(*) FROM public.profiles c WHERE c.upline_id = p.id)
    FROM public.profiles p
    LEFT JOIN public.profiles u ON u.id = p.upline_id
    LEFT JOIN public.user_statuses s ON s.id = p.status_id
    WHERE CASE
        WHEN v_q <> '' THEN (p.name ILIKE '%' || v_q || '%' OR p."profileSlug" ILIKE '%' || v_q || '%')
        WHEN p_parent IS NOT NULL THEN p.upline_id = p_parent
        ELSE p.upline_id IS NULL
    END
    ORDER BY p.created_at DESC
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200)
    OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.network_summary_internal(p_actor uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public STABLE
AS $$
BEGIN
    IF NOT public.has_permission(p_actor, 'manage_hierarchy') THEN RETURN NULL; END IF;
    RETURN jsonb_build_object(
        'total', (SELECT count(*) FROM public.profiles),
        'roots', (SELECT count(*) FROM public.profiles WHERE upline_id IS NULL),
        'invited', (SELECT count(*) FROM public.profiles WHERE upline_id IS NOT NULL),
        'by_status', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('slug', x.slug, 'name', x.name, 'level', x.level, 'count', x.cnt) ORDER BY x.level)
            FROM (
                SELECT COALESCE(s.slug, 'usuario') AS slug, COALESCE(s.name, 'Usuário') AS name,
                       COALESCE(s.level, 0) AS level, count(*) AS cnt
                FROM public.profiles p LEFT JOIN public.user_statuses s ON s.id = p.status_id
                GROUP BY 1, 2, 3
            ) x
        ), '[]'::jsonb)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.list_network_internal(uuid, uuid, text, integer, integer) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.network_summary_internal(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_network_internal(uuid, uuid, text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.network_summary_internal(uuid) TO service_role;
