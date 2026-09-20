-- Histórico real de pagamentos recebidos por assinatura — antes disso só
-- existia status/current_period_end, então "receita" na aba de pagamentos
-- do admin era uma estimativa (plan.price × ativos), sem distinguir quem
-- pagou de quem ganhou o plano de graça. Só o webhook (service role)
-- escreve aqui; só /api/admin/* (service role) lê.
CREATE TABLE IF NOT EXISTS public.subscription_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id UUID NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
    asaas_payment_id TEXT NOT NULL,
    amount NUMERIC(10,2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS subscription_payments_asaas_payment_idx
    ON public.subscription_payments (asaas_payment_id);
CREATE INDEX IF NOT EXISTS subscription_payments_subscription_idx
    ON public.subscription_payments (subscription_id);

ALTER TABLE public.subscription_payments ENABLE ROW LEVEL SECURITY;
