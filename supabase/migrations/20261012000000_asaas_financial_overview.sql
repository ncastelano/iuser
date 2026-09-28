-- Mapeamento financeiro do Asaas pro painel Financeiro > Asaas do admin:
-- receita de assinatura, dívida de pós-pago recebida, passivo de carteira
-- (o que devemos pagar pra quem tem saldo) e dívida de pós-pago em aberto
-- (o que as pessoas ainda nos devem). Uma função só (mesmo padrão de
-- get_database_stats) evita 6+ round-trips separados do painel.
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

        -- Receita de assinatura já recebida (subscription_payments), total e mês corrente.
        'subscription_revenue_total', COALESCE((SELECT sum(amount) FROM public.subscription_payments), 0),
        'subscription_revenue_this_month', COALESCE((
            SELECT sum(amount) FROM public.subscription_payments WHERE created_at >= date_trunc('month', now())
        ), 0),

        -- Pós-pago já recebido (linhas type='payment', valor negativo no ledger), total e mês corrente.
        'postpaid_collected_total', COALESCE((
            SELECT -sum(amount) FROM public.driver_postpaid_charges WHERE type = 'payment'
        ), 0),
        'postpaid_collected_this_month', COALESCE((
            SELECT -sum(amount) FROM public.driver_postpaid_charges WHERE type = 'payment' AND created_at >= date_trunc('month', now())
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
