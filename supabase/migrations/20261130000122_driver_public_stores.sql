-- Perfil do motorista: mostra TODAS as lojas ativas da pessoa, como uma pequena propaganda (só se ela tiver loja).
-- Dado público (o mesmo do cartão da loja). Sem telefone, Pix ou endereço. Rollback: supabase/rollbacks/driver_public_stores_rollback.sql
CREATE OR REPLACE FUNCTION public.get_driver_public_stores(p_driver uuid)
RETURNS TABLE(store_id uuid, name text, slug text, logo_url text, category text, ratings_avg numeric, ratings_count integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    SELECT s.id, s.name, s."storeSlug", s.logo_url, s.category, s.ratings_avg::numeric, COALESCE(s.ratings_count, 0)::integer
      FROM public.stores s
     WHERE s.owner_id = p_driver AND s.is_active
     ORDER BY s.created_at
     LIMIT 6;
$$;
REVOKE ALL ON FUNCTION public.get_driver_public_stores(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_driver_public_stores(uuid) TO anon, authenticated, service_role;
