-- Saque automático via API de transferência da Asaas (substitui o "admin
-- clica pago e manda o PIX na mão"). Precisa de campos novos pra guardar o
-- id da transferência (auditoria/idempotência) e o motivo quando a Asaas
-- recusa (saldo insuficiente na conta, chave inválida etc) — nesse caso o
-- pedido fica 'failed' em vez de 'paid', sem debitar a carteira do usuário.
ALTER TABLE public.withdrawal_requests
    ADD COLUMN IF NOT EXISTS asaas_transfer_id TEXT,
    ADD COLUMN IF NOT EXISTS failure_reason TEXT;

ALTER TABLE public.withdrawal_requests DROP CONSTRAINT IF EXISTS withdrawal_requests_status_check;
ALTER TABLE public.withdrawal_requests ADD CONSTRAINT withdrawal_requests_status_check
    CHECK (status IN ('pending', 'paid', 'rejected', 'failed'));
