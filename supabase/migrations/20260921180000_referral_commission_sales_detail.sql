-- "Convidei para o iUser" vai virar uma carteira de verdade por pessoa
-- indicada — não só o total acumulado, mas o extrato de cada venda que
-- gerou comissão (plano, valor, data). Recria a função (mesmo motivo de
-- sempre: RETURNS TABLE muda de forma) acrescentando a coluna `sales`.
DROP FUNCTION IF EXISTS public.get_referral_commission_summary();

CREATE FUNCTION public.get_referral_commission_summary()
RETURNS TABLE(
    downline_id uuid,
    name text,
    avatar_url text,
    profile_slug text,
    joined_at timestamptz,
    active_plans text,
    commission_total numeric,
    sales json
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
        ), 0) AS commission_total,
        (
            SELECT COALESCE(json_agg(json_build_object(
                'plan_name', pl3.name,
                'amount', w3.amount,
                'date', w3.created_at
            ) ORDER BY w3.created_at DESC), '[]'::json)
            FROM public.wallet_transactions w3
            JOIN public.subscriptions s3 ON s3.id = w3.source_subscription_id
            JOIN public.plans pl3 ON pl3.id = s3.plan_id
            WHERE s3.user_id = p.id
                AND w3.user_id = auth.uid()
                AND w3.type = 'commission_credit'
        ) AS sales
    FROM public.profiles p
    WHERE p.upline_id = auth.uid()
    ORDER BY p.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.get_referral_commission_summary() FROM public;
GRANT EXECUTE ON FUNCTION public.get_referral_commission_summary() TO authenticated;
