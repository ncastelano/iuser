-- Plano resgatável: 3 meses grátis do Pré-pago, contados a partir do dia em que a
-- pessoa resgata. Vale pra quem já está no Pós-pago e pra quem está chegando; é uma
-- vez só por pessoa (CPF/CNPJ e aparelho únicos, igual ao pós-pago, pra não dar pra
-- repetir o resgate criando outra conta).

-- 1) A assinatura do teste tem origem própria ("free_trial"), pra aparecer como tal
--    no admin e em /planos.
ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_source_check;
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_source_check
    CHECK (source IN ('asaas', 'admin_grant', 'code', 'leader_grant', 'postpaid', 'free_trial'));

-- 2) Quem já resgatou. Uma linha por pessoa, CPF/CNPJ e aparelho únicos.
CREATE TABLE IF NOT EXISTS public.free_trial_claims (
    profile_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    cpf_cnpj TEXT NOT NULL UNIQUE,
    device_id TEXT NOT NULL UNIQUE,
    subscription_id UUID REFERENCES public.subscriptions(id) ON DELETE SET NULL,
    claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ends_at TIMESTAMPTZ NOT NULL
);

ALTER TABLE public.free_trial_claims ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Usuário vê o próprio resgate do teste grátis" ON public.free_trial_claims
    FOR SELECT USING (auth.uid() = profile_id);
-- Sem política de INSERT/UPDATE/DELETE: só a rota /api/subscriptions/free-trial
-- (service role) grava aqui.

-- 3) Durante o teste do Pré-pago ninguém paga por serviço: o pós-pago só cobra quando
--    a pessoa NÃO tem um Pré-pago ativo. Acabou o teste, volta a cobrar sozinho.
CREATE OR REPLACE FUNCTION public.is_postpaid_user(p_user_id uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.subscriptions s
        JOIN public.plans p ON p.id = s.plan_id
        WHERE s.user_id = p_user_id AND p.code = 'pos_pago'
          AND s.status = 'active'
          AND (s.starts_at IS NULL OR s.starts_at <= now())
          AND s.current_period_end > now()
    )
    AND NOT EXISTS (
        SELECT 1 FROM public.subscriptions s
        JOIN public.plans p ON p.id = s.plan_id
        WHERE s.user_id = p_user_id AND p.code = 'pre_pago'
          AND s.status = 'active'
          AND (s.starts_at IS NULL OR s.starts_at <= now())
          AND s.current_period_end > now()
    );
$$;
