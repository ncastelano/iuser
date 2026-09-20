-- Assinaturas da Asaas que não deu pra cancelar na hora (chave da API
-- inválida, Asaas fora do ar...) ao excluir uma conta. A exclusão segue e o
-- cancelamento fica registrado aqui pra ser refeito depois. Sem FK pra
-- profiles: a conta já não existe mais quando o cancelamento é refeito.
CREATE TABLE IF NOT EXISTS public.asaas_pending_cancellations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asaas_subscription_id TEXT NOT NULL UNIQUE,
    user_id UUID,
    last_error TEXT,
    attempts INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.asaas_pending_cancellations ENABLE ROW LEVEL SECURITY;
-- sem policies: só service role
