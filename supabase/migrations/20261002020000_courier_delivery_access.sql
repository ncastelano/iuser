-- Entregadores próprios da loja: link permanente e sem login pra cada
-- funcionário ver as entregas atribuídas a ele e marcar o progresso
-- (peguei/entreguei). `employees` e `delivery_assignments` não têm nenhuma
-- migration anterior rastreada (vivem só no Supabase ao vivo) - tudo aqui é
-- aditivo (`IF NOT EXISTS`), sem mexer em constraint nenhuma existente.

ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS access_token TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS employees_access_token_idx
    ON public.employees (access_token) WHERE access_token IS NOT NULL;

-- Quando o entregador marca "peguei"/"entreguei" na própria página, além do
-- status (que já existe e já tem esse vocabulário pronto: pending/in_transit/
-- delivered), grava quando cada coisa aconteceu.
ALTER TABLE public.delivery_assignments ADD COLUMN IF NOT EXISTS picked_up_at TIMESTAMPTZ;
ALTER TABLE public.delivery_assignments ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
