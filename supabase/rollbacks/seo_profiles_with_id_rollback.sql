DROP FUNCTION IF EXISTS public.seo_public_profiles();
CREATE FUNCTION public.seo_public_profiles()
RETURNS TABLE (profile_slug text, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    SELECT p."profileSlug", p.created_at FROM public.profiles p
    WHERE p."profileSlug" IS NOT NULL AND (p.is_blocked IS NULL OR p.is_blocked = false)
$$;
REVOKE ALL ON FUNCTION public.seo_public_profiles() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seo_public_profiles() TO service_role;
