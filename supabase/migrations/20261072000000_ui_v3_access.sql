-- Acesso à interface 3.0: LIBERADO PELO ADMINISTRADOR, perfil a perfil (ou para todos, com a chave ui_v3).
--   * ui_v3_access: quem tem permissão. A pessoa só LÊ a própria linha; só o administrador (chave de serviço, pela rota
--     /api/admin/ui-access) concede ou revoga — assim ninguém se auto-libera.
--   * feature_flags.ui_v3 passa a significar "liberada para TODOS" e volta a ficar DESLIGADA por padrão.
-- Nada disso toca dados, planos, permissões ou saldos: é só a porta da interface nova.

CREATE TABLE IF NOT EXISTS public.ui_v3_access (
    profile_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    granted_at timestamptz NOT NULL DEFAULT now(),
    granted_by uuid
);
ALTER TABLE public.ui_v3_access ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Cada pessoa vê o próprio acesso" ON public.ui_v3_access;
CREATE POLICY "Cada pessoa vê o próprio acesso" ON public.ui_v3_access FOR SELECT TO authenticated USING (profile_id = auth.uid());

UPDATE public.feature_flags SET enabled = false, updated_at = now() WHERE key = 'ui_v3';
INSERT INTO public.feature_flags (key, enabled) VALUES ('ui_v3', false) ON CONFLICT (key) DO NOTHING;
