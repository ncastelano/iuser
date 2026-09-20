-- Papel "Líder de Motoristas": quem tem esse papel pode conceder plano de
-- motorista sem cobrar, mas só pra quem ele mesmo convidou (upline_id).
-- Mesmo padrão pragmático já usado no projeto (um boolean, não uma tabela
-- de roles genérica — só existe hoje o e-mail fixo de super-admin).
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_lider_motorista BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_source_check;
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_source_check
    CHECK (source IN ('asaas', 'admin_grant', 'code', 'leader_grant'));

-- Trava explícita de quais planos um líder pode conceder — não basta ter
-- grants_driver=true (o combo também tem), precisa estar nessa lista.
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS leader_grantable BOOLEAN NOT NULL DEFAULT false;
UPDATE public.plans SET leader_grantable = true WHERE code = 'motorista';

-- Versão do grant do admin, mas como RPC chamável pelo próprio usuário
-- autenticado (não é super-admin, não pode usar a rota service-role) e
-- restrita ao próprio downline direto.
CREATE OR REPLACE FUNCTION public.grant_driver_plan_as_leader(
    p_profile_slug text, p_plan_code text, p_days integer
)
RETURNS public.subscriptions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_is_leader boolean;
    v_target_id uuid;
    v_plan_id uuid;
    v_leader_grantable boolean;
    v_period_end timestamptz;
    v_existing_id uuid;
    v_sub public.subscriptions;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Não autenticado';
    END IF;

    SELECT is_lider_motorista INTO v_is_leader FROM public.profiles WHERE id = auth.uid();
    IF NOT COALESCE(v_is_leader, false) THEN
        RAISE EXCEPTION 'Sem permissão de líder de motoristas';
    END IF;

    IF p_days IS NULL OR p_days <= 0 THEN
        RAISE EXCEPTION 'Número de dias inválido';
    END IF;

    SELECT id INTO v_target_id FROM public.profiles
        WHERE "profileSlug" = p_profile_slug AND upline_id = auth.uid();
    IF v_target_id IS NULL THEN
        RAISE EXCEPTION 'Essa pessoa não foi indicada por você';
    END IF;

    SELECT id, leader_grantable INTO v_plan_id, v_leader_grantable
        FROM public.plans WHERE code = p_plan_code;
    IF v_plan_id IS NULL OR NOT COALESCE(v_leader_grantable, false) THEN
        RAISE EXCEPTION 'Esse plano não pode ser concedido por um líder';
    END IF;

    v_period_end := now() + make_interval(days => p_days);

    SELECT id INTO v_existing_id FROM public.subscriptions
        WHERE user_id = v_target_id AND plan_id = v_plan_id AND status IN ('pending', 'active')
        FOR UPDATE;

    IF v_existing_id IS NOT NULL THEN
        UPDATE public.subscriptions
        SET status = 'active', source = 'leader_grant', current_period_end = v_period_end,
            granted_by = auth.uid(), updated_at = now()
        WHERE id = v_existing_id
        RETURNING * INTO v_sub;
    ELSE
        INSERT INTO public.subscriptions (user_id, plan_id, status, source, current_period_end, granted_by)
        VALUES (v_target_id, v_plan_id, 'active', 'leader_grant', v_period_end, auth.uid())
        RETURNING * INTO v_sub;
    END IF;

    RETURN v_sub;
END;
$$;
REVOKE ALL ON FUNCTION public.grant_driver_plan_as_leader(text, text, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.grant_driver_plan_as_leader(text, text, integer) TO authenticated;

-- Lista de quem o líder convidou (upline_id = auth.uid()), com o status
-- atual do plano motorista de cada um. Sempre travada em auth.uid(), mesmo
-- padrão de get_referral_commission_summary.
CREATE OR REPLACE FUNCTION public.get_driver_leader_downline()
RETURNS TABLE(
    downline_id uuid,
    name text,
    avatar_url text,
    profile_slug text,
    joined_at timestamptz,
    driver_plan_active boolean,
    driver_plan_code text,
    driver_plan_source text,
    driver_plan_expires_at timestamptz
)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$
    SELECT
        p.id,
        p.name,
        p.avatar_url,
        p."profileSlug",
        p.created_at,
        EXISTS (
            SELECT 1 FROM public.subscriptions s
            JOIN public.plans pl ON pl.id = s.plan_id
            WHERE s.user_id = p.id AND s.status = 'active' AND s.current_period_end > now() AND pl.grants_driver
        ),
        (SELECT pl.code FROM public.subscriptions s JOIN public.plans pl ON pl.id = s.plan_id
            WHERE s.user_id = p.id AND s.status = 'active' AND s.current_period_end > now() AND pl.grants_driver
            ORDER BY s.current_period_end DESC LIMIT 1),
        (SELECT s.source FROM public.subscriptions s JOIN public.plans pl ON pl.id = s.plan_id
            WHERE s.user_id = p.id AND s.status = 'active' AND s.current_period_end > now() AND pl.grants_driver
            ORDER BY s.current_period_end DESC LIMIT 1),
        (SELECT s.current_period_end FROM public.subscriptions s JOIN public.plans pl ON pl.id = s.plan_id
            WHERE s.user_id = p.id AND s.status = 'active' AND s.current_period_end > now() AND pl.grants_driver
            ORDER BY s.current_period_end DESC LIMIT 1)
    FROM public.profiles p
    WHERE p.upline_id = auth.uid()
    ORDER BY p.created_at DESC;
$$;
REVOKE ALL ON FUNCTION public.get_driver_leader_downline() FROM public;
GRANT EXECUTE ON FUNCTION public.get_driver_leader_downline() TO authenticated;
