-- 20261130000131 — leituras de SEO no servidor sem tocar colunas privadas de profiles (bloqueio). Só o SERVIÇO executa
-- (sitemap.xml e dados estruturados rodam no servidor com a chave de serviço). Rollback: supabase/rollbacks/seo_public_lists_rollback.sql
CREATE OR REPLACE FUNCTION public.seo_public_profiles()
RETURNS TABLE (profile_slug text, created_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT p."profileSlug", p.created_at
    FROM public.profiles p
    WHERE p."profileSlug" IS NOT NULL
      AND (p.is_blocked IS NULL OR p.is_blocked = false)
$$;

CREATE OR REPLACE FUNCTION public.seo_profile_card(p_slug text)
RETURNS TABLE (name text, profile_slug text, avatar_url text, is_active boolean, is_blocked boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT p.name, p."profileSlug", p.avatar_url, p.is_active, p.is_blocked
    FROM public.profiles p
    WHERE p."profileSlug" = p_slug
    LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.seo_public_profiles() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.seo_profile_card(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seo_public_profiles() TO service_role;
GRANT EXECUTE ON FUNCTION public.seo_profile_card(text) TO service_role;
