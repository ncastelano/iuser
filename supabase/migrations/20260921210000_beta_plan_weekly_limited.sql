-- Plano "Beta" de teste: R$5,00 (mínimo cobrável da Asaas), mesmas
-- concessões do Combo, renovação semanal em vez de mensal, e limitado a
-- 20 vagas — serve pro dono testar o fluxo real de cobrança/webhook/
-- comissão/saque repetidas vezes sem precisar do valor cheio do Combo.

-- Ciclo de cobrança por plano — até aqui createSubscription sempre
-- mandava 'MONTHLY' fixo pra Asaas.
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS billing_cycle TEXT NOT NULL DEFAULT 'MONTHLY'
    CHECK (billing_cycle IN ('WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY', 'SEMIANNUALLY', 'YEARLY'));

-- Vagas limitadas por plano (null = sem limite, como todos os outros).
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS max_active_subscriptions INTEGER;

ALTER TABLE public.plans DROP CONSTRAINT IF EXISTS plans_code_check;
ALTER TABLE public.plans ADD CONSTRAINT plans_code_check
    CHECK (code IN ('motorista', 'prestador', 'loja', 'recrutador', 'combo', 'beta'));

INSERT INTO public.plans (code, name, price, grants_driver, grants_provider, grants_store, grants_recruiter, is_active, description, billing_cycle, max_active_subscriptions, features)
VALUES (
    'beta',
    'Beta (teste)',
    5.00,
    true, true, true, true,
    true,
    'Plano de teste com as mesmas liberações do Combo, por uma fração do valor — vagas bem limitadas.',
    'WEEKLY',
    20,
    ARRAY[
        'Libera motorista + prestador + loja + recrutador, igual o Combo',
        'Renovação semanal de R$5,00',
        'Vagas limitadas — enquanto durar'
    ]
)
ON CONFLICT (code) DO NOTHING;

-- Contagem pública de assinantes por plano (só o número, nunca quem é) —
-- pra /planos mostrar "vagas restantes" e travar o botão quando esgotar,
-- sem expor nenhuma linha de public.subscriptions (RLS só deixa o dono ver
-- a própria).
CREATE FUNCTION public.get_plan_subscriber_counts()
RETURNS TABLE(plan_id uuid, active_count bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT s.plan_id, count(*) AS active_count
    FROM public.subscriptions s
    WHERE s.status IN ('pending', 'active')
    GROUP BY s.plan_id;
$$;

REVOKE ALL ON FUNCTION public.get_plan_subscriber_counts() FROM public;
GRANT EXECUTE ON FUNCTION public.get_plan_subscriber_counts() TO authenticated, anon;
