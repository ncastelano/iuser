-- 20261130000132 — o sitemap precisa do id do perfil para ligar as publicações pessoais ao endereço delas. Só o serviço executa.
-- Rollback: supabase/rollbacks/seo_profiles_with_id_rollback.sql
DROP FUNCTION IF EXISTS public.seo_public_profiles();
CREATE FUNCTION public.seo_public_profiles()
RETURNS TABLE (id uuid, profile_slug text, created_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT p.id, p."profileSlug", p.created_at
    FROM public.profiles p
    WHERE p."profileSlug" IS NOT NULL
      AND (p.is_blocked IS NULL OR p.is_blocked = false)
    ORDER BY p.id
$$;
REVOKE ALL ON FUNCTION public.seo_public_profiles() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seo_public_profiles() TO service_role;
