-- Total de PESSOAS que visitaram a página da loja (não o número de visitas).
-- Conta identidades distintas em store_visits: viewer_id (logado) ou anonymous_id (visitante).
-- Só devolve o número: nenhuma linha de visita sai do banco.

CREATE OR REPLACE FUNCTION public.get_store_visitor_count(p_store_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT count(DISTINCT COALESCE(v.viewer_id::text, v.anonymous_id))::integer
    FROM public.store_visits v
    WHERE v.store_id = p_store_id
      AND COALESCE(v.viewer_id::text, v.anonymous_id) IS NOT NULL;
$$;

REVOKE EXECUTE ON FUNCTION public.get_store_visitor_count(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_store_visitor_count(uuid) TO anon, authenticated, service_role;
