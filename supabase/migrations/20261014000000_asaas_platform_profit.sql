-- Corrige o "lucro da plataforma": receita de assinatura/pós-pago
-- (subscription_revenue_*, postpaid_collected_*) é o BRUTO que entrou —
-- uma parte disso é repasse de comissão pra quem indicou (50% flat, ver
-- credit_referral_commission), não é dinheiro da iUser. O lucro de verdade
-- é bruto menos comissão creditada. Sem isso, "Receita/mês" no Resumo do
-- Financeiro contava o repasse como se fosse receita própria.
CREATE OR REPLACE FUNCTION public.get_asaas_financial_overview()
RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$
    SELECT jsonb_build_object(
        -- Assinaturas ativas (MRR) e contagem por status.
        'mrr', COALESCE((
            SELECT sum(p.price) FROM public.subscriptions s
            JOIN public.plans p ON p.id = s.plan_id
            WHERE s.status = 'active' AND (s.current_period_end IS NULL OR s.current_period_end > now())
        ), 0),
        'active_subscriptions', (SELECT count(*) FROM public.subscriptions WHERE status = 'active'),
        'past_due_subscriptions', (SELECT count(*) FROM public.subscriptions WHERE status = 'past_due'),
        'canceled_subscriptions', (SELECT count(*) FROM public.subscriptions WHERE status = 'canceled'),

        -- Receita de assinatura já recebida (subscription_payments), total e mês corrente — BRUTO.
        'subscription_revenue_total', COALESCE((SELECT sum(amount) FROM public.subscription_payments), 0),
        'subscription_revenue_this_month', COALESCE((
            SELECT sum(amount) FROM public.subscription_payments WHERE created_at >= date_trunc('month', now())
        ), 0),

        -- Pós-pago já recebido (linhas type='payment', valor negativo no ledger), total e mês corrente — BRUTO.
        'postpaid_collected_total', COALESCE((
            SELECT -sum(amount) FROM public.driver_postpaid_charges WHERE type = 'payment'
        ), 0),
        'postpaid_collected_this_month', COALESCE((
            SELECT -sum(amount) FROM public.driver_postpaid_charges WHERE type = 'payment' AND created_at >= date_trunc('month', now())
        ), 0),

        -- Comissão de indicação creditada (repasse — não é receita da
        -- iUser, é dinheiro que já nasce devido a quem indicou), total e
        -- mês corrente. Subtrai do bruto acima pra achar o lucro real.
        'commission_credited_total', COALESCE((
            SELECT sum(amount) FROM public.wallet_transactions WHERE type = 'commission_credit'
        ), 0),
        'commission_credited_this_month', COALESCE((
            SELECT sum(amount) FROM public.wallet_transactions WHERE type = 'commission_credit' AND created_at >= date_trunc('month', now())
        ), 0),

        -- Carteira das pessoas: passivo total (quanto devemos, se todo mundo sacasse agora)
        -- e quantas pessoas têm saldo positivo pra sacar.
        'wallet_liability_total', COALESCE((SELECT sum(amount) FROM public.wallet_transactions), 0),
        'wallet_positive_users', (
            SELECT count(*) FROM (
                SELECT user_id FROM public.wallet_transactions GROUP BY user_id HAVING sum(amount) > 0
            ) t
        ),

        -- Saques já solicitados e ainda não pagos — passivo de curto prazo.
        'pending_withdrawals_total', COALESCE((SELECT sum(amount) FROM public.withdrawal_requests WHERE status = 'pending'), 0),
        'pending_withdrawals_count', (SELECT count(*) FROM public.withdrawal_requests WHERE status = 'pending'),

        -- O que cada pessoa ainda nos deve no pós-pago (dívida em aberto) e
        -- quantas estão bloqueadas (>= R$50, mesmo limiar de get_driver_postpaid_debt).
        'postpaid_debt_outstanding_total', COALESCE((
            SELECT sum(balance) FROM (
                SELECT sum(amount) AS balance FROM public.driver_postpaid_charges GROUP BY driver_id HAVING sum(amount) > 0
            ) t
        ), 0),
        'postpaid_debt_users_count', (
            SELECT count(*) FROM (
                SELECT driver_id FROM public.driver_postpaid_charges GROUP BY driver_id HAVING sum(amount) > 0
            ) t
        ),
        'postpaid_debt_blocked_count', (
            SELECT count(*) FROM (
                SELECT driver_id FROM public.driver_postpaid_charges GROUP BY driver_id HAVING sum(amount) >= 50
            ) t
        )
    );
$$;
REVOKE ALL ON FUNCTION public.get_asaas_financial_overview() FROM public;
GRANT EXECUTE ON FUNCTION public.get_asaas_financial_overview() TO service_role;
