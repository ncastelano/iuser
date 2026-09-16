-- "Convidei para o iUser" (Commission.tsx) precisa mostrar, pra cada
-- pessoa indicada: qual plano ela tem ativo agora e quanto o indicador já
-- ganhou de comissão especificamente por causa dela. subscriptions e
-- wallet_transactions só deixam o dono ler a própria linha (RLS), então o
-- indicador não consegue ler isso das pessoas que ele indicou direto do
-- client — daí essa função security definer, sempre lida a partir do
-- próprio auth.uid() (nunca de um p_user_id arbitrário, pra não vazar
-- comissão/plano de outra pessoa).
CREATE OR REPLACE FUNCTION public.get_referral_commission_summary()
RETURNS TABLE(
    downline_id uuid,
    name text,
    avatar_url text,
    profile_slug text,
    joined_at timestamptz,
    active_plans text,
    commission_total numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT
        p.id AS downline_id,
        p.name,
        p.avatar_url,
        p."profileSlug" AS profile_slug,
        p.created_at AS joined_at,
        (
            SELECT string_agg(pl.name, ' + ' ORDER BY pl.price DESC)
            FROM public.subscriptions s
            JOIN public.plans pl ON pl.id = s.plan_id
            WHERE s.user_id = p.id AND s.status = 'active' AND s.current_period_end > now()
        ) AS active_plans,
        COALESCE((
            SELECT sum(w.amount)
            FROM public.wallet_transactions w
            JOIN public.subscriptions s2 ON s2.id = w.source_subscription_id
            WHERE s2.user_id = p.id
                AND w.user_id = auth.uid()
                AND w.type = 'commission_credit'
        ), 0) AS commission_total
    FROM public.profiles p
    WHERE p.upline_id = auth.uid()
    ORDER BY p.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.get_referral_commission_summary() FROM public;
GRANT EXECUTE ON FUNCTION public.get_referral_commission_summary() TO authenticated;
