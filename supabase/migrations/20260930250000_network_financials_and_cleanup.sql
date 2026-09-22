-- 1) "Meu status" mostrava 5 permissões de concessão (uma por plano antigo:
-- motorista/prestador/loja/recrutador/combo) — como só sobrou um plano
-- concedível (pre_pago, já mapeado em grant_combo_plan desde a migração
-- anterior), as outras 4 não liberam mais nada. Nada mais referencia esses
-- slugs (plans.grant_permission já ficou NULL pra eles), então dá pra
-- apagar de vez — o CASCADE limpa status_permissions/user_permissions.
DELETE FROM public.permissions
    WHERE slug IN ('grant_driver_plan', 'grant_provider_plan', 'grant_store_plan', 'grant_recruiter_plan');

-- 2) "Minha Rede" ganha 3 números financeiros por pessoa da rede:
--    - plan_price: quanto ela paga por ciclo no plano ativo (pré-pago tem
--      preço; pós-pago é 0, a cobrança dele é por evento, não mensalidade)
--    - postpaid_debt: quanto ela já deve acumulado no pós-pago (o que ela
--      "promete" pagar quando quitar via Pix)
-- Mesma função de sempre (RETURNS TABLE muda de forma, precisa recriar).
DROP FUNCTION IF EXISTS public.get_referral_commission_summary();

CREATE FUNCTION public.get_referral_commission_summary()
RETURNS TABLE(
    downline_id uuid,
    name text,
    avatar_url text,
    profile_slug text,
    joined_at timestamptz,
    active_plans text,
    plan_price numeric,
    postpaid_debt numeric,
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
            SELECT sum(pl.price)
            FROM public.subscriptions s
            JOIN public.plans pl ON pl.id = s.plan_id
            WHERE s.user_id = p.id AND s.status = 'active' AND s.current_period_end > now()
        ), 0) AS plan_price,
        public.get_driver_postpaid_debt(p.id) AS postpaid_debt,
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
