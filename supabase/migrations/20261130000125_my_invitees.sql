-- Painel do perfil: a lista de QUEM EU CONVIDEI (quem entrou pelo meu link) e a pontuação de cada um, sem abrir a página de convidados.
-- Só devolve quem tem upline_id = a própria pessoa logada. Sem comissão, sem telefone, sem e-mail.
-- Rollback: supabase/rollbacks/my_invitees_rollback.sql
CREATE OR REPLACE FUNCTION public.get_my_invitees(p_limit integer DEFAULT 50)
RETURNS TABLE(id uuid, name text, profile_slug text, avatar_url text, joined_at timestamptz, points integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    SELECT p.id, p.name, p."profileSlug", p.avatar_url, p.created_at, COALESCE(pp.total, 0)::integer
      FROM public.profiles p
      LEFT JOIN public.profile_points pp ON pp.profile_id = p.id
     WHERE auth.uid() IS NOT NULL AND p.upline_id = auth.uid()
     ORDER BY p.created_at DESC
     LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
$$;
REVOKE ALL ON FUNCTION public.get_my_invitees(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_invitees(integer) TO authenticated, service_role;
