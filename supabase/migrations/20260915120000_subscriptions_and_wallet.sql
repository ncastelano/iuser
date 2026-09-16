-- Assinaturas pagas (criar loja / ser motorista / ser prestador) + comissão
-- de indicação de 1 nível só, valor fixo (nunca porcentagem, nunca em
-- cascata) sobre quem cada usuário indicou diretamente via profiles.upline_id
-- (já existente e populado pelo fluxo /convite). Substitui a ideia anterior
-- de MLM de 5 níveis por porcentagem, que nunca chegou a ser aplicada.

-- ===== PLANOS =====
CREATE TABLE IF NOT EXISTS public.plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL CHECK (code IN ('motorista', 'prestador', 'loja', 'combo')),
    name TEXT NOT NULL,
    price NUMERIC(10, 2) NOT NULL CHECK (price > 0),
    grants_driver BOOLEAN NOT NULL DEFAULT false,
    grants_provider BOOLEAN NOT NULL DEFAULT false,
    grants_store BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO public.plans (code, name, price, grants_driver, grants_provider, grants_store) VALUES
    ('motorista', 'Motorista', 0.80, true, false, false),
    ('prestador', 'Prestador de serviço', 0.50, false, true, false),
    ('loja', 'Loja', 0.70, false, false, true),
    ('combo', 'Combo (loja + motorista + prestador)', 1.00, true, true, true)
ON CONFLICT (code) DO NOTHING;

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Qualquer um pode ver os planos" ON public.plans FOR SELECT USING (true);
-- Sem política de INSERT/UPDATE pra authenticated: preço só muda via SQL
-- direto (service role) — dá pra reajustar (ex: R$100) sem precisar de deploy.

-- ===== ASSINATURAS =====
CREATE TABLE IF NOT EXISTS public.subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES public.plans(id),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'past_due', 'canceled')),
    asaas_customer_id TEXT,
    asaas_subscription_id TEXT,
    current_period_end TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS subscriptions_user_idx ON public.subscriptions (user_id);
CREATE INDEX IF NOT EXISTS subscriptions_asaas_subscription_idx ON public.subscriptions (asaas_subscription_id);
-- Evita 2 assinaturas "em aberto" (pendente ou ativa) pro mesmo plano.
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_user_plan_open_idx
    ON public.subscriptions (user_id, plan_id) WHERE status IN ('pending', 'active');

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Usuário vê suas próprias assinaturas" ON public.subscriptions FOR SELECT USING (auth.uid() = user_id);
-- Sem política de INSERT/UPDATE/DELETE pra authenticated: só a rota de
-- compra e o webhook (service role) escrevem aqui.

-- ===== CARTEIRA (ledger — saldo = SUM(amount), nunca coluna mutável) =====
CREATE TABLE IF NOT EXISTS public.wallet_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('commission_credit', 'withdrawal_debit')),
    amount NUMERIC(10, 2) NOT NULL,
    source_subscription_id UUID REFERENCES public.subscriptions(id),
    source_payment_id TEXT,
    withdrawal_request_id UUID,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wallet_transactions_user_idx ON public.wallet_transactions (user_id);
-- Dedupe: o webhook da Asaas pode reentregar o mesmo evento de pagamento —
-- isso impede creditar comissão 2x pro mesmo pagamento.
CREATE UNIQUE INDEX IF NOT EXISTS wallet_tx_commission_dedupe_idx
    ON public.wallet_transactions (source_payment_id) WHERE type = 'commission_credit';

ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Usuário vê seus próprios lançamentos" ON public.wallet_transactions FOR SELECT USING (auth.uid() = user_id);
-- Sem política de INSERT pra authenticated: só webhook e rota de saque
-- (ambas service role) criam lançamento.

-- ===== PEDIDOS DE SAQUE =====
CREATE TABLE IF NOT EXISTS public.withdrawal_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
    pix_key TEXT NOT NULL,
    pix_key_type TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'rejected')),
    admin_notes TEXT,
    requested_at TIMESTAMPTZ DEFAULT now(),
    resolved_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES public.profiles(id)
);
CREATE INDEX IF NOT EXISTS withdrawal_requests_user_idx ON public.withdrawal_requests (user_id);
CREATE INDEX IF NOT EXISTS withdrawal_requests_status_idx ON public.withdrawal_requests (status);

ALTER TABLE public.withdrawal_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Usuário vê seus próprios pedidos de saque" ON public.withdrawal_requests FOR SELECT USING (auth.uid() = user_id);
-- Sem política de INSERT/UPDATE pra authenticated: a rota de saque
-- (service role) recalcula o saldo real antes de inserir, e a tela de
-- admin (service role, reconfere is_admin no servidor) marca como pago.

ALTER TABLE public.wallet_transactions
    ADD CONSTRAINT wallet_transactions_withdrawal_request_fkey
    FOREIGN KEY (withdrawal_request_id) REFERENCES public.withdrawal_requests(id);

-- ===== FLAG DE ADMIN (pra tela de conferir/marcar saques como pagos) =====
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;
UPDATE public.profiles p SET is_admin = true
    FROM auth.users u WHERE u.id = p.id AND u.email = 'ncastelano@gmail.com';
